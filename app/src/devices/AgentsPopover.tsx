import { useDrill } from "~/drill/drillStore";
import { MdCallEnd, MdShield, MdFamilyRestroom, MdCheckCircle } from "~/components/icons";
import type { DrillSocket } from "~/drill/socket";

const AGENTS = ["listener", "analyst", "archivist", "guardian", "reporter"] as const;

/** The room steps onto the device: a small card from the five agents, on trip. Replaces the old "family is calling" overlay. */
export function AgentsPopover({ sock, compact = false }: { sock: DrillSocket; compact?: boolean }) {
  const drill = useDrill((s) => s.drill);
  const moves = useDrill((s) => s.moves);
  const family = useDrill((s) => s.family);
  const index = useDrill((s) => s.index);
  if (!drill) return null;
  const tactics = [...new Set(moves.flatMap((m) => m.tactics))].slice(0, 3);
  const g = drill.world.guardian;
  return (
    <div className={`agents-pop ${compact ? "compact" : ""}`} role="dialog" aria-label="The room stepped in">
      <div className="agents-row">{AGENTS.map((a) => <img key={a} src={`/room/sprites/${a}.png`} alt="" />)}</div>
      <div className="agents-title"><MdShield size={18} /> The room stepped in</div>
      <div className="agents-body">
        <p><b>You're being scammed.</b> The person on the line is not {drill.caller.org}. {tactics.length ? <>In the last few minutes they used <b>{tactics.map((t) => t.toLowerCase().replace("_", " ")).join(", ")}</b> on you.</> : null} Coercion index {index}.</p>
        <div className="agents-fam">
          <MdFamilyRestroom size={18} />
          <div>{family.notified ? <><b>{g.name}</b> ({g.relation}) has been messaged on WhatsApp.</> : <>Messaging <b>{g.name}</b>…</>}{family.reply && <div className="agents-reply"><MdCheckCircle size={14} /> {g.name}: “{family.reply}”</div>}</div>
        </div>
      </div>
      <div className="agents-actions">
        <button className="agents-hangup" onClick={() => sock.send({ type: "family.answered" })}><MdCallEnd size={18} /> Hang up now</button>
        <button className="agents-ghost" onClick={() => sock.send({ type: "drill.end" })}>Keep talking anyway</button>
      </div>
      <div className="agents-note">Nothing here is real. This is what the breaker does for someone you love.</div>
    </div>
  );
}
