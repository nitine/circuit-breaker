import { create } from "zustand";
import type { AgentName, LadderState, ServerEvent, Tactic } from "~/shared/types";
import { HOME, SPOT, WALK_Y } from "./layout";

export type RoomMode = "attract" | "dimmed" | "live" | "tripped" | "file" | "exploded" | "hidden";

export interface AgentSim { x: number; y: number; targetX: number; pose: "idle" | "walk" | "act"; facing: 1 | -1; queue: Task[]; actUntil: number; frame: number }
type Task = { kind: "go"; x: number } | { kind: "act"; ms: number } | { kind: "home" };

export interface Card { tactics: Tactic[]; delta: number; ts: number }
export interface Bubble { text: string; until: number; hot?: boolean }

interface RoomState {
  mode: RoomMode;
  index: number;
  ladder: LadderState;
  cards: Card[];
  crt: { who: "scammer" | "judge" | "member"; text: string }[];
  bubbles: Partial<Record<AgentName, Bubble>>;
  phoneRinging: boolean;
  phoneLifted: boolean;
  familyOnLine: boolean;
  packetPercent: number;
  flashKey: number;
  drawerOpen: boolean;
  cabinetUntil: number;
  device: "phone" | "laptop";
  setMode: (m: RoomMode) => void;
  setDevice: (d: "phone" | "laptop") => void;
  setPhone: (ringing: boolean, lifted: boolean) => void;
  bubble: (a: AgentName, text: string, hot?: boolean, ms?: number) => void;
  apply: (e: ServerEvent) => void;
  reset: () => void;
}

/** Mutable simulation state read by the canvas loop at 60fps. Not reactive on purpose. */
export const sim: { agents: Record<AgentName, AgentSim>; t: number; leverDown: boolean; needle: number } = {
  agents: mk(),
  t: 0,
  leverDown: false,
  needle: 0,
};
function mk(): Record<AgentName, AgentSim> {
  const out = {} as Record<AgentName, AgentSim>;
  for (const a of Object.keys(HOME) as AgentName[]) out[a] = { x: HOME[a], y: WALK_Y, targetX: HOME[a], pose: "idle", facing: 1, queue: [], actUntil: 0, frame: 0 };
  return out;
}
export function enqueue(a: AgentName, ...tasks: Task[]) { sim.agents[a].queue.push(...tasks); }

const initial = {
  mode: "attract" as RoomMode, index: 0, ladder: "armed" as LadderState, cards: [] as Card[], crt: [] as RoomState["crt"], bubbles: {} as RoomState["bubbles"],
  phoneRinging: false, phoneLifted: false, familyOnLine: false, packetPercent: 0, flashKey: 0, drawerOpen: false, cabinetUntil: 0, device: "phone" as const,
};

export const useRoom = create<RoomState>((set, get) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  setDevice: (device) => set({ device }),
  setPhone: (phoneRinging, phoneLifted) => set({ phoneRinging, phoneLifted }),
  bubble: (a, text, hot, ms = 5000) => set((s) => ({ bubbles: { ...s.bubbles, [a]: { text, until: Date.now() + ms, hot } } })),
  reset: () => { sim.agents = mk(); sim.leverDown = false; sim.needle = 0; set({ ...initial }); },
  apply: (e) => {
    const b = get().bubble;
    switch (e.type) {
      case "drill.state":
        set({ index: e.drill.index, ladder: e.drill.ladder, device: e.drill.device });
        sim.leverDown = e.drill.ladder === "tripped";
        break;
      case "call.incoming": set({ phoneRinging: true }); b("listener", "the phone on the desk is ringing", false, 4000); break;
      case "transcript.partial": b("listener", "hearing…", false, 1500); break;
      case "transcript.final": {
        set((s) => ({ crt: [...s.crt, { who: e.speaker, text: e.text }].slice(-6) }));
        sim.agents.listener.actUntil = Date.now() + 900;
        break;
      }
      case "scammer.say": break;
      case "member.say": break;
      case "move.pinned":
        set((s) => ({ cards: [...s.cards, { tactics: e.tactics, delta: e.delta, ts: Date.now() }].slice(-15), index: e.index }));
        enqueue("analyst", { kind: "go", x: SPOT.board }, { kind: "act", ms: 900 }, { kind: "home" });
        break;
      case "index.update": set({ index: e.index }); break;
      case "playbook.match":
        enqueue("archivist", { kind: "go", x: SPOT.cabinet }, { kind: "act", ms: 800 }, { kind: "home" });
        set({ drawerOpen: true, cabinetUntil: Date.now() + 1600 });
        break;
      case "signal.fired": set({ index: e.index }); b("guardian", `signal · ${e.kind.replace(/_/g, " ")} +${e.delta}`, true, 3500); break;
      case "ladder.step":
        set({ ladder: e.to, index: e.index });
        if (e.to === "warn") enqueue("guardian", { kind: "go", x: SPOT.lever }, { kind: "act", ms: 700 });
        if (e.to === "nudge") enqueue("guardian", { kind: "go", x: SPOT.lever }, { kind: "act", ms: 1500 });
        break;
      case "breaker.trip":
        sim.leverDown = true;
        set((s) => ({ ladder: "tripped", index: e.index, flashKey: s.flashKey + 1, mode: s.mode === "hidden" ? "hidden" : "tripped" }));
        sim.agents.guardian.queue = [];
        enqueue("guardian", { kind: "go", x: SPOT.lever }, { kind: "act", ms: 500 }, { kind: "go", x: SPOT.booth }, { kind: "act", ms: 4000 });
        break;
      case "family.called": set({ familyOnLine: true }); break;
      case "packet.progress":
        set({ packetPercent: e.percent });
        if (!sim.agents.reporter.queue.length) enqueue("reporter", { kind: "go", x: SPOT.printer }, { kind: "act", ms: 2500 });
        break;
      case "packet.ready":
        set({ packetPercent: 100 });
        enqueue("reporter", { kind: "go", x: SPOT.printer }, { kind: "act", ms: 600 }, { kind: "go", x: SPOT.desk }, { kind: "act", ms: 800 }, { kind: "home" });
        break;
      case "agent.state":
        if (e.bubble) b(e.agent, e.bubble, e.state === "act" && e.agent !== "listener");
        if (e.state === "act") sim.agents[e.agent].actUntil = Math.max(sim.agents[e.agent].actUntil, Date.now() + 900);
        break;
      case "drill.ended": break;
      default: break;
    }
  },
}));

/** Attract-mode chatter for the landing page. */
export const IDLE_BUBBLES: [AgentName, string][] = [
  ["listener", "sipping chai · nothing on the line"],
  ["analyst", "board is empty · good"],
  ["archivist", "filing yesterday's playbooks"],
  ["guardian", "lever's up · all quiet"],
  ["reporter", "refilling paper"],
  ["listener", "hums to herself"],
  ["analyst", "sharpens a pencil"],
  ["guardian", "polishes the lever"],
];
