import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentName } from "~/shared/types";
import { RoomCanvas } from "./RoomCanvas";
import { sim, useRoom } from "./roomStore";
import { W, H, OBJ, AGENT_LABEL } from "./layout";

export function Room({ children, camera = "none", showHud = false, interactiveHover, onHover, className = "" }: {
  children?: ReactNode; camera?: "none" | "push" | "desk"; showHud?: boolean; interactiveHover?: boolean; onHover?: (o: string | null) => void; className?: string;
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

  useEffect(() => {
    const el = frameRef.current!;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el); setScale(el.clientWidth / W);
    return () => ro.disconnect();
  }, []);
  // Re-render overlay positions at ~20fps so bubbles follow sprites.
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 50); return () => clearInterval(id); }, []);

  const now = Date.now();
  return (
    <div ref={frameRef} className={`room-frame ${mode === "dimmed" ? "dimmed" : ""} ${className}`}>
      <div className={`room-cam ${camera === "push" ? "push" : camera === "desk" ? "desk" : ""}`}>
        <RoomCanvas interactiveHover={interactiveHover} onHover={onHover} />
        <div className="room-overlay" style={{ transform: "none" }}>
          {(Object.keys(sim.agents) as AgentName[]).map((a) => {
            const b = bubbles[a]; const ag = sim.agents[a];
            const show = b && b.until > now;
            return (
              <div key={a} className={`bubble ${show ? "show" : ""} ${b?.hot ? "hot" : ""}`} style={{ left: ag.x * scale, top: (ag.y - 19) * scale, fontSize: Math.max(11, 7 * scale) }}>
                <span style={{ opacity: .6, fontSize: "0.8em" }}>{AGENT_LABEL[a]} · </span>{b?.text}
              </div>
            );
          })}
          {crt.length > 0 && (
            <div className="crt-text" style={{ left: OBJ.crt.x * scale, top: OBJ.crt.y * scale, width: OBJ.crt.w * scale, height: OBJ.crt.h * scale, fontSize: Math.max(8, 3.6 * scale) }}>
              {crt.slice(-4).map((l, i) => <div key={i}><span className={l.who === "judge" ? "me" : "who"}>{l.who === "judge" ? "YOU" : l.who === "member" ? "GRP" : "CALL"}</span> {l.text.slice(0, 60)}</div>)}
            </div>
          )}
        </div>
        <div key={flashKey} className={`flash ${flashKey ? "on" : ""}`} />
      </div>
      <div className="room-dim" />
      {showHud && (
        <>
          <div className="hud" style={{ left: 16, top: 16 }}><b>COERCION {Math.round(index)} / 70</b><small>needle on the wall gauge · trips at 70</small></div>
          <div className={`hud ${ladder === "tripped" ? "accent" : ""}`} style={{ right: 16, top: 16 }}><b>{ladder === "tripped" ? "TRIPPED" : `BREAKER · ${ladder.toUpperCase()}`}</b><small>{ladder === "tripped" ? "lever down · family on the line" : ladder === "armed" ? "lever up" : ladder === "warn" ? "needle amber" : "one move from tripping"}</small></div>
        </>
      )}
      {children}
    </div>
  );
}

export const ROOM_ASPECT = H / W;
