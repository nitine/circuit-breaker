import { create } from "zustand";
import type { AgentName, LadderState, ServerEvent, Tactic } from "~/shared/types";
import { SCENE } from "./scene";

export type RoomMode = "attract" | "dimmed" | "live" | "tripped" | "file" | "exploded" | "hidden";
export type Pt = { x: number; y: number };
export type Task = { kind: "go"; to: Pt } | { kind: "act"; ms: number; started?: number } | { kind: "home" };
export interface AgentSim { x: number; y: number; pose: "idle" | "walk" | "act"; facing: 1 | -1; queue: Task[]; actUntil: number; frame: number }
export interface Card { tactics: Tactic[]; delta: number; ts: number }
export interface Bubble { text: string; until: number; hot?: boolean }

interface RoomState {
  mode: RoomMode; index: number; ladder: LadderState; cards: Card[];
  crt: { who: "scammer" | "judge" | "member"; text: string }[];
  bubbles: Partial<Record<AgentName, Bubble>>;
  phoneRinging: boolean; phoneLifted: boolean; familyOnLine: boolean; packetPercent: number; flashKey: number;
  drawerOpen: boolean; cabinetUntil: number; device: "phone" | "laptop";
  setMode: (m: RoomMode) => void; setDevice: (d: "phone" | "laptop") => void; setPhone: (ringing: boolean, lifted: boolean) => void;
  bubble: (a: AgentName, text: string, hot?: boolean, ms?: number) => void; apply: (e: ServerEvent) => void; reset: () => void;
}

/** Mutable simulation state read by the canvas loop. Not reactive on purpose. */
export const sim: { agents: Record<AgentName, AgentSim>; t: number; leverDown: boolean; needle: number } = { agents: mk(), t: 0, leverDown: false, needle: 0 };
function mk(): Record<AgentName, AgentSim> {
  const out = {} as Record<AgentName, AgentSim>;
  for (const a of Object.keys(SCENE.home) as AgentName[]) out[a] = { x: SCENE.home[a].x, y: SCENE.home[a].y, pose: "idle", facing: 1, queue: [], actUntil: 0, frame: 0 };
  return out;
}
export function enqueue(a: AgentName, ...tasks: Task[]) { sim.agents[a].queue.push(...tasks); }
const go = (to: Pt): Task => ({ kind: "go", to });
const act = (ms: number): Task => ({ kind: "act", ms });
const home: Task = { kind: "home" };

const initial = { mode: "attract" as RoomMode, index: 0, ladder: "armed" as LadderState, cards: [] as Card[], crt: [] as RoomState["crt"], bubbles: {} as RoomState["bubbles"], phoneRinging: false, phoneLifted: false, familyOnLine: false, packetPercent: 0, flashKey: 0, drawerOpen: false, cabinetUntil: 0, device: "phone" as const };

export const useRoom = create<RoomState>((set, get) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  setDevice: (device) => set({ device }),
  setPhone: (phoneRinging, phoneLifted) => set({ phoneRinging, phoneLifted }),
  bubble: (a, text, hot, ms = 3200) => set((s) => ({ bubbles: { ...s.bubbles, [a]: { text: text.length > 42 ? text.slice(0, 40) + "…" : text, until: Date.now() + ms, hot } } })),
  reset: () => { sim.agents = mk(); sim.leverDown = false; sim.needle = 0; set({ ...initial }); },
  apply: (e) => {
    const b = get().bubble; const S = SCENE.spots;
    switch (e.type) {
      case "drill.state": set({ index: e.drill.index, ladder: e.drill.ladder, device: e.drill.device }); sim.leverDown = e.drill.ladder === "tripped"; break;
      case "call.incoming": set({ phoneRinging: true }); b("listener", "the phone on the desk is ringing", false, 4000); break;
      case "transcript.partial": sim.agents.listener.actUntil = Date.now() + 1200; break;
      case "listener.hearing": sim.agents.listener.actUntil = Date.now() + 700; break;
      case "judge.stance": b("listener", e.stance === "resist" ? "you pushed back" : e.stance === "comply" ? "you went along" : e.stance === "leak" ? "that was the OTP" : "heard you", false, 2500); break;
      case "family.notified": b("guardian", `messaged ${e.name} on WhatsApp`, false, 5000); set({ familyOnLine: true }); enqueue("guardian", go(S.booth), act(4000)); break;
      case "family.replied": b("guardian", `${e.name} replied`, false, 4000); break;
      case "ui.render": b("archivist", "they sent a page", false, 3000); enqueue("archivist", go(S.cabinet), act(800), home); break;
      case "caller.reaction": b("analyst", "reacting to what you did", false, 2500); break;
      case "transcript.final": set((s) => ({ crt: [...s.crt, { who: e.speaker, text: e.text }].slice(-6) })); sim.agents.listener.actUntil = Date.now() + 900; break;
      case "move.pinned":
        set((s) => ({ cards: [...s.cards, { tactics: e.tactics, delta: e.delta, ts: Date.now() + 700 }].slice(-15), index: e.index }));
        enqueue("analyst", go(S.board), act(1000), home); break;
      case "index.update": set({ index: e.index }); break;
      case "playbook.match": enqueue("archivist", go(S.cabinet), act(900), home); set({ drawerOpen: true, cabinetUntil: Date.now() + 1800 }); break;
      case "signal.fired": set({ index: e.index }); b("guardian", `signal · ${e.kind.replace(/_/g, " ")} +${e.delta}`, true, 3500); break;
      case "ladder.step":
        set({ ladder: e.to, index: e.index });
        if (e.to === "warn") enqueue("guardian", go(S.lever), act(800));
        if (e.to === "nudge") enqueue("guardian", go(S.lever), act(1600));
        break;
      case "breaker.trip":
        sim.leverDown = true;
        set((s) => ({ ladder: "tripped", index: e.index, flashKey: s.flashKey + 1, mode: s.mode === "hidden" ? "hidden" : "tripped" }));
        sim.agents.guardian.queue = [];
        enqueue("guardian", go(S.lever), act(500), go(S.booth), act(5000));
        break;
      case "family.called": set({ familyOnLine: true }); break;
      case "packet.progress": set({ packetPercent: e.percent }); if (!sim.agents.reporter.queue.length) enqueue("reporter", go(S.printer), act(2500)); break;
      case "packet.ready": set({ packetPercent: 100 }); enqueue("reporter", go(S.printer), act(600), go(S.desk), act(900), home); break;
      case "agent.state":
        if (e.bubble) b(e.agent, e.bubble, false, 3200);
        if (e.state === "act") sim.agents[e.agent].actUntil = Math.max(sim.agents[e.agent].actUntil, Date.now() + 900);
        break;
      default: break;
    }
  },
}));

export const IDLE_BUBBLES: [AgentName, string][] = [
  ["listener", "sipping chai · nothing on the line"], ["analyst", "board is empty · good"], ["archivist", "filing yesterday's playbooks"],
  ["guardian", "lever's up · all quiet"], ["reporter", "refilling paper"], ["listener", "hums to herself"], ["analyst", "sharpens a pencil"], ["guardian", "polishes the lever"],
];
