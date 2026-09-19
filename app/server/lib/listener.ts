import { features } from "./config";
import { transcribe } from "./aws";

/** Transcribe streaming session fed by pushed PCM16 chunks. */
export class TranscribeSession {
  private queue: Uint8Array[] = [];
  private waiting: (() => void) | null = null;
  private closed = false;
  running = false;

  constructor(private lang: "en-IN" | "hi-IN", private sampleRate: number, private onPartial: (t: string) => void, private onFinal: (t: string) => void) {}

  static available() { return features().transcribe; }

  push(chunk: Uint8Array) {
    if (this.closed) return;
    this.queue.push(chunk);
    this.waiting?.();
  }

  private async *audio() {
    while (!this.closed) {
      if (this.queue.length) { const c = this.queue.shift()!; yield { AudioEvent: { AudioChunk: c } }; continue; }
      await new Promise<void>((r) => { this.waiting = r; });
      this.waiting = null;
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      const client = await transcribe();
      const { StartStreamTranscriptionCommand } = await import("@aws-sdk/client-transcribe-streaming");
      const res = await client.send(new StartStreamTranscriptionCommand({
        LanguageCode: this.lang,
        MediaEncoding: "pcm",
        MediaSampleRateHertz: this.sampleRate,
        AudioStream: this.audio(),
        EnablePartialResultsStabilization: true,
        PartialResultsStability: "medium",
      }));
      for await (const evt of res.TranscriptResultStream ?? []) {
        const results = evt.TranscriptEvent?.Transcript?.Results ?? [];
        for (const r of results) {
          const text = r.Alternatives?.[0]?.Transcript?.trim();
          if (!text) continue;
          if (r.IsPartial) this.onPartial(text); else this.onFinal(text);
        }
      }
    } catch (e) {
      if (!this.closed) console.warn("[listener] transcribe stream ended:", (e as Error).message);
    } finally { this.running = false; }
  }

  stop() { this.closed = true; this.waiting?.(); }
}
