import type { ClientEvent, ServerEvent, SignalKind, Tactic, Ending } from "~/shared/types";
import type { DrillRecord } from "./store";
import { touch } from "./store";
import { families, ontology } from "./corpus";
import { RedAgent } from "./redAgent";
import { Ladder } from "./guardian";
import * as analyst from "./analyst";
import * as archivist from "./archivist";
import { synth } from "./tts";
import { TranscribeSession } from "./listener";
import { filePacket } from "./reporter";

type Send = (e: ServerEvent) => void;
type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;
type Timer = ReturnType<typeof setTimeout>;

export class DrillSession {
  private seq = 0;
  private red: RedAgent;
  private ladder = new Ladder();
  private recentTactics: { tactic: Tactic; ts: number }[] = [];
  private timers: Timer[] = [];
  private listener: TranscribeSession | null = null;
  private partialBuf = "";
  private answered = false;
  private ended = false;
  private busy = false;
  private pendingJudge: string[] = [];
  private firedSignals = new Set<SignalKind>();
  private notifIdx = 0;
  private longCallTimer: Timer | null = null;

  constructor(readonly rec: DrillRecord, private send: Send) {
    const fam = families[rec.summary.family];
    this.red = new RedAgent(fam, rec.summary.world);
  }

  private emit(e: WithoutSeq<ServerEvent>) { this.send({ ...(e as ServerEvent), seq: ++this.seq }); }
  private later(ms: number, fn: () => void) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  private get fam() { return families[this.rec.summary.family]; }
  private get d() { return this.rec.summary; }
  private get lang(): "en" | "hi" | "kn" { return this.d.world.language === "kn" ? "en" : this.d.world.language; }

  start() {
    this.emit({ type: "drill.state", drill: this.d });
    this.emit({ type: "agent.state", agent: "listener", state: "idle", bubble: "line is quiet" });
    if (!this.d.startedAt) { this.d.startedAt = Date.now(); touch(this.rec); }
    if (this.fam.channel === "whatsapp-group") {
      // Group chat: no ringing, the mentor just starts posting.
      this.later(1200, () => this.groupOpening());
    } else {
      this.later(1500, () => this.emit({ type: "call.incoming" }));
    }
  }

  async handle(ev: ClientEvent) {
    if (this.ended) return;
    switch (ev.type) {
      case "call.answered": return this.onAnswered();
      case "call.declined": return this.end("A");
      case "text.reply": return this.onJudge(ev.text);
      case "device.event": return this.onDeviceEvent(ev.kind, ev.app, ev.detail);
      case "family.answered": return this.later(1500, () => this.end("B"));
      case "audio.start": return this.startListener(ev.lang, ev.sampleRate);
      case "audio.stop": return this.stopListener();
      case "drill.end": return this.end(this.ladder.isTripped() ? "B" : "A");
    }
  }

  handleAudio(chunk: Uint8Array) { this.listener?.push(chunk); }

  private startListener(lang: string, sampleRate: number) {
    if (!TranscribeSession.available() || this.listener) return;
    this.listener = new TranscribeSession(lang.startsWith("hi") ? "hi-IN" : "en-IN", sampleRate,
      (t) => { this.partialBuf = t; this.emit({ type: "transcript.partial", speaker: "judge", text: t }); this.emit({ type: "agent.state", agent: "listener", state: "act", bubble: "hearing…" }); },
      (t) => { this.partialBuf = ""; void this.onJudge(t); });
    void this.listener.start();
  }
  private stopListener() { this.listener?.stop(); this.listener = null; }

  private async onAnswered() {
    if (this.answered) return;
    this.answered = true;
    this.longCallTimer = this.later(180_000, () => this.signal("long_call", "device"));
    const turn = this.red.opening();
    await this.speak(turn.text, turn.phaseId, turn.phaseIdx);
    this.scheduleNotifications();
  }

  private async groupOpening() {
    this.answered = true;
    const turn = this.red.opening();
    await this.speak(turn.text, turn.phaseId, turn.phaseIdx);
    this.chorus();
    this.scheduleNotifications();
  }

  private chorus() {
    const members = this.fam.members ?? [];
    const lines = this.red.phase.chorus ?? [];
    lines.forEach((text, i) => this.later(1800 + i * 2200, () => {
      const m = members[i % members.length];
      this.emit({ type: "member.say", name: m.name, color: m.color, text });
      this.rec.utterances.push({ ts: Date.now(), speaker: "member", name: m.name, text });
      this.emit({ type: "transcript.final", speaker: "member", name: m.name, text });
    }));
  }

  private scheduleNotifications() {
    // Fire notifications whose afterTurn has been reached; checked after each scammer turn.
    this.checkNotifications();
  }
  private checkNotifications() {
    const list = this.fam.notifications;
    while (this.notifIdx < list.length && list[this.notifIdx].afterTurn <= this.red.totalTurns) {
      const n = list[this.notifIdx++];
      this.later(900, () => {
        this.emit({ type: "world.notification", app: n.app, sender: n.sender, title: n.title, body: n.body });
        if (n.otp) this.signal("otp_arrived", "world");
        if (n.app === "browser") this.signal("scare_page", "device");
      });
    }
  }

  private async onJudge(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (this.busy) { this.pendingJudge.push(clean); return; }
    this.busy = true;
    try {
      this.rec.utterances.push({ ts: Date.now(), speaker: "judge", text: clean });
      this.emit({ type: "transcript.final", speaker: "judge", text: clean });
      this.emit({ type: "agent.state", agent: "listener", state: "act", bubble: `heard: “${clean.slice(0, 40)}${clean.length > 40 ? "…" : ""}”` });
      this.checkLeak(clean);
      if (this.ladder.isTripped() || this.ended) return;
      if (!this.answered) return;
      const turn = await this.red.reply(clean);
      if (this.ended || this.ladder.isTripped()) return;
      await this.speak(turn.text, turn.phaseId, turn.phaseIdx);
      if (this.fam.channel === "whatsapp-group") this.chorus();
      this.checkNotifications();
      this.checkWin();
    } finally {
      this.busy = false;
      const next = this.pendingJudge.shift();
      if (next) void this.onJudge(next);
    }
  }

  private checkLeak(judgeText: string) {
    const otp = this.d.world.otp;
    const digits = judgeText.replace(/\D/g, "");
    const spoken = judgeText.toLowerCase();
    if (otp && (digits.includes(otp) || spelledDigits(spoken).includes(otp))) {
      this.rec.leaked.push(`OTP ${otp} read out to the caller`);
      this.signal("otp_read", "judge");
    }
  }

  private async speak(text: string, phaseId: string, phaseIdx: number) {
    const ts = Date.now();
    this.rec.utterances.push({ ts, speaker: "scammer", text });
    const isGroup = this.fam.channel === "whatsapp-group";
    if (isGroup) {
      this.emit({ type: "member.say", name: this.fam.caller.name, color: "#128C7E", text });
      this.emit({ type: "transcript.final", speaker: "scammer", text });
    } else {
      const tts = await synth(text, this.lang);
      this.emit({ type: "scammer.say", text, audio: tts?.audio, mime: tts?.mime });
      this.emit({ type: "transcript.final", speaker: "scammer", text });
    }
    touch(this.rec);
    // Analyst + Archivist run after the line is out, so the card lands while it is still being said.
    const recent = this.rec.utterances.slice(-7, -1).map((u) => ({ speaker: u.speaker, text: u.text }));
    const scammerLines = this.rec.utterances.filter((u) => u.speaker === "scammer").map((u) => u.text);
    const m = archivist.match(this.fam, scammerLines, phaseIdx);
    this.emit({ type: "playbook.match", family: m.family, phase: m.phase, score: m.score, next: m.next });
    this.emit({ type: "agent.state", agent: "archivist", state: "act", bubble: `'${m.family}' · ${m.phase} · ${Math.round(m.score * 100)}%` });
    this.emit({ type: "agent.state", agent: "analyst", state: "act", bubble: "reading the line…" });
    const tagged = await analyst.tag(text, recent, this.d.world.hookKeywords);
    if (this.ended) return;
    if (tagged.tactics.length) {
      const delta = analyst.delta(tagged.tactics, this.recentTactics, m.score);
      for (const t of tagged.tactics) this.recentTactics.push({ tactic: t, ts: Date.now() });
      this.bump(delta, { kind: "move", tactics: tagged.tactics, quote: tagged.quote, phase: phaseId, playbookScore: m.score });
    } else {
      this.emit({ type: "agent.state", agent: "analyst", state: "idle", bubble: "nothing to pin" });
    }
  }

  private bump(delta: number, why: { kind: "move"; tactics: Tactic[]; quote: string; phase: string; playbookScore: number } | { kind: "signal"; signal: SignalKind; source: string }) {
    const before = this.d.index;
    this.d.index = Math.min(100, before + delta);
    const ts = Date.now();
    if (why.kind === "move") {
      this.rec.moves.push({ ts, tactics: why.tactics, delta, quote: why.quote, phase: why.phase, playbookScore: why.playbookScore, index: this.d.index });
      this.emit({ type: "move.pinned", tactics: why.tactics, delta, quote: why.quote, index: this.d.index });
      this.emit({ type: "agent.state", agent: "analyst", state: "walk", bubble: `pinning ${why.tactics.map((t) => ontology.tactics[t].label).join(" + ")}` });
    } else {
      this.rec.signals.push({ ts, kind: why.signal, delta, source: why.source, index: this.d.index });
      this.emit({ type: "signal.fired", kind: why.signal, delta, index: this.d.index });
    }
    this.emit({ type: "index.update", index: this.d.index, delta });
    touch(this.rec);
    const steps = this.ladder.advance(this.d.index);
    for (const s of steps) {
      this.rec.ladderSteps.push({ ts, from: s.from, to: s.to, index: this.d.index });
      this.d.ladder = s.to;
      this.emit({ type: "ladder.step", from: s.from, to: s.to, index: this.d.index });
      if (s.to === "warn") this.emit({ type: "agent.state", agent: "guardian", state: "walk", bubble: "hand on the lever" });
      if (s.to === "nudge") this.emit({ type: "agent.state", agent: "guardian", state: "act", bubble: `${this.d.world.guardian.name} on standby` });
      if (s.to === "tripped") void this.trip();
    }
  }

  signal(kind: SignalKind, source: string) {
    if (this.ended || this.ladder.isTripped()) return;
    if (this.firedSignals.has(kind) && kind !== "otp_read") return;
    this.firedSignals.add(kind);
    const delta = ontology.signals[kind]?.delta ?? 0;
    this.bump(delta, { kind: "signal", signal: kind, source });
    this.checkWin();
  }

  private onDeviceEvent(kind: string, app?: string, detail?: string) {
    switch (kind) {
      case "share_shown": return this.signal("share_shown", "device");
      case "share_accepted": return this.signal("share_accepted", "device");
      case "remote_accepted": return this.signal("remote_accepted", "device");
      case "app_opened": if (app === "bank" || app === "upi") return this.signal("bank_opened", "device"); return;
      case "link_opened": return this.signal("scare_page", "device");
      case "group_joined": return this.signal("group_isolation", "device");
      case "payment_tapped": this.rec.leaked.push(`Payment of ${detail ?? "an amount"} initiated for the caller`); return this.signal("payment_tapped", "device");
      case "otp_opened": return; // reading the toast is not itself a leak
      case "call_ended": return this.end("A");
    }
  }

  private checkWin() {
    if (!this.d.hardMode || this.ended || this.ladder.isTripped()) return;
    // In hard mode, the red agent can win: ending C.
    const won = this.fam.winConditions.some((w) =>
      (w.kind === "otp_read" && this.firedSignals.has("otp_read")) ||
      (w.kind === "share_accepted" && this.firedSignals.has("share_accepted")) ||
      (w.kind === "remote_accepted" && this.firedSignals.has("remote_accepted")) ||
      (w.kind === "payment_tapped" && this.firedSignals.has("payment_tapped")));
    if (won) {
      this.later(600, () => {
        this.emit({ type: "scammer.say", text: this.fam.winLine });
        this.rec.utterances.push({ ts: Date.now(), speaker: "scammer", text: this.fam.winLine });
        this.later(2500, () => this.end("C"));
      });
    }
  }

  private async trip() {
    this.rec.trip = { ts: Date.now(), index: this.d.index };
    this.d.ladder = "tripped";
    this.emit({ type: "breaker.trip", index: this.d.index });
    this.emit({ type: "agent.state", agent: "guardian", state: "walk", bubble: `calling ${this.d.world.guardian.name}…` });
    this.stopListener();
    const line = this.d.world.guardianLine;
    const tts = await synth(line.en, "en");
    this.later(900, () => {
      this.emit({ type: "family.called", name: this.d.world.guardian.name, line, audio: tts?.audio, mime: tts?.mime });
      this.emit({ type: "agent.state", agent: "guardian", state: "act", bubble: `${this.d.world.guardian.name} is on the line ✓` });
    });
    this.later(1500, () => void this.report());
    // If the judge never taps answer, end anyway.
    this.later(25_000, () => this.end("B"));
  }

  private async report() {
    this.emit({ type: "agent.state", agent: "reporter", state: "act", bubble: "typing the 1930 file…" });
    const res = await filePacket(this.rec, (p) => this.emit({ type: "packet.progress", percent: p }));
    if (res.status === "ready") {
      this.emit({ type: "packet.ready", url: res.url });
      this.emit({ type: "agent.state", agent: "reporter", state: "walk", bubble: "packet ready · sliding it over" });
    } else {
      this.emit({ type: "agent.state", agent: "reporter", state: "act", bubble: "Lambda is writing the packet…" });
    }
    touch(this.rec);
  }

  end(ending: Ending) {
    if (this.ended) return;
    this.ended = true;
    this.ladder.end();
    this.stopListener();
    this.d.endedAt = Date.now();
    this.rec.ending = ending;
    this.d.ending = ending;
    if (ending !== "B" && this.d.ladder !== "tripped") this.d.ladder = "ended";
    this.emit({ type: "drill.ended", ending });
    if (!this.rec.packet) void this.report();
    touch(this.rec);
    for (const t of this.timers) clearTimeout(t);
  }

  dispose() { this.stopListener(); for (const t of this.timers) clearTimeout(t); }
}

function spelledDigits(s: string) {
  const map: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
  return s.split(/\s+/).map((w) => map[w] ?? "").join("");
}
