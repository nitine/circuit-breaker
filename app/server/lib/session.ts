import type { ClientEvent, ServerEvent, SignalKind, Tactic, Ending, UiHint, Stance } from "~/shared/types";
import type { DrillRecord } from "./store";
import { touch } from "./store";
import { families, ontology } from "./corpus";
import { RedAgent } from "./redAgent";
import { Ladder } from "./guardian";
import * as analyst from "./analyst";
import * as archivist from "./archivist";
import { synth } from "./tts";
import { createStt, type SttSession } from "./listener";
import { filePacket } from "./reporter";
import { generateStep, generateDoc, prewarm } from "./uiSteps";
import { provider } from "./llm";

type Send = (e: ServerEvent) => void;
type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;
type Timer = ReturnType<typeof setTimeout>;

const REACTIVE = new Set(["notice_opened", "notice_callback", "share_shown", "share_accepted", "share_dismissed", "remote_shown", "remote_accepted", "remote_dismissed", "app_opened", "app_left", "window_closed", "link_opened", "link_dismissed", "pay_cancelled", "payment_tapped", "otp_opened", "toast_dismissed", "contacts_opened", "camera_off", "muted"]);
const SIGNALS: Record<string, SignalKind> = { share_shown: "share_shown", share_accepted: "share_accepted", remote_accepted: "remote_accepted", link_opened: "scare_page", group_joined: "group_isolation", payment_tapped: "payment_tapped" };

export class DrillSession {
  private seq = 0;
  private red: RedAgent;
  private ladder = new Ladder();
  private recentTactics: { tactic: Tactic; ts: number }[] = [];
  private complied = 0;
  private hardSignal = false;
  private softSignal = false;
  /** How far the judge has gone along: scales every caller move so pressure alone cannot trip the breaker. */
  private engagement() { const e = ontology.engagement ?? { cold: 0.55, warm: 0.8, hot: 1 }; if (this.hardSignal || this.complied >= 2) return e.hot; if (this.softSignal || this.complied >= 1) return e.warm; return e.cold; }
  private timers: Timer[] = [];
  private stt: SttSession | null = null;
  private answered = false;
  private ended = false;
  private busy = false;
  private pendingJudge: string[] = [];
  private firedSignals = new Set<SignalKind>();
  private notifIdx = 0;
  private lastHearing = 0;
  private lastReaction = 0;
  private silenceTimer: Timer | null = null;
  private silences = 0;
  private lastPhase = "";
  private lastUiId = "";
  private familyTimer: Timer | null = null;

  constructor(readonly rec: DrillRecord, private send: Send) {
    this.red = new RedAgent(families[rec.summary.family], rec.summary.world, rec.summary.language);
  }

  private emit(e: WithoutSeq<ServerEvent>) { this.send({ ...(e as ServerEvent), seq: ++this.seq }); }
  private later(ms: number, fn: () => void) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  private get fam() { return families[this.rec.summary.family]; }
  private get d() { return this.rec.summary; }
  private get lang(): "en" | "hi" | "kn" { return this.d.language === "hi" ? "hi" : "en"; }
  private get isGroup() { return this.fam.channel === "whatsapp-group"; }
  private hintFor(phaseId: string): UiHint {
    const f = this.fam.id;
    if (phaseId === "authority" && f === "digital-arrest") return "notice";
    if (phaseId === "control") return f === "tech-support" ? "remote" : f === "loan-app" ? "link" : "share";
    if (phaseId === "extraction") return f === "digital-arrest" ? "otp" : "pay";
    if (phaseId === "reciprocity") return "bank";
    return null;
  }

  start() {
    this.emit({ type: "drill.state", drill: this.d });
    if (!this.d.startedAt) { this.d.startedAt = Date.now(); touch(this.rec); }
    prewarm(this.d.id, this.fam, this.d.world, this.d.device);
    void provider().then((p) => this.emit({ type: "agent.state", agent: "archivist", state: "idle", bubble: p === "none" ? "playbook loaded · scripted caller" : `playbook loaded · live caller (${p})` }));
    if (this.isGroup) this.later(1200, () => { this.emit({ type: "call.incoming" }); this.answered = true; this.groupOpening(); });
    else this.later(1500, () => this.emit({ type: "call.incoming" }));
  }

  async handle(ev: ClientEvent) {
    if (this.ended) return;
    switch (ev.type) {
      case "call.answered": return this.onAnswered();
      case "call.declined": return this.end("A");
      case "text.reply": return this.onJudge(ev.text);
      case "device.event": return this.onDeviceEvent(ev.kind, ev.app, ev.detail);
      case "ui.action": return this.onUiAction(ev.id, ev.action);
      case "family.answered": return this.end("B");
      case "audio.start": return this.startStt(ev.lang, ev.sampleRate);
      case "audio.stop": return this.stopStt();
      case "drill.end": return this.end(this.ladder.isTripped() ? "B" : "A");
    }
  }

  handleAudio(chunk: Uint8Array) {
    this.stt?.push(chunk);
    const now = Date.now();
    if (now - this.lastHearing > 350) { this.lastHearing = now; this.emit({ type: "listener.hearing", level: 1 }); }
  }

  // ------------------------------------------------------------------ listening
  private lastPartial = "";
  private judgeTalking = false;
  private startStt(lang: string, sampleRate: number) {
    this.judgeTalking = true;
    if (this.stt) return;
    const l = lang.startsWith("hi") ? "hi-IN" : "en-IN";
    this.stt = createStt(l, sampleRate,
      (t) => { this.lastPartial = t; this.emit({ type: "transcript.partial", speaker: "judge", text: t }); },
      (t) => { this.lastPartial = ""; void this.onJudge(t); });
    if (!this.stt) { this.emit({ type: "error", message: "no speech recognition on the server; type instead" }); return; }
    void this.stt.start();
    this.emit({ type: "agent.state", agent: "listener", state: "act", bubble: this.stt.kind === "transcribe" ? "Transcribe stream open" : "listening (Vosk, on this machine)" });
  }
  private stopStt() {
    this.judgeTalking = false;
    const stt = this.stt; this.stt = null; stt?.stop();
    // Transcribe/Vosk flush a final on stream end; if only a partial ever arrived, use it so the turn is not lost.
    const partial = this.lastPartial;
    if (stt && partial) this.later(2000, () => { if (this.lastPartial === partial) { this.lastPartial = ""; void this.onJudge(partial); } });
    this.armSilence();
  }

  // ------------------------------------------------------------------ call flow
  private async onAnswered() {
    if (this.answered) return;
    this.answered = true;
    this.later(180_000, () => this.signal("long_call", "device"));
    const turn = this.red.opening();
    await this.speak(turn.text, turn.phaseId, turn.phaseIdx, "opener");
    this.checkNotifications();
  }
  private async groupOpening() {
    this.answered = true;
    const turn = this.red.opening();
    await this.speak(turn.text, turn.phaseId, turn.phaseIdx, "opener");
    this.chorus();
    this.checkNotifications();
  }
  private chorus() {
    const members = this.fam.members ?? [];
    this.red.chorusLines.forEach((text, i) => this.later(1800 + i * 2200, () => {
      const m = members[i % members.length];
      this.emit({ type: "member.say", name: m.name, color: m.color, text });
      this.rec.utterances.push({ ts: Date.now(), speaker: "member", name: m.name, text });
      this.emit({ type: "transcript.final", speaker: "member", name: m.name, text });
    }));
  }
  private checkNotifications() {
    const list = this.fam.notifications;
    while (this.notifIdx < list.length && list[this.notifIdx].afterTurn <= this.red.totalTurns) {
      const n = list[this.notifIdx++];
      this.later(900, () => {
        this.emit({ type: "world.notification", app: n.app, sender: n.sender, title: n.title, body: n.body, attachment: n.attachment });
        if (n.otp) this.signal("otp_arrived", "world");
        if (n.app === "browser") this.signal("scare_page", "device");
      });
    }
  }

  private armSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.isGroup || this.silences >= 3 || this.ladder.isTripped()) return;
    // No "are you there?" while the judge is reading a page or a document the caller sent; silence is re-armed when it closes.
    this.silenceTimer = this.later(16_000, () => { if (this.uiOpen || this.judgeTalking) { this.armSilence(); return; } if (!this.busy && !this.ended && !this.pendingReaction) { this.silences++; void this.reactTo("silence"); } });
  }

  private async onJudge(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (this.busy) { this.pendingJudge.push(clean); return; }
    this.busy = true;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    try {
      const stance = analyst.stanceOf(clean, this.d.world.otp);
      this.rec.utterances.push({ ts: Date.now(), speaker: "judge", text: clean, stance });
      this.emit({ type: "transcript.final", speaker: "judge", text: clean });
      this.emit({ type: "judge.stance", stance, text: clean });
      this.emit({ type: "agent.state", agent: "listener", state: "act", bubble: stance === "resist" ? "you pushed back" : stance === "comply" ? "you're going along" : stance === "leak" ? "that was the OTP" : "heard you" });
      if (stance === "leak") this.leak(`OTP ${this.d.world.otp} read out to the caller`, "otp_read");
      if (stance === "comply" || stance === "leak") this.complied++;
      if (stance === "comply" && this.red.phaseIdx >= 2 && !this.ladder.isTripped()) this.bump(ontology.signals.went_along.delta, { kind: "signal", signal: "went_along", source: "judge", label: "went along with it" });
      if (this.ladder.isTripped() || this.ended || !this.answered) return;
      const turn = await this.red.reply(clean);
      if (this.ended || this.ladder.isTripped()) return;
      await this.speak(turn.text, turn.phaseId, turn.phaseIdx, turn.kind);
      if (this.isGroup) this.chorus();
      this.checkNotifications();
      this.checkWin();
    } finally {
      this.busy = false;
      const next = this.pendingJudge.shift();
      if (next) void this.onJudge(next); else this.armSilence();
    }
  }

  private async reactTo(kind: string, detail?: string) {
    const now = Date.now();
    if (this.busy || this.ended || this.ladder.isTripped() || !this.answered || this.isGroup) { this.red.note(kind, detail); return; }
    if (now - this.lastReaction < 5000 || this.busy) {
      // Too soon or the caller is mid-sentence: remember the latest device action and react to it when the line is free, rather than dropping it.
      this.red.note(kind, detail);
      if (kind !== "silence") { this.pendingReaction = { kind, detail }; if (!this.busy) this.later(5000 - (now - this.lastReaction) + 50, () => this.flushReaction()); }
      return;
    }
    this.pendingReaction = null;
    this.lastReaction = now; this.busy = true;
    try {
      const turn = await this.red.react(kind, detail);
      if (turn && !this.ended) { this.emit({ type: "caller.reaction", to: kind }); await this.speak(turn.text, turn.phaseId, turn.phaseIdx, `reaction:${kind}`); }
    } finally { this.busy = false; const next = this.pendingJudge.shift(); if (next) void this.onJudge(next); else if (this.pendingReaction) this.later(400, () => this.flushReaction()); else this.armSilence(); }
  }
  private pendingReaction: { kind: string; detail?: string } | null = null;
  private holdWarned = false;
  private flushReaction() { const p = this.pendingReaction; if (!p || this.ended) return; this.pendingReaction = null; void this.reactTo(p.kind, p.detail); }

  private leak(what: string, sig: SignalKind) { this.rec.leaked.push(what); this.signal(sig, "judge"); }

  private async speak(text: string, phaseId: string, phaseIdx: number, kind: string) {
    const ts = Date.now();
    this.rec.utterances.push({ ts, speaker: "scammer", text, kind, phase: phaseId });
    if (this.isGroup) {
      this.emit({ type: "member.say", name: this.fam.caller.name, color: "#128C7E", text });
      this.emit({ type: "transcript.final", speaker: "scammer", text });
    } else {
      const tts = await synth(text, this.lang, this.fam.caller.voice);
      this.emit({ type: "scammer.say", text, audio: tts?.audio, mime: tts?.mime, phase: phaseId, hint: this.hintFor(phaseId) });
      this.emit({ type: "transcript.final", speaker: "scammer", text });
    }
    touch(this.rec);
    if (phaseId !== this.lastPhase) { this.lastPhase = phaseId; this.later(1500, () => void this.pushUi(phaseIdx)); }
    const recent = this.rec.utterances.slice(-7, -1).map((u) => ({ speaker: u.speaker, text: u.text }));
    const scammerLines = this.rec.utterances.filter((u) => u.speaker === "scammer").map((u) => u.text);
    const m = archivist.match(this.fam, scammerLines, phaseIdx);
    this.emit({ type: "playbook.match", family: m.family, phase: m.phase, score: m.score, next: m.next });
    this.emit({ type: "agent.state", agent: "analyst", state: "act", bubble: "reading the line" });
    const tagged = await analyst.tag(text, recent, this.d.world.hookKeywords);
    if (this.ended) return;
    if (tagged.tactics.length) {
      const delta = analyst.delta(tagged.tactics, this.recentTactics, m.score, this.engagement());
      for (const t of tagged.tactics) this.recentTactics.push({ tactic: t, ts: Date.now() });
      this.bump(delta, { kind: "move", tactics: tagged.tactics, quote: tagged.quote, phase: phaseId, playbookScore: m.score });
    } else this.emit({ type: "agent.state", agent: "analyst", state: "idle", bubble: "nothing to pin" });
  }

  private async pushUi(phaseIdx: number) {
    if (this.ended || this.ladder.isTripped() || this.isGroup && phaseIdx < 3) { /* groups only push the tax page */ }
    const phase = this.fam.phases[phaseIdx];
    if (!phase?.ui) return;
    const step = await generateStep(this.d.id, this.fam, phase, this.d.world, this.d.device);
    if (!step || this.ended) return;
    this.lastUiId = step.id; this.uiActions.set(step.id, step.actions);
    this.rec.uiSteps.push({ id: step.id, title: step.title, ts: Date.now() });
    this.uiOpen = true; this.emit({ type: "ui.render", step });
    this.emit({ type: "agent.state", agent: "archivist", state: "act", bubble: `they've sent a page: ${step.url ?? step.title}` });
    touch(this.rec);
  }
  private async pushDoc(file?: string) {
    if (this.ended) return;
    const step = await generateDoc(this.d.id, this.fam, this.d.world, this.d.device, file?.split(" · ")[0] ?? "Notice.pdf");
    if (!step || this.ended) return;
    this.uiActions.set(step.id, step.actions);
    this.rec.uiSteps.push({ id: step.id, title: step.title, ts: Date.now() });
    this.uiOpen = true; this.emit({ type: "ui.render", step });
    this.emit({ type: "agent.state", agent: "archivist", state: "act", bubble: `reading their "${step.title}"` });
    touch(this.rec);
  }
  private uiActions = new Map<string, Record<string, string>>();
  private uiOpen = false;
  private onUiAction(id: string, action: string) {
    const kind = this.uiActions.get(id)?.[action] ?? this.fam.phases.find((p) => `${this.fam.id}:${p.id}` === id)?.ui?.actions[action];
    const rec = this.rec.uiSteps.find((s) => s.id === id); if (rec) rec.action = action;
    this.uiOpen = false; this.emit({ type: "ui.close", id });
    if (kind) this.onDeviceEvent(kind, "ui", action);
  }

  private bump(delta: number, why: { kind: "move"; tactics: Tactic[]; quote: string; phase: string; playbookScore: number } | { kind: "signal"; signal: SignalKind; source: string; label?: string }) {
    const before = this.d.index;
    let next = Math.min(100, before + delta);
    // The breaker only trips on something the judge did: until engagement is hot (two compliances or a hard device signal)
    // the index holds just under the threshold and the Guardian keeps a hand on the lever.
    const hot = this.engagement() >= (ontology.engagement?.hot ?? 1);
    if (!hot && next >= ontology.thresholds.trip && !this.ladder.isTripped()) {
      next = ontology.thresholds.trip - 1; delta = next - before;
      if (!this.holdWarned) { this.holdWarned = true; this.emit({ type: "agent.state", agent: "guardian", state: "act", bubble: "holding the breaker · one more step from you and it trips" }); }
    }
    this.d.index = next;
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
    for (const s of this.ladder.advance(this.d.index)) {
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
    if (this.firedSignals.has(kind) && kind !== "otp_read" && kind !== "payment_tapped") return;
    this.firedSignals.add(kind);
    if (["share_accepted", "remote_accepted", "otp_read", "payment_tapped", "group_isolation"].includes(kind)) this.hardSignal = true; else this.softSignal = true;
    this.bump(ontology.signals[kind]?.delta ?? 0, { kind: "signal", signal: kind, source });
    this.checkWin();
  }

  private onDeviceEvent(kind: string, app?: string, detail?: string) {
    if (kind === "call_ended") return this.end("A");
    if (kind === "guardian_called") { this.rec.leaked.length; return this.end("A"); }
    if (kind === "app_opened" && (app === "bank" || app === "upi")) this.signal("bank_opened", "device");
    if (kind === "payment_tapped") this.rec.leaked.push(`Payment of ${detail ?? "an amount"} initiated for the caller`);
    const sig = SIGNALS[kind]; if (sig) this.signal(sig, "device");
    if (kind === "remote_accepted") this.signal("remote_accepted", "device");
    if (kind === "app_opened" && app === "contacts") kind = "contacts_opened";
    if (kind === "notice_opened") void this.pushDoc(detail);
    if (REACTIVE.has(kind)) void this.reactTo(kind, kind === "app_opened" ? app : kind === "window_closed" ? app : detail);
  }

  private checkWin() {
    if (!this.d.hardMode || this.ended || this.ladder.isTripped()) return;
    const won = this.fam.winConditions.some((w) =>
      (w.kind === "otp_read" && this.firedSignals.has("otp_read")) || (w.kind === "share_accepted" && this.firedSignals.has("share_accepted")) ||
      (w.kind === "remote_accepted" && this.firedSignals.has("remote_accepted")) || (w.kind === "payment_tapped" && this.firedSignals.has("payment_tapped")));
    if (won) this.later(600, () => { this.emit({ type: "scammer.say", text: this.red.winLine }); this.rec.utterances.push({ ts: Date.now(), speaker: "scammer", text: this.red.winLine }); this.later(2500, () => this.end("C")); });
  }

  // ------------------------------------------------------------------ trip: notify the family, agents step in
  private async trip() {
    this.rec.trip = { ts: Date.now(), index: this.d.index };
    this.d.ladder = "tripped";
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.emit({ type: "breaker.trip", index: this.d.index });
    this.stopStt();
    const g = this.d.world.guardian; const w = this.d.world;
    const top = [...new Set(this.rec.moves.flatMap((m) => m.tactics))].slice(0, 3).map((t) => ontology.tactics[t].label.toLowerCase()).join(", ");
    const message = `${g.name}, ${w.personaName} is on a ${this.fam.channel.replace("-", " ")} with someone claiming to be ${this.fam.caller.org}. The call is using ${top || "pressure"}. Coercion index ${this.d.index}. Please call ${w.personaName} now.`;
    this.emit({ type: "agent.state", agent: "guardian", state: "walk", bubble: `messaging ${g.name}` });
    this.later(700, () => this.emit({ type: "family.notified", name: g.name, relation: g.relation, channel: "whatsapp", message }));
    const line = w.guardianLine;
    const tts = await synth(this.lang === "hi" ? line.native : line.en, this.lang, "female");
    this.familyTimer = this.later(6500, () => { this.emit({ type: "family.replied", name: g.name, text: line.en, native: line.native, audio: tts?.audio, mime: tts?.mime }); this.emit({ type: "agent.state", agent: "guardian", state: "act", bubble: `${g.name} replied` }); });
    this.later(1500, () => void this.report());
    this.later(45_000, () => this.end("B"));
  }

  private async report() {
    this.emit({ type: "agent.state", agent: "reporter", state: "act", bubble: "typing the 1930 file" });
    const res = await filePacket(this.rec, (p) => this.emit({ type: "packet.progress", percent: p }));
    if (res.status === "ready") { this.emit({ type: "packet.ready", url: res.url }); this.emit({ type: "agent.state", agent: "reporter", state: "walk", bubble: "packet ready" }); }
    else this.emit({ type: "agent.state", agent: "reporter", state: "act", bubble: "Lambda is writing the packet" });
    touch(this.rec);
  }

  end(ending: Ending) {
    if (this.ended) return;
    this.ended = true; this.ladder.end(); this.stopStt();
    this.d.endedAt = Date.now(); this.rec.ending = ending; this.d.ending = ending;
    if (ending !== "B" && this.d.ladder !== "tripped") this.d.ladder = "ended";
    this.emit({ type: "drill.ended", ending });
    if (!this.rec.packet) void this.report();
    touch(this.rec);
    for (const t of this.timers) clearTimeout(t);
  }
  dispose() { this.stopStt(); for (const t of this.timers) clearTimeout(t); }
}
