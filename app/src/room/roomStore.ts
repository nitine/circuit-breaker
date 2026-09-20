import { create } from "zustand";
import type { AgentName, LadderState, ServerEvent, Tactic } from "~/shared/types";
import { SCENE } from "./scene";

export type RoomMode = "attract" | "dimmed" | "live" | "tripped" | "file" | "exploded" | "hidden";
export type Pt = { x: number; y: number };
export type Task = { kind: "go"; to: Pt } | { kind: "act"; ms: number; started?: number } | { kind: "home" };
export interface AgentSim { x: number; y: number; pose: "idle" | "walk" | "act"; facing: 1 | -1; queue: Task[]; actUntil: number; frame: number }
export interface Card { tactics: Tactic[]; delta: number; ts: number }
export interface Bubble { text: string; until: number; hot?: boolean }
export type Tone = "calm" | "warn" | "hot" | "good" | "info";
/** One line of the room log: who did what, and what it did to the index. Judges read cause → effect here. */
export interface FeedItem { id: number; agent: AgentName | "caller" | "you"; text: string; tone: Tone; delta?: number; ts: number }
/** The status word under each agent's name tag. */
export interface Tag { text: string; tone: Tone; until: number }
/** A number that floats up from an object on the canvas. */
export interface Pop { x: number; y: number; text: string; color: string; ts: number }

interface RoomState {
  mode: RoomMode; index: number; ladder: LadderState; cards: Card[];
  crt: { who: "scammer" | "judge" | "member"; text: string }[];
  bubbles: Partial<Record<AgentName, Bubble>>;
  phoneRinging: boolean; phoneLifted: boolean; familyOnLine: boolean; packetPercent: number; flashKey: number;
  drawerOpen: boolean; cabinetUntil: number; device: "phone" | "laptop";
  feed: FeedItem[]; tags: Partial<Record<AgentName, Tag>>; phase: { label: string; until: number } | null; want: { text: string; until: number } | null; pulse: { key: string; until: number } | null;
  log: (agent: FeedItem["agent"], text: string, tone?: Tone, delta?: number) => void; tag: (a: AgentName, text: string, tone?: Tone, ms?: number) => void;
  setMode: (m: RoomMode) => void; setDevice: (d: "phone" | "laptop") => void; setPhone: (ringing: boolean, lifted: boolean) => void;
  bubble: (a: AgentName, text: string, hot?: boolean, ms?: number) => void; apply: (e: ServerEvent) => void; reset: () => void;
}

/** Mutable simulation state read by the canvas loop. Not reactive on purpose. */
export const sim: { agents: Record<AgentName, AgentSim>; t: number; leverDown: boolean; needle: number; kick: number; pops: Pop[] } = { agents: mk(), t: 0, leverDown: false, needle: 0, kick: 0, pops: [] };
export function pop(x: number, y: number, text: string, color: string) { sim.pops.push({ x, y, text, color, ts: Date.now() }); if (sim.pops.length > 8) sim.pops.shift(); }
const HINT_WORDS: Record<string, string> = { share: "share your screen", otp: "read the OTP", bank: "open your bank", link: "open their link", remote: "accept remote access", pay: "pay", notice: "read the notice" };
const TACTIC_WORD = (t: Tactic) => t.toLowerCase().replace(/_/g, " ");
function mk(): Record<AgentName, AgentSim> {
  const out = {} as Record<AgentName, AgentSim>;
  for (const a of Object.keys(SCENE.home) as AgentName[]) out[a] = { x: SCENE.home[a].x, y: SCENE.home[a].y, pose: "idle", facing: 1, queue: [], actUntil: 0, frame: 0 };
  return out;
}
export function enqueue(a: AgentName, ...tasks: Task[]) { sim.agents[a].queue.push(...tasks); }
const go = (to: Pt): Task => ({ kind: "go", to });
const act = (ms: number): Task => ({ kind: "act", ms });
const home: Task = { kind: "home" };

const initial = { mode: "attract" as RoomMode, index: 0, ladder: "armed" as LadderState, cards: [] as Card[], crt: [] as RoomState["crt"], bubbles: {} as RoomState["bubbles"], phoneRinging: false, phoneLifted: false, familyOnLine: false, packetPercent: 0, flashKey: 0, drawerOpen: false, cabinetUntil: 0, device: "phone" as const, feed: [] as FeedItem[], tags: {} as Partial<Record<AgentName, Tag>>, phase: null as { label: string; until: number } | null, want: null as { text: string; until: number } | null, pulse: null as { key: string; until: number } | null };
let fid = 1;

export const useRoom = create<RoomState>((set, get) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  setDevice: (device) => set({ device }),
  setPhone: (phoneRinging, phoneLifted) => set({ phoneRinging, phoneLifted }),
  log: (agent, text, tone = "info", delta) => set((s) => ({ feed: [...s.feed, { id: fid++, agent, text, tone, delta, ts: Date.now() }].slice(-40) })),
  tag: (a, text, tone = "calm", ms = 4000) => set((s) => ({ tags: { ...s.tags, [a]: { text, tone, until: Date.now() + ms } } })),
  bubble: (a, text, hot, ms = 3200) => set((s) => ({ bubbles: { ...s.bubbles, [a]: { text: text.length > 42 ? text.slice(0, 40) + "…" : text, until: Date.now() + ms, hot } } })),
  reset: () => { sim.agents = mk(); sim.leverDown = false; sim.needle = 0; sim.kick = 0; sim.pops = []; set({ ...initial }); },
  apply: (e) => {
    const { bubble: b, log, tag } = get(); const S = SCENE.spots; const O = SCENE.objects;
    const gauge = { x: O.gauge.x + O.gauge.w / 2, y: O.gauge.y + 10 };
    switch (e.type) {
      case "scammer.say":
        if (e.hint) { set({ want: { text: `caller wants you to ${HINT_WORDS[e.hint] ?? e.hint}`, until: Date.now() + 9000 } }); log("caller", `wants you to ${HINT_WORDS[e.hint] ?? e.hint}`, "warn"); }
        break;
      case "drill.state": set({ index: e.drill.index, ladder: e.drill.ladder, device: e.drill.device }); sim.leverDown = e.drill.ladder === "tripped"; break;
      case "call.incoming": set({ phoneRinging: true }); b("listener", "the phone on the desk is ringing", false, 4000); break;
      case "transcript.partial": sim.agents.listener.actUntil = Date.now() + 1200; break;
      case "listener.hearing": sim.agents.listener.actUntil = Date.now() + 700; break;
      case "judge.stance": {
        const w = e.stance === "resist" ? "you pushed back" : e.stance === "comply" ? "you went along" : e.stance === "leak" ? "that was the OTP" : "heard you";
        tag("listener", w, e.stance === "resist" ? "good" : e.stance === "leak" ? "hot" : e.stance === "comply" ? "warn" : "calm", 5000);
        if (e.stance !== "neutral") log("you", w, e.stance === "resist" ? "good" : e.stance === "leak" ? "hot" : "warn");
        break;
      }
      case "family.notified": b("guardian", `messaged ${e.name} on WhatsApp`, false, 5000); tag("guardian", `messaging ${e.name}`, "good", 7000); log("guardian", `messaged ${e.name} (${e.relation}) on WhatsApp`, "good"); set({ familyOnLine: true }); enqueue("guardian", go(S.booth), act(4000)); break;
      case "family.replied": b("guardian", `${e.name} replied`, false, 4000); tag("guardian", `${e.name} replied`, "good", 6000); log("guardian", `${e.name}: “${e.text.slice(0, 60)}”`, "good"); break;
      case "ui.render": b("archivist", "they sent a page", false, 3000); tag("archivist", "page intercepted", "warn", 5000); log("archivist", `caller sent a page: ${e.step.url ?? e.step.title}`, "warn"); set({ pulse: { key: "desk", until: Date.now() + 2500 } }); enqueue("archivist", go(S.cabinet), act(800), home); break;
      case "caller.reaction": tag("listener", "caller saw that", "warn", 3500); log("caller", `reacts to what you did (${e.to.replace(/_/g, " ")})`, "warn"); set({ pulse: { key: "desk", until: Date.now() + 1800 } }); break;
      case "transcript.final": set((s) => ({ crt: [...s.crt, { who: e.speaker, text: e.text }].slice(-6) })); sim.agents.listener.actUntil = Date.now() + 900; break;
      case "move.pinned": {
        const words = e.tactics.map(TACTIC_WORD).join(" + ");
        set((s) => ({ cards: [...s.cards, { tactics: e.tactics, delta: e.delta, ts: Date.now() + 700 }].slice(-15), index: e.index }));
        tag("analyst", `pinning ${words}`, e.delta >= 10 ? "hot" : "warn", 4500);
        log("analyst", `caller used ${words}`, e.delta >= 10 ? "hot" : "warn", e.delta);
        sim.kick = Math.min(12, e.delta); pop(gauge.x, gauge.y, `+${e.delta}`, e.delta >= 10 ? "#e4572e" : "#f0b27a");
        enqueue("analyst", go(S.board), act(1000), home); break;
      }
      case "index.update": set({ index: e.index }); break;
      case "playbook.match": {
        const cur = get().phase?.label;
        const label = `${e.phase.toUpperCase()} · ${e.family}`;
        if (cur !== label) { set({ phase: { label, until: Date.now() + 6000 } }); tag("archivist", `phase: ${e.phase}`, "info", 5000); log("archivist", `playbook phase → ${e.phase} (${Math.round(e.score * 100)}% match)`, "info"); }
        enqueue("archivist", go(S.cabinet), act(900), home); set({ drawerOpen: true, cabinetUntil: Date.now() + 1800 }); break;
      }
      case "signal.fired": {
        const words = e.kind.replace(/_/g, " ");
        set({ index: e.index, pulse: { key: e.kind === "went_along" ? "listenerDesk" : "desk", until: Date.now() + 2200 } });
        tag("guardian", `signal: ${words}`, e.delta >= 15 ? "hot" : "warn", 4500);
        log(e.kind === "went_along" ? "you" : "guardian", e.kind === "went_along" ? "went along with an instruction" : `device signal: ${words}`, e.delta >= 15 ? "hot" : "warn", e.delta);
        sim.kick = Math.min(14, e.delta + 2); pop(gauge.x, gauge.y, `+${e.delta}`, e.delta >= 15 ? "#e4572e" : "#f0b27a");
        break;
      }
      case "ladder.step":
        set({ ladder: e.to, index: e.index });
        if (e.to === "warn") { enqueue("guardian", go(S.lever), act(800)); tag("guardian", "watching the needle", "warn", 6000); log("guardian", "needle in amber · warn", "warn"); }
        if (e.to === "nudge") { enqueue("guardian", go(S.lever), act(1600)); tag("guardian", "hand on the lever", "hot", 8000); log("guardian", "one step from tripping · hand on the lever", "hot"); }
        break;
      case "breaker.trip":
        sim.leverDown = true; sim.kick = 16;
        set((s) => ({ ladder: "tripped", index: e.index, flashKey: s.flashKey + 1, mode: s.mode === "hidden" ? "hidden" : "tripped", want: null }));
        tag("guardian", "BREAKER TRIPPED", "hot", 12000); log("guardian", `breaker tripped at ${e.index} · caller muted`, "hot");
        pop(O.lever.x + O.lever.w / 2, O.lever.y, "TRIP", "#e4572e");
        sim.agents.guardian.queue = [];
        enqueue("guardian", go(S.lever), act(500), go(S.booth), act(5000));
        break;
      case "family.called": set({ familyOnLine: true }); break;
      case "packet.progress": set({ packetPercent: e.percent }); tag("reporter", `printing ${e.percent}%`, "info", 4000); if (!sim.agents.reporter.queue.length) enqueue("reporter", go(S.printer), act(2500)); break;
      case "packet.ready": set({ packetPercent: 100 }); tag("reporter", "packet ready", "good", 6000); log("reporter", "1930 packet printed", "good"); enqueue("reporter", go(S.printer), act(600), go(S.desk), act(900), home); break;
      case "agent.state":
        if (e.bubble) { b(e.agent, e.bubble, false, 3200); if (e.state === "act") tag(e.agent, e.bubble.length > 26 ? e.bubble.slice(0, 24) + "…" : e.bubble, "calm", 3500); }
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
