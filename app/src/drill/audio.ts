/** Audio in and out for the drill: playback with ducking, mic capture to PCM16, browser speech fallbacks. */
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
const data = new Uint8Array(64);
let speakingUntil = 0;
let current: AudioBufferSourceNode | null = null;

export function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    gain = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 128;
    gain.connect(analyser); analyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function duck(on: boolean) { if (gain && ctx) gain.gain.setTargetAtTime(on ? 0.18 : 1, ctx.currentTime, 0.1); }

/** 0..1 loudness of whatever is playing (or synthetic while speechSynthesis talks). */
export function level(): number {
  if (Date.now() < speakingUntil && !current) return 0.35 + Math.random() * 0.45;
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(data);
  let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / data.length) * 4);
}

export async function playBase64(b64: string, mime: string, onEnd?: () => void) {
  const c = ensureAudio();
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const buf = await c.decodeAudioData(bytes.buffer.slice(0));
  stopPlayback();
  const src = c.createBufferSource(); src.buffer = buf; src.connect(gain!); src.onended = () => { if (current === src) current = null; onEnd?.(); };
  current = src; src.start();
  void mime;
}
export function stopPlayback() { try { current?.stop(); } catch { /* */ } current = null; speechSynthesis?.cancel?.(); speakingUntil = 0; }

let voiceCache: SpeechSynthesisVoice[] = [];
function pickVoice(lang: string, female: boolean) {
  if (typeof speechSynthesis === "undefined") return null;
  if (!voiceCache.length) voiceCache = speechSynthesis.getVoices();
  const byLang = voiceCache.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  const pool = byLang.length ? byLang : voiceCache.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return pool.find((v) => /female|woman|kajal|veena|heera/i.test(v.name) === female) ?? pool[0] ?? null;
}
export function speakFallback(text: string, lang = "en-IN", female = false, onEnd?: () => void) {
  if (typeof speechSynthesis === "undefined") { onEnd?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang, female); if (v) u.voice = v;
  u.lang = lang; u.rate = 0.98; u.pitch = female ? 1.05 : 0.9;
  speakingUntil = Date.now() + Math.min(20000, 350 + text.length * 55);
  u.onend = () => { speakingUntil = 0; onEnd?.(); };
  u.onerror = () => { speakingUntil = 0; onEnd?.(); };
  speechSynthesis.speak(u);
}
if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = () => { voiceCache = speechSynthesis.getVoices(); };

/** Mic capture → 16 kHz PCM16 frames, gated by a simple RMS VAD. */
export class Mic {
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private hot = false;
  private hangover = 0;
  level = 0;
  constructor(private onChunk: (pcm: ArrayBuffer) => void, private onHot?: (hot: boolean) => void) {}

  async start() {
    const c = ensureAudio();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.src = c.createMediaStreamSource(this.stream);
    this.proc = c.createScriptProcessor(4096, 1, 1);
    const inRate = c.sampleRate; const outRate = 16000; const ratio = inRate / outRate;
    this.proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length); this.level = rms;
      const now = Date.now();
      if (rms > 0.015) this.hangover = now + 900;
      const hot = now < this.hangover;
      if (hot !== this.hot) { this.hot = hot; this.onHot?.(hot); }
      if (!hot) return;
      const outLen = Math.floor(input.length / ratio); const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) { const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
      this.onChunk(out.buffer);
    };
    this.src.connect(this.proc); this.proc.connect(c.destination);
  }
  stop() { this.proc?.disconnect(); this.src?.disconnect(); this.stream?.getTracks().forEach((t) => t.stop()); this.proc = null; this.src = null; this.stream = null; }
}

// Minimal typings for the Web Speech API (not in lib.dom for all TS configs).
interface SRResultAlt { transcript: string }
interface SRResult { isFinal: boolean; 0: SRResultAlt; length: number }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
type SRCtor = new () => SR;

/** Browser speech recognition (Chrome). Returns null if unavailable. */
export function browserRecognizer(lang: string, onFinal: (t: string) => void, onPartial: (t: string) => void) {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = lang;
  let stopped = false;
  rec.onresult = (ev: SREvent) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; const t = r[0].transcript.trim(); if (!t) continue; if (r.isFinal) onFinal(t); else onPartial(t); }
  };
  rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* */ } } };
  rec.onerror = () => { /* keep going via onend */ };
  try { rec.start(); } catch { return null; }
  return { stop: () => { stopped = true; try { rec.stop(); } catch { /* */ } } };
}
