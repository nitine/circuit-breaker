import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentName } from "~/shared/types";
import { RoomCanvas, hitTest } from "./RoomCanvas";
import { sim, useRoom } from "./roomStore";
import { W, H, OBJ, AGENT_LABEL } from "./layout";
const AGENT_COLOR: Record<AgentName, string> = { listener: "#2fa7d9", analyst: "#e4572e", archivist: "#b58b3a", guardian: "#1db954", reporter: "#9b6bd6" };
const AGENT_ROLE: Record<AgentName, string> = { listener: "hears you", analyst: "scores the caller", archivist: "knows the playbook", guardian: "holds the breaker", reporter: "files the case" };
const AGENT_SERVICE_SHORT: Record<AgentName, string> = { listener: "Amazon Transcribe", analyst: "Bedrock + Guardrails", archivist: "Playbook corpus", guardian: "Escalation ladder + Polly", reporter: "Strands on Lambda" };
import { SCENE } from "./scene";

export function Room({ children, camera = "none", showHud = false, interactiveHover, onHover, className = "", hideBubblesLeftOf = 0, tooltips = false, parallax = false }: {
  children?: ReactNode; camera?: "none" | "push" | "desk"; showHud?: boolean; interactiveHover?: boolean; onHover?: (o: string | null) => void; className?: string; hideBubblesLeftOf?: number; tooltips?: boolean; parallax?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const mode = useRoom((s) => s.mode);
  const bubbles = useRoom((s) => s.bubbles);
  const crt = useRoom((s) => s.crt);
  const index = useRoom((s) => s.index);
  const ladder = useRoom((s) => s.ladder);
  const flashKey = useRoom((s) => s.flashKey);
  const [, force] = useState(0);
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const [par, setPar] = useState({ x: 0, y: 0 });
  const cards = useRoom((s) => s.cards);
  const packetPercent = useRoom((s) => s.packetPercent);
  const familyOnLine = useRoom((s) => s.familyOnLine);
  const tags = useRoom((s) => s.tags);
  const phase = useRoom((s) => s.phase);
  const want = useRoom((s) => s.want);
  const showTags = mode === "attract" || mode === "dimmed" || mode === "live" || mode === "tripped";
  const liveRoom = mode === "live" || mode === "tripped";

  useEffect(() => {
    const el = frameRef.current!;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el); setScale(el.clientWidth / W);
    return () => ro.disconnect();
  }, []);
  // Re-render overlay positions at ~20fps so bubbles follow sprites.
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 50); return () => clearInterval(id); }, []);

  const now = Date.now();
  const onMove = (ev: React.MouseEvent) => {
    const el = frameRef.current!; const r = el.getBoundingClientRect();
    if (parallax) setPar({ x: ((ev.clientX - r.left) / r.width - 0.5) * 18, y: ((ev.clientY - r.top) / r.height - 0.5) * 10 });
    if (!tooltips) return;
    const cam = el.querySelector(".room-cam") as HTMLElement | null; const canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return; const cr = canvas.getBoundingClientRect();
    const x = ((ev.clientX - cr.left) / cr.width) * W, y = ((ev.clientY - cr.top) / cr.height) * H;
    const key = hitTest(x, y); void cam;
    setTip(key ? { key, x: ev.clientX - r.left, y: ev.clientY - r.top } : null);
  };
  const tipBody = (key: string) => {
    const a = key as AgentName;
    if (AGENT_LABEL[a]) { const b = bubbles[a]; return <><b>{AGENT_LABEL[a]}</b>{b?.text ?? "idle"}<div style={{ fontSize: 11, opacity: .7, marginTop: 4 }}>{AGENT_SERVICE_SHORT[a]}</div></>; }
    switch (key) {
      case "gauge": return <><b>Coercion index</b>{Math.round(index)} / 100 · warn 40 · nudge 55 · trip 70<div style={{ fontSize: 11, opacity: .7 }}>Sum of tactic weights, escalation, and device signals.</div></>;
      case "board": return <><b>Cork board · {cards.length} cards</b>{cards.length ? <ul>{cards.slice(-5).map((c, i) => <li key={i}>{c.tactics.join(" + ")} +{c.delta}</li>)}</ul> : "Nothing pinned yet."}</>;
      case "lever": return <><b>Breaker</b>{ladder === "tripped" ? "Tripped. Family is on the line." : `Armed · state ${ladder}.`}<div style={{ fontSize: 11, opacity: .7 }}>Drops at index 70. Ducks the caller, calls family.</div></>;
      case "crt": return <><b>Live transcript</b>{crt.length ? crt[crt.length - 1].text.slice(0, 80) : "Waiting for the call."}</>;
      case "cabinet": return <><b>Playbook cabinet</b>Five case files. The Archivist matches the live call to a phase and predicts the next move.</>;
      case "booth": return <><b>Phone booth</b>{familyOnLine ? "Family is on the line." : "Where the Guardian calls family on trip."}</>;
      case "printer": return <><b>1930 packet</b>{packetPercent ? `${packetPercent}% printed` : "Prints the helpline report when the drill ends."}</>;
      case "listenerDesk": return <><b>Listening desk</b>Transcribe streaming, partials on. Only while you're speaking.</>;
      case "desk": case "phone": return <><b>Your desk</b>The device you're on. Everything you tap there is a signal here.</>;
      default: return <b>{key}</b>;
    }
  };
  return (
    <div ref={frameRef} className={`room-frame ${mode === "dimmed" ? "dimmed" : ""} ${className}`} onMouseMove={tooltips || parallax ? onMove : undefined} onMouseLeave={() => { setTip(null); setPar({ x: 0, y: 0 }); }}>
      <div className={`room-cam ${camera === "push" ? "push" : camera === "desk" ? "desk" : ""}`} style={parallax ? { transform: `translate(${par.x}px, ${par.y}px) scale(1.03)` } : undefined}>
        <RoomCanvas interactiveHover={interactiveHover} onHover={onHover} />
        <div className="room-overlay" style={{ transform: "none" }}>
          {(Object.keys(sim.agents) as AgentName[]).map((a) => {
            const b = bubbles[a]; const ag = sim.agents[a];
            const show = b && b.until > now && ag.x >= hideBubblesLeftOf && !(liveRoom && showTags);
            const fw = frameRef.current?.clientWidth ?? W * scale; const half = 105;
            const left = Math.max(half + 6, Math.min(fw - half - 6, ag.x * scale));
            const headY = (ag.y - SCENE.spriteHeight * SCENE.depth(ag.y)) * scale;
            const tg = tags[a]; const live = tg && tg.until > now;
            const busy = ag.pose === "act" || ag.pose === "walk";
            return (
              <div key={a}>
                {showTags && ag.x >= hideBubblesLeftOf && (
                  <div className={`nametag ${live ? `t-${tg.tone}` : ""} ${busy ? "busy" : ""}`} style={{ left, top: headY - 8 * scale, fontSize: Math.max(8, Math.min(11, 13 * scale)), ["--c" as string]: AGENT_COLOR[a] }}>
                    <span className="nm"><i />{AGENT_LABEL[a].toUpperCase()}</span>
                    <span className="st">{live ? tg.text : AGENT_ROLE[a]}</span>
                  </div>
                )}
                <div className={`bubble ${show ? "show" : ""}`} style={{ left, top: headY - (showTags ? 30 : 6) * scale, fontSize: Math.max(11, Math.min(14, 18 * scale)) }}>
                  <span className="who">{AGENT_LABEL[a]} · </span>{b?.text}
                </div>
              </div>
            );
          })}
          {phase && phase.until > now && (
            <div className="phase-label" style={{ left: (OBJ.cabinet.x + OBJ.cabinet.w / 2) * scale, top: (OBJ.cabinet.y + 60) * scale, fontSize: Math.max(8, 11 * scale) }}>{phase.label}</div>
          )}
          {want && want.until > now && mode !== "hidden" && (
            <div className="want-label" style={{ left: "50%", top: 14, transform: "translateX(-50%)", fontSize: Math.max(10, 13 * scale) }}>{want.text} · you don't have to</div>
          )}
          {crt.length > 0 && (
            <div className="crt-text" style={{ left: (OBJ.crt.x + 10) * scale, top: (OBJ.crt.y + 10) * scale, width: (OBJ.crt.w - 20) * scale, height: (OBJ.crt.h - 20) * scale, fontSize: Math.max(8, 15 * scale) }}>
              {crt.slice(-4).map((l, i) => <div key={i}><span className={l.who === "judge" ? "me" : "who"}>{l.who === "judge" ? "YOU" : l.who === "member" ? "GRP" : "CALL"}</span> {l.text.slice(0, 60)}</div>)}
            </div>
          )}
        </div>
        <div key={flashKey} className={`flash ${flashKey ? "on" : ""}`} />
      </div>
      <div className="room-dim" />
      {tip && <div className="room-tip" style={{ left: tip.x, top: tip.y - 14 }}>{tipBody(tip.key)}</div>}
      {showHud && (
        <>
          <div className="hud" style={{ left: 16, top: 16 }}><b>COERCION {Math.round(index)} / 70</b><div className="meter"><i style={{ width: `${Math.min(100, index)}%`, background: index >= 70 ? "#e4572e" : index >= 55 ? "#ff8a65" : index >= 40 ? "#f0b27a" : "#8fbf8f" }} /><s style={{ left: "40%" }} /><s style={{ left: "55%" }} /><s style={{ left: "70%" }} /></div><small>{index >= 70 ? "tripped" : index >= 55 ? "one step from tripping" : index >= 40 ? "warn · Guardian watching" : "calm · nothing to act on"}</small></div>
          <div className={`hud ${ladder === "tripped" ? "accent" : ""}`} style={{ right: 16, top: 16 }}><b>{ladder === "tripped" ? "TRIPPED" : `BREAKER · ${ladder.toUpperCase()}`}</b><small>{ladder === "tripped" ? "lever down · family on the line" : ladder === "armed" ? "lever up" : ladder === "warn" ? "needle amber" : "one move from tripping"}</small></div>
        </>
      )}
      {children}
    </div>
  );
}

export const ROOM_ASPECT = H / W;

/** The room log: one line per thing an agent did and what it did to the index. Rendered under the room so it never covers the sprites. */
export function RoomLog({ rows = 5 }: { rows?: number }) {
  const feed = useRoom((s) => s.feed);
  const items = feed.slice(-rows);
  return (
    <div className="room-log">
      {items.length === 0 && <div className="row t-calm"><span className="ag" style={{ color: "#8fbf8f" }}>ROOM</span><span className="tx">quiet · the log fills as the agents react to the caller and to you</span></div>}
      {items.map((f) => (
        <div key={f.id} className={`row t-${f.tone}`}>
          <span className="ag" style={{ color: f.agent === "caller" ? "#ff8a65" : f.agent === "you" ? "#d8e8d8" : AGENT_COLOR[f.agent] }}>{f.agent === "caller" ? "CALLER" : f.agent === "you" ? "YOU" : AGENT_LABEL[f.agent].toUpperCase()}</span>
          <span className="tx">{f.text}</span>
          {typeof f.delta === "number" && f.delta !== 0 && <span className="dl">{f.delta > 0 ? "+" : ""}{f.delta}</span>}
        </div>
      ))}
    </div>
  );
}
