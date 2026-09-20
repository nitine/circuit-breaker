/** Audio in and out for the drill: playback with ducking, synthesized sound effects, mic capture to PCM16, browser speech fallbacks. */
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
const data = new Uint8Array(64);
let speakingUntil = 0;
let current: AudioBufferSourceNode | null = null;

export function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    gain = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 128;
    gain.connect(analyser); analyser.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.35; sfxGain.connect(ctx.destination);
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
export function stopPlayback() { try { current?.stop(); } catch { /* */ } current = null; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); speakingUntil = 0; }

// ---------------------------------------------------------------- browser TTS fallback
let voiceCache: SpeechSynthesisVoice[] = [];
function voices() { if (typeof speechSynthesis === "undefined") return []; if (!voiceCache.length) voiceCache = speechSynthesis.getVoices(); return voiceCache; }
function pickVoice(lang: string, female: boolean) {
  const all = voices();
  const byLang = all.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  const pool = byLang.length ? byLang : all;
  return pool.find((v) => /female|woman|kajal|veena|heera|zira|samantha/i.test(v.name) === female) ?? pool[0] ?? null;
}
export function hasBrowserVoices() { return voices().length > 0; }
export function speakFallback(text: string, lang = "en-IN", female = false, onEnd?: () => void) {
  if (typeof speechSynthesis === "undefined" || !voices().length) { speakingUntil = Date.now() + Math.min(12000, 400 + text.length * 45); setTimeout(() => { speakingUntil = 0; onEnd?.(); }, Math.min(12000, 400 + text.length * 45)); return; }
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

// ---------------------------------------------------------------- synthesized SFX (work without any voices)
type Stopper = { stop: () => void };
function tone(freq: number, t0: number, dur: number, type: OscillatorType = "sine", vol = 1, dest?: AudioNode) {
  const c = ensureAudio(); const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.setValueAtTime(vol, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g); g.connect(dest ?? sfxGain!); o.start(t0); o.stop(t0 + dur);
}
/** WhatsApp-style ringtone: a short melodic loop. */
export function ringtone(): Stopper {
  const c = ensureAudio(); let alive = true; let t = c.currentTime + 0.05;
  const loop = () => {
    if (!alive) return;
    const notes = [659, 784, 880, 784, 659, 587, 659];
    notes.forEach((f, i) => tone(f, t + i * 0.16, 0.14, "triangle", 0.5));
    t += 2.4; setTimeout(loop, 2300);
  };
  loop();
  return { stop: () => { alive = false; } };
}
/** Family ringtone: warmer, slower. */
export function familyRing(): Stopper {
  const c = ensureAudio(); let alive = true; let t = c.currentTime + 0.05;
  const loop = () => { if (!alive) return; [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.22, 0.4, "sine", 0.5)); t += 2.0; setTimeout(loop, 1900); };
  loop();
  return { stop: () => { alive = false; } };
}
export function chime() { const c = ensureAudio(); const t = c.currentTime + 0.02; tone(880, t, 0.09, "sine", 0.6); tone(1175, t + 0.1, 0.16, "sine", 0.6); }
export function click() { const c = ensureAudio(); tone(1800, c.currentTime + 0.005, 0.03, "square", 0.15); }
export function buzz() { const c = ensureAudio(); const t = c.currentTime + 0.02; tone(90, t, 0.25, "sawtooth", 0.5); tone(90, t + 0.35, 0.25, "sawtooth", 0.5); }
/** Scare-page alarm: the siren real scam pages play. */
export function alarm(): Stopper {
  const c = ensureAudio(); let alive = true;
  const o = c.createOscillator(); const g = c.createGain(); o.type = "square"; g.gain.value = 0.08; o.connect(g); g.connect(sfxGain!); o.start();
  const step = () => { if (!alive) return; const t = c.currentTime; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1100, t + 0.35); o.frequency.linearRampToValueAtTime(700, t + 0.7); setTimeout(step, 700); };
  step();
  return { stop: () => { alive = false; try { o.stop(); } catch { /* */ } } };
}
export function keyClicks(n: number, everyMs = 60) { for (let i = 0; i < n; i++) setTimeout(click, i * everyMs + Math.random() * 20); }

// ---------------------------------------------------------------- mic
export class Mic {
  private stream: MediaStream | null = null; private proc: ScriptProcessorNode | null = null; private src: MediaStreamAudioSourceNode | null = null;
  private hot = false; private hangover = 0; level = 0;
  constructor(private onChunk: (pcm: ArrayBuffer) => void, private onHot?: (hot: boolean) => void) {}
  async start() {
    const c = ensureAudio();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.src = c.createMediaStreamSource(this.stream); this.proc = c.createScriptProcessor(4096, 1, 1);
    const ratio = c.sampleRate / 16000;
    this.proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length); this.level = rms;
      const now = Date.now(); if (rms > 0.015) this.hangover = now + 900;
      const hot = now < this.hangover; if (hot !== this.hot) { this.hot = hot; this.onHot?.(hot); }
      if (!hot) return;
      const outLen = Math.floor(input.length / ratio); const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) { // box-filter downsample: average the source samples that map onto this output sample
        const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)); let acc = 0; for (let j = a; j < b && j < input.length; j++) acc += input[j];
        const s = Math.max(-1, Math.min(1, acc / (b - a))); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.onChunk(out.buffer);
    };
    // A ScriptProcessor only runs when connected to the graph; route it through a muted gain so the mic never plays back into the speakers.
    this.sink = c.createGain(); this.sink.gain.value = 0;
    this.src.connect(this.proc); this.proc.connect(this.sink); this.sink.connect(c.destination);
  }
  private sink: GainNode | null = null;
  get active() { return Boolean(this.stream); }
  stop() { this.proc?.disconnect(); this.src?.disconnect(); this.sink?.disconnect(); this.stream?.getTracks().forEach((t) => t.stop()); this.proc = null; this.src = null; this.sink = null; this.stream = null; this.hot = false; this.onHot?.(false); }
}

// Minimal typings for the Web Speech API (not in lib.dom for all TS configs).
interface SRResultAlt { transcript: string }
interface SRResult { isFinal: boolean; 0: SRResultAlt; length: number }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null; start(): void; stop(): void }
type SRCtor = new () => SR;
export function hasBrowserSTT() { const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }; return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition); }
/** Browser speech recognition (Chrome). Returns null if unavailable. */
export function browserRecognizer(lang: string, onFinal: (t: string) => void, onPartial: (t: string) => void, onError?: (msg: string) => void) {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = lang;
  let stopped = false;
  rec.onresult = (ev: SREvent) => { for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; const t = r[0].transcript.trim(); if (!t) continue; if (r.isFinal) onFinal(t); else onPartial(t); } };
  rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* */ } } };
  rec.onerror = (e) => { if (e?.error === "not-allowed" || e?.error === "network" || e?.error === "service-not-allowed") { stopped = true; onError?.(e.error); } };
  try { rec.start(); } catch { return null; }
  return { stop: () => { stopped = true; try { rec.stop(); } catch { /* */ } } };
}
