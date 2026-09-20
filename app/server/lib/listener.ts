import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { features } from "./config";
import { transcribe } from "./aws";

export interface SttSession { start(): Promise<void> | void; push(chunk: Uint8Array): void; stop(): void; readonly kind: "transcribe" | "vosk" }
type Cb = (t: string) => void;

const VOICE_DIR = process.env.PIPER_DIR ?? path.resolve(process.cwd(), "..", "tools", "piper");
const PY = process.env.STT_PYTHON ?? path.join(VOICE_DIR, ".venv", "bin", "python");
const MODELS: Record<"en-IN" | "hi-IN", string> = { "en-IN": "vosk-model-small-en-in-0.4", "hi-IN": "vosk-model-small-hi-0.22" };
export function voskAvailable(lang: "en-IN" | "hi-IN" = "en-IN") { return existsSync(PY) && existsSync(path.join(VOICE_DIR, "models", MODELS[lang])); }

/** Local streaming STT: a Vosk worker process per session. */
export class VoskSession implements SttSession {
  readonly kind = "vosk" as const;
  private proc: ChildProcess | null = null;
  private closed = false;
  constructor(private lang: "en-IN" | "hi-IN", private sampleRate: number, private onPartial: Cb, private onFinal: Cb) {}
  start() {
    if (this.proc) return;
    const model = path.join(VOICE_DIR, "models", MODELS[this.lang]);
    const proc = spawn(PY, [path.join(VOICE_DIR, "stt_worker.py"), model, String(this.sampleRate)], { stdio: ["pipe", "pipe", "ignore"] });
    this.proc = proc;
    let buf = "";
    proc.stdout!.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const j = JSON.parse(line) as { partial?: string; text?: string }; if (j.text) this.onFinal(j.text); else if (j.partial) this.onPartial(j.partial); } catch { /* ignore */ }
      }
    });
    proc.on("error", (e) => { if (!this.closed) console.warn("[vosk] worker error", e.message); });
    proc.on("close", () => { this.proc = null; });
  }
  push(chunk: Uint8Array) { if (this.proc?.stdin && !this.closed) { try { this.proc.stdin.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)); } catch { /* */ } } }
  stop() { this.closed = true; try { this.proc?.stdin?.end(); } catch { /* */ } setTimeout(() => { try { this.proc?.kill(); } catch { /* */ } }, 1500); }
}

/** Transcribe streaming session fed by pushed PCM16 chunks. */
export class TranscribeSession implements SttSession {
  readonly kind = "transcribe" as const;
  private queue: Uint8Array[] = [];
  private waiting: (() => void) | null = null;
  private closed = false;
  running = false;
  constructor(private lang: "en-IN" | "hi-IN", private sampleRate: number, private onPartial: Cb, private onFinal: Cb) {}
  static available() { return features().transcribe; }
  push(chunk: Uint8Array) { if (this.closed) return; this.queue.push(chunk); this.waiting?.(); }
  private async *audio() {
    while (!this.closed) {
      if (this.queue.length) { const c = this.queue.shift()!; yield { AudioEvent: { AudioChunk: c } }; continue; }
      await new Promise<void>((r) => { this.waiting = r; }); this.waiting = null;
    }
  }
  async start() {
    if (this.running) return; this.running = true;
    try {
      const client = await transcribe();
      const { StartStreamTranscriptionCommand } = await import("@aws-sdk/client-transcribe-streaming");
      const res = await client.send(new StartStreamTranscriptionCommand({ LanguageCode: this.lang, MediaEncoding: "pcm", MediaSampleRateHertz: this.sampleRate, AudioStream: this.audio(), EnablePartialResultsStabilization: true, PartialResultsStability: "medium" }));
      for await (const evt of res.TranscriptResultStream ?? []) {
        for (const r of evt.TranscriptEvent?.Transcript?.Results ?? []) { const text = r.Alternatives?.[0]?.Transcript?.trim(); if (!text) continue; if (r.IsPartial) this.onPartial(text); else this.onFinal(text); }
      }
    } catch (e) { if (!this.closed) console.warn("[listener] transcribe stream ended:", (e as Error).message); } finally { this.running = false; }
  }
  stop() { this.closed = true; this.waiting?.(); }
}

export function createStt(lang: "en-IN" | "hi-IN", sampleRate: number, onPartial: Cb, onFinal: Cb): SttSession | null {
  if (TranscribeSession.available()) return new TranscribeSession(lang, sampleRate, onPartial, onFinal);
  if (voskAvailable(lang)) return new VoskSession(lang, sampleRate, onPartial, onFinal);
  return null;
}
export function sttMode(lang: "en-IN" | "hi-IN" = "en-IN"): "transcribe" | "vosk" | "none" { return TranscribeSession.available() ? "transcribe" : voskAvailable(lang) ? "vosk" : "none"; }
