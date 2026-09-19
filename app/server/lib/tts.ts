import { cfg, features } from "./config";
import { polly } from "./aws";

export async function synth(text: string, lang: "en" | "hi" | "kn"): Promise<{ audio: string; mime: string } | null> {
  if (!features().polly) return null;
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
