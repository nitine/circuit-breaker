import { create } from "zustand";
import type { DrillSummary, Ending, ServerEvent, Tactic, UiHint, UiStep, Stance } from "~/shared/types";

export interface ChatMsg { id: number; from: "them" | "me" | "member" | "system"; name?: string; color?: string; text: string; ts: number }
export interface Notif { id: number; app: string; sender?: string; title: string; body: string; attachment?: string; ts: number; read?: boolean }

interface DrillState {
  drill: DrillSummary | null;
  connected: boolean;
  callState: "idle" | "ringing" | "active" | "ended";
  chat: ChatMsg[];
  notifs: Notif[];
  transcript: { speaker: string; text: string; name?: string; ts: number; stance?: Stance }[];
  partial: string;
  scammerSpeaking: boolean;
  lastScammerLine: string;
  hearing: number;
  stance: Stance | null;
  family: { notified: boolean; message?: string; reply?: string; native?: string; audio?: string; mime?: string };
  tripped: boolean;
  ended: Ending | null;
  packetUrl: string | null;
  packetPercent: number;
  moves: { tactics: Tactic[]; delta: number; quote: string; index: number; ts: number }[];
  index: number;
  hint: UiHint;
  phase: string;
  ui: UiStep | null;
  voice: { tts: "polly" | "piper" | "browser" | "captions"; stt: "transcribe" | "vosk" | "browser" | "typed"; note?: string; micOn: boolean; micLevel: number };
  /** Set by the drill page so the device shells can toggle the real microphone. */
  toggleMic: (() => void) | null;
  set: (p: Partial<DrillState>) => void;
  apply: (e: ServerEvent) => void;
  pushChat: (m: Omit<ChatMsg, "id" | "ts">) => void;
  reset: () => void;
}
let idc = 1;
const initial = { drill: null, connected: false, callState: "idle" as const, chat: [] as ChatMsg[], notifs: [] as Notif[], transcript: [] as DrillState["transcript"], partial: "", scammerSpeaking: false, lastScammerLine: "", hearing: 0, stance: null as Stance | null, family: { notified: false } as DrillState["family"], tripped: false, ended: null, packetUrl: null, packetPercent: 0, moves: [] as DrillState["moves"], index: 0, hint: null as UiHint, phase: "", ui: null as UiStep | null, voice: { tts: "captions" as const, stt: "typed" as const, micOn: false, micLevel: 0 }, toggleMic: null as (() => void) | null };

export const useDrill = create<DrillState>((set) => ({
  ...initial,
  set: (p) => set(p),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, { ...m, id: idc++, ts: Date.now() }] })),
  reset: () => set((s) => ({ ...initial, family: { notified: false }, toggleMic: s.toggleMic })),
  apply: (e) => {
    switch (e.type) {
      case "drill.state": set({ drill: e.drill, index: e.drill.index, tripped: e.drill.ladder === "tripped" }); break;
      case "call.incoming": set((s) => ({ callState: s.drill?.channel === "whatsapp-group" ? "active" : "ringing" })); break;
      case "transcript.partial": set({ partial: e.text, hearing: Date.now() }); break;
      case "transcript.final": set((s) => ({ partial: "", transcript: [...s.transcript, { speaker: e.speaker, text: e.text, name: e.name, ts: Date.now() }] })); break;
      case "listener.hearing": set({ hearing: Date.now() }); break;
      case "judge.stance": set((s) => ({ stance: e.stance, transcript: s.transcript.map((t, i) => (i === s.transcript.length - 1 && t.speaker === "judge" ? { ...t, stance: e.stance } : t)) })); break;
      case "scammer.say": set({ lastScammerLine: e.text, hint: e.hint ?? null, phase: e.phase ?? "" }); break;
      case "member.say": set((s) => ({ chat: [...s.chat, { id: idc++, from: "member", name: e.name, color: e.color, text: e.text, ts: Date.now() }] })); break;
      case "move.pinned": set((s) => ({ moves: [...s.moves, { tactics: e.tactics, delta: e.delta, quote: e.quote, index: e.index, ts: Date.now() }], index: e.index })); break;
      case "index.update": set({ index: e.index }); break;
      case "signal.fired": set({ index: e.index }); break;
      case "breaker.trip": set({ tripped: true, index: e.index, hint: null, ui: null }); break;
      case "family.notified": set((s) => ({ family: { ...s.family, notified: true, message: e.message } })); break;
      case "family.replied": set((s) => ({ family: { ...s.family, reply: e.text, native: e.native, audio: e.audio, mime: e.mime }, chat: [...s.chat, { id: idc++, from: "them", name: e.name, text: e.text, ts: Date.now() }] })); break;
      case "world.notification": set((s) => ({ notifs: [...s.notifs, { id: idc++, app: e.app, sender: e.sender, title: e.title, body: e.body, attachment: e.attachment, ts: Date.now() }] })); break;
      case "ui.render": set({ ui: e.step }); break;
      case "ui.close": set((s) => (s.ui?.id === e.id ? { ui: null } : {})); break;
      case "packet.progress": set({ packetPercent: e.percent }); break;
      case "packet.ready": set({ packetUrl: e.url, packetPercent: 100 }); break;
      case "drill.ended": set({ ended: e.ending, callState: "ended" }); break;
      default: break;
    }
  },
}));
