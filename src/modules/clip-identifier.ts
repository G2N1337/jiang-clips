import { z } from "zod";
import { createLogger } from "../utils/logger";
import type { Config } from "../config";
import type { Transcript, VideoMetadata, ClipCandidate } from "../pipeline/types";

const log = createLogger("clip-identifier");

const CLIP_SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          hookLine: { type: "string" },
          startTime: { type: "number" },
          endTime: { type: "number" },
          reasoning: { type: "string" },
          viralScore: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "hookLine", "startTime", "endTime", "reasoning", "viralScore", "tags"],
      },
    },
  },
  required: ["clips"],
} as const;

const clipResponseSchema = z.object({
  clips: z.array(
    z.object({
      title: z.string(),
      hookLine: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      reasoning: z.string(),
      viralScore: z.number(),
      tags: z.array(z.string()),
    }),
  ),
});

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class ClipIdentifier {
  private ollamaBaseUrl: string;
  private ollamaModel: string;

  constructor(config: Config) {
    this.ollamaBaseUrl = config.ollamaBaseUrl.replace(/\/$/, "");
    this.ollamaModel = config.ollamaModel;
  }

  async identify(transcript: Transcript, metadata: VideoMetadata): Promise<ClipCandidate[]> {
    log.info(`Analyzing transcript for clip-worthy segments with Ollama (${this.ollamaModel})...`);

    const formattedTranscript = transcript.segments
      .map(
        (segment) => `[${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s] ${segment.text}`,
      )
      .join("\n");

    const prompt = `You are a viral content strategist specializing in history/education TikTok and YouTube Shorts.

Analyze this lecture transcript from "${metadata.title}" (total duration: ${metadata.duration} seconds) and identify segments that would make compelling short-form clips (30-90 seconds each).

Look for:
- Surprising or counterintuitive historical facts
- Dramatic storytelling moments
- Mind-blowing connections between historical events
- Controversial or thought-provoking claims
- Quotable one-liners or powerful statements
- "Did you know?" moments that make people stop scrolling

Each clip MUST:
- Be 30-90 seconds long
- Be self-contained (makes sense without surrounding context)
- Start with a hook that grabs attention in the first 3 seconds
- Have a clear payoff or revelation

IMPORTANT: The timestamps in the transcript are in SECONDS (e.g., 533.0s means 533 seconds into the video).
Return startTime and endTime as numbers in SECONDS (not minutes:seconds). For example, if a clip starts at 8 minutes 53 seconds, return startTime: 533.

Return ONLY valid JSON matching this schema. Do not include markdown fences or commentary.

TRANSCRIPT:
${formattedTranscript}

Return clips sorted by viralScore (highest first). Aim for 5-15 clips depending on video length.`;

    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: false,
        format: CLIP_SCHEMA,
        options: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed (${response.status} ${response.statusText}): ${body}`);
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    if (payload.error) {
      throw new Error(`Ollama returned an error: ${payload.error}`);
    }

    const text = payload.response?.trim() ?? "";
    if (!text) {
      throw new Error("Ollama returned an empty response while identifying clips");
    }

    const parsed = clipResponseSchema.parse(JSON.parse(this.extractJson(text)));

    log.info(
      `Ollama returned ${parsed.clips.length} raw clips (video duration: ${metadata.duration}s)`,
    );
    for (const clip of parsed.clips) {
      const duration = clip.endTime - clip.startTime;
      log.debug(
        `  "${clip.title}" ${clip.startTime}s-${clip.endTime}s (${duration.toFixed(0)}s) score=${clip.viralScore}`,
      );
    }

    const candidates: ClipCandidate[] = parsed.clips
      .filter((clip) => {
        const duration = clip.endTime - clip.startTime;
        if (
          duration < 15 ||
          duration > 120 ||
          clip.startTime < 0 ||
          clip.endTime > metadata.duration
        ) {
          log.debug(
            `  Filtered out: "${clip.title}" (dur=${duration.toFixed(0)}s, end=${clip.endTime}, max=${metadata.duration})`,
          );
          return false;
        }
        return true;
      })
      .map((clip) => ({
        id: crypto.randomUUID(),
        title: clip.title,
        hookLine: clip.hookLine,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.endTime - clip.startTime,
        reasoning: clip.reasoning,
        viralScore: clip.viralScore,
        tags: clip.tags,
      }))
      .sort((a, b) => b.viralScore - a.viralScore);

    log.info(`Identified ${candidates.length} clip candidates`);
    return candidates;
  }

  private extractJson(responseText: string): string {
    const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }
    return responseText;
  }
}
