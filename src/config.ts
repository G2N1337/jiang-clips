import { z } from "zod";

const configSchema = z.object({
  ollamaBaseUrl: z.string().url().default("http://127.0.0.1:11434"),
  ollamaModel: z.string().min(1).default("llama3.2"),
  whisperModel: z.enum(["tiny", "base", "small", "medium", "large"]).default("base"),
  maxParallelClips: z.coerce.number().int().min(1).max(10).default(3),
  silenceThresholdDb: z.coerce.number().default(-35),
  silenceMinDuration: z.coerce.number().default(0.8),
  outputWidth: z.coerce.number().default(1080),
  outputHeight: z.coerce.number().default(1920),
  clipSpeed: z.coerce.number().min(1).max(2).default(1.2),
  maxClips: z.coerce.number().int().min(0).default(0),
  preferYouTubeTranscripts: z.coerce.boolean().default(true),
  captionAnimate: z.coerce.boolean().default(true),
  paths: z
    .object({
      data: z.string().default("./data"),
      output: z.string().default("./output"),
      assets: z.string().default("./assets"),
      subwaySurfers: z.string().default("./assets/subway-surfers"),
      checkpointDb: z.string().default("./data/checkpoints.db"),
    })
    .default({}),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    ollamaBaseUrl: Bun.env.OLLAMA_BASE_URL,
    ollamaModel: Bun.env.OLLAMA_MODEL,
    whisperModel: Bun.env.WHISPER_MODEL,
    maxParallelClips: Bun.env.MAX_PARALLEL_CLIPS,
    silenceThresholdDb: Bun.env.SILENCE_THRESHOLD_DB,
    silenceMinDuration: Bun.env.SILENCE_MIN_DURATION,
    outputWidth: Bun.env.OUTPUT_WIDTH,
    outputHeight: Bun.env.OUTPUT_HEIGHT,
    clipSpeed: Bun.env.CLIP_SPEED,
    maxClips: Bun.env.MAX_CLIPS,
    preferYouTubeTranscripts: Bun.env.PREFER_YOUTUBE_TRANSCRIPTS,
    captionAnimate: Bun.env.CAPTION_ANIMATE,
    paths: {},
  });
}
