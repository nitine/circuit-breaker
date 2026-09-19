import { cfg, features } from "./config";
import { polly } from "./aws";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PIPER_DIR = process.env.PIPER_DIR ?? path.resolve(process.cwd(), "..", "tools", "piper");
const PIPER_BIN = process.env.PIPER_BIN ?? path.join(PIPER_DIR, ".venv", "bin", "piper");
const VOICES: Record<string, string> = { male: "en_US-ryan-medium", female: "en_US-lessac-medium", gb: "en_GB-alan-medium", "hi-male": "hi_IN-rohan-medium", "hi-female": "hi_IN-priyamvada-medium" };
export function piperHasHindi() { return existsSync(path.join(PIPER_DIR, "voices", VOICES["hi-male"] + ".onnx")); }
export function piperAvailable() { return existsSync(PIPER_BIN) && existsSync(path.join(PIPER_DIR, "voices", VOICES.male + ".onnx")); }

function wavHeader(pcmBytes: number, rate: number) {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0); b.writeUInt32LE(36 + pcmBytes, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(pcmBytes, 40);
  return b;
}

/** Local neural TTS via Piper (English voices only). */
export function piperSynth(text: string, voice: "male" | "female" | "gb" | "hi-male" | "hi-female" = "male"): Promise<{ audio: string; mime: string } | null> {
  return new Promise((resolve) => {
    if (!piperAvailable()) return resolve(null);
    const model = path.join(PIPER_DIR, "voices", (VOICES[voice] ?? VOICES.male) + ".onnx");
    const proc = spawn(PIPER_BIN, ["--model", model, "--output_raw", "--length_scale", "1.05", "--sentence_silence", "0.25"], { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const pcm = Buffer.concat(chunks);
      if (!pcm.length) return resolve(null);
      const wav = Buffer.concat([wavHeader(pcm.length, 22050), pcm]);
      resolve({ audio: wav.toString("base64"), mime: "audio/wav" });
    });
    proc.stdin.end(text.replace(/[\u{1F300}-\u{1FAFF}]/gu, "") + "\n");
  });
}

export async function synth(text: string, lang: "en" | "hi" | "kn", voiceHint = "male"): Promise<{ audio: string; mime: string } | null> {
  if (!features().polly) {
    const female = voiceHint.includes("female");
    if (lang === "hi") return piperHasHindi() ? piperSynth(text, female ? "hi-female" : "hi-male") : null;
    return piperSynth(text, female ? "female" : voiceHint === "gb" ? "gb" : "male");
  }
  try {
    const client = await polly();
    const { SynthesizeSpeechCommand } = await import("@aws-sdk/client-polly");
    const voice = lang === "hi" ? cfg.pollyVoiceHi : cfg.pollyVoiceEn;
    const out = await client.send(new SynthesizeSpeechCommand({
      Text: text.slice(0, 1500),
      VoiceId: voice as never,
      Engine: cfg.pollyEngine as never,
      OutputFormat: "mp3",
      LanguageCode: (lang === "hi" ? "hi-IN" : "en-IN") as never,
    }));
    const bytes = await out.AudioStream?.transformToByteArray();
    if (!bytes) return null;
    return { audio: Buffer.from(bytes).toString("base64"), mime: "audio/mpeg" };
  } catch (e) {
    console.warn("[tts] polly failed:", (e as Error).message);
    return null;
  }
}
