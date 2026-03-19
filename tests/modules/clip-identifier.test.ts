import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ClipIdentifier } from "../../src/modules/clip-identifier";
import type { Config } from "../../src/config";
import type { Transcript, VideoMetadata } from "../../src/pipeline/types";

const config: Config = {
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "qwen3.5:9b",
  whisperModel: "base",
  maxParallelClips: 3,
  silenceThresholdDb: -35,
  silenceMinDuration: 0.8,
  outputWidth: 1080,
  outputHeight: 1920,
  clipSpeed: 1.2,
  maxClips: 0,
  preferYouTubeTranscripts: true,
  captionAnimate: true,
  paths: {
    data: "./data",
    output: "./output",
    assets: "./assets",
    subwaySurfers: "./assets/subway-surfers",
    checkpointDb: "./data/test.db",
  },
};

const transcript: Transcript = {
  source: "youtube",
  fullText: "First clip text. Second clip text.",
  language: "en",
  segments: [
    { text: "First clip text", start: 0, end: 35, duration: 35 },
    { text: "Second clip text", start: 40, end: 82, duration: 42 },
  ],
  srtPath: null,
};

const metadata: VideoMetadata = {
  videoId: "abc123",
  title: "History lecture",
  duration: 120,
  uploadDate: "2024-01-01",
  filePath: "/tmp/video.mp4",
};

describe("ClipIdentifier", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | null = null;

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
  });

  test("identify calls Ollama and returns sorted clip candidates", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            clips: [
              {
                title: "Second",
                hookLine: "Hook 2",
                startTime: 40,
                endTime: 82,
                reasoning: "Strong payoff",
                viralScore: 9,
                tags: ["history"],
              },
              {
                title: "First",
                hookLine: "Hook 1",
                startTime: 0,
                endTime: 35,
                reasoning: "Surprising fact",
                viralScore: 7,
                tags: ["fact"],
              },
            ],
          }),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const identifier = new ClipIdentifier(config);
    const clips = await identifier.identify(transcript, metadata);

    expect(fetchSpy).not.toBeNull();
    expect(fetchSpy!).toHaveBeenCalledTimes(1);
    expect(fetchSpy!.mock.calls[0]?.[0]).toBe("http://127.0.0.1:11434/api/generate");
    expect(clips).toHaveLength(2);
    expect(clips[0]?.title).toBe("Second");
    expect(clips[1]?.title).toBe("First");
  });

  test("identify strips markdown fences from Ollama responses", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response:
            '```json\n{\n  "clips": [{\n    "title": "Fenced",\n    "hookLine": "Hook",\n    "startTime": 10,\n    "endTime": 45,\n    "reasoning": "Good clip",\n    "viralScore": 8,\n    "tags": ["tag"]\n  }]\n}\n```',
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const identifier = new ClipIdentifier(config);
    const clips = await identifier.identify(transcript, metadata);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.title).toBe("Fenced");
  });
});
