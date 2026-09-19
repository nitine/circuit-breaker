import { create } from "zustand";
import type { DrillSummary, Ending, ServerEvent, Tactic } from "~/shared/types";

export interface ChatMsg { id: number; from: "them" | "me" | "member" | "system"; name?: string; color?: string; text: string; ts: number }
export interface Notif { id: number; app: string; sender?: string; title: string; body: string; ts: number; read?: boolean }

interface DrillState {
  drill: DrillSummary | null;
  connected: boolean;
  callState: "idle" | "ringing" | "active" | "ended";
  chat: ChatMsg[];
  notifs: Notif[];
  transcript: { speaker: string; text: string; name?: string; ts: number }[];
  partial: string;
  scammerSpeaking: boolean;
  lastScammerLine: string;
  familyCall: { name: string; line: { native: string; en: string }; audio?: string; mime?: string } | null;
  tripped: boolean;
  ended: Ending | null;
  packetUrl: string | null;
  packetPercent: number;
  moves: { tactics: Tactic[]; delta: number; quote: string; index: number; ts: number }[];
  index: number;
  set: (p: Partial<DrillState>) => void;
  apply: (e: ServerEvent) => void;
  pushChat: (m: Omit<ChatMsg, "id" | "ts">) => void;
  reset: () => void;
}
let idc = 1;
const initial = { drill: null, connected: false, callState: "idle" as const, chat: [] as ChatMsg[], notifs: [] as Notif[], transcript: [] as DrillState["transcript"], partial: "", scammerSpeaking: false, lastScammerLine: "", familyCall: null, tripped: false, ended: null, packetUrl: null, packetPercent: 0, moves: [] as DrillState["moves"], index: 0 };

export const useDrill = create<DrillState>((set) => ({
  ...initial,
  set: (p) => set(p),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, { ...m, id: idc++, ts: Date.now() }] })),
  reset: () => set({ ...initial }),
  apply: (e) => {
    switch (e.type) {
      case "drill.state": set({ drill: e.drill, index: e.drill.index, tripped: e.drill.ladder === "tripped" }); break;
      case "call.incoming": set({ callState: "ringing" }); break;
      case "transcript.partial": set({ partial: e.text }); break;
      case "transcript.final": set((s) => ({ partial: "", transcript: [...s.transcript, { speaker: e.speaker, text: e.text, name: e.name, ts: Date.now() }] })); break;
      case "scammer.say": set({ lastScammerLine: e.text }); break;
      case "member.say": set((s) => ({ chat: [...s.chat, { id: idc++, from: "member", name: e.name, color: e.color, text: e.text, ts: Date.now() }] })); break;
      case "move.pinned": set((s) => ({ moves: [...s.moves, { tactics: e.tactics, delta: e.delta, quote: e.quote, index: e.index, ts: Date.now() }], index: e.index })); break;
      case "index.update": set({ index: e.index }); break;
      case "signal.fired": set({ index: e.index }); break;
      case "breaker.trip": set({ tripped: true, index: e.index }); break;
      case "family.called": set({ familyCall: { name: e.name, line: e.line, audio: e.audio, mime: e.mime } }); break;
      case "world.notification": set((s) => ({ notifs: [...s.notifs, { id: idc++, app: e.app, sender: e.sender, title: e.title, body: e.body, ts: Date.now() }] })); break;
      case "packet.progress": set({ packetPercent: e.percent }); break;
      case "packet.ready": set({ packetUrl: e.url, packetPercent: 100 }); break;
      case "drill.ended": set({ ended: e.ending, callState: "ended" }); break;
      default: break;
    }
  },
}));
