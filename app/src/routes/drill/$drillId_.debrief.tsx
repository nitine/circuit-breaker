import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Room } from "~/room/Room";
import { useRoom, sim } from "~/room/roomStore";
import { Topbar } from "~/components/Topbar";
import { api } from "~/shared/api";
import type { Debrief } from "~/shared/types";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/drill/$drillId_/debrief")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  component: DebriefPage,
});

function hms(s: number) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

function DebriefPage() {
  const { drillId } = Route.useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["debrief", drillId], queryFn: () => api.debrief(drillId), refetchInterval: (query) => (query.state.data?.packetStatus === "pending" ? 3000 : false) });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const timers = useRef<number[]>([]);
  useEffect(() => { const r = useRoom.getState(); r.reset(); r.setMode("file"); r.setPhone(false, false); }, []);
  useEffect(() => { const d = q.data; if (!d) return; const r = useRoom.getState(); r.bubble("reporter", "here's your file 📄", false, 6000); setTimeout(() => r.bubble("listener", "rewinding the tape…", false, 5000), 1200); setTimeout(() => r.bubble("analyst", `${d.moves.length} cards. not bad.`, false, 5000), 2400); if (d.trip) { sim.leverDown = true; } }, [q.data]);

  const d = q.data;
  const t0 = d ? (d.drill.startedAt ?? d.drill.createdAt) : 0;
  const total = d ? Math.max(1, d.durationSec) : 1;

  function replay() {
    if (!d) return;
    stop();
    const r = useRoom.getState(); r.reset(); r.setMode("file"); sim.leverDown = false;
    setPlaying(true); setPos(0);
    const events: { at: number; fn: () => void }[] = [];
    for (const u of d.utterances) events.push({ at: u.ts - t0, fn: () => r.apply({ type: "transcript.final", speaker: u.speaker, text: u.text, name: u.name, seq: 0 }) });
    for (const m of d.moves) events.push({ at: m.ts - t0, fn: () => { r.apply({ type: "move.pinned", tactics: m.tactics, delta: m.delta, quote: m.quote, index: m.index, seq: 0 }); r.apply({ type: "playbook.match", family: d.drill.familyLabel, phase: m.phase, score: m.playbookScore, next: "", seq: 0 }); } });
    for (const s of d.signals) events.push({ at: s.ts - t0, fn: () => r.apply({ type: "signal.fired", kind: s.kind, delta: s.delta, index: s.index, seq: 0 }) });
    for (const l of d.ladder) events.push({ at: l.ts - t0, fn: () => r.apply({ type: "ladder.step", from: l.from, to: l.to, index: l.index, seq: 0 }) });
    if (d.trip) events.push({ at: d.trip.ts - t0, fn: () => r.apply({ type: "breaker.trip", index: d.trip!.index, seq: 0 }) });
    const speed = Math.max(4, (total * 1000) / 20000); // whole drill in ~20s
    for (const e of events) timers.current.push(window.setTimeout(() => { e.fn(); setPos(e.at / 1000); }, Math.max(0, e.at / speed)));
    timers.current.push(window.setTimeout(() => { setPlaying(false); setPos(total); }, (total * 1000) / speed + 500));
  }
  function stop() { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); }
  const again = useMutation({ mutationFn: (hard: boolean) => api.createDrill({ personaId: d!.drill.personaId === "custom" ? undefined : d!.drill.personaId, personaText: d!.drill.personaId === "custom" ? d!.drill.world.personaName : undefined, family: d!.drill.family, device: d!.drill.device, hardMode: hard }), onSuccess: (x) => nav({ to: "/drill/$drillId", params: { drillId: x.id }, search: {} }) });

  if (!d) return <div className="debrief"><div className="bg"><Room camera="desk" /></div><Topbar /><div style={{ position: "relative", zIndex: 5, padding: 120, fontFamily: "var(--font-pixel)" }}>{q.error ? "Couldn't find that drill." : "Pulling the file…"}</div></div>;
  const ending = d.drill.ending ?? (d.trip ? "B" : "A");
  const held = d.durationSec; const avg = d.averageVictimSec;
  const marks = [...d.moves.map((m) => ({ at: (m.ts - t0) / 1000, label: m.tactics[0]?.toLowerCase().replace("_", " ") ?? "move" })), ...(d.trip ? [{ at: (d.trip.ts - t0) / 1000, label: "TRIP" }] : [])];
  return (
    <div className="debrief">
      <div className="bg"><Room camera="desk" /></div><div className="warm" />
      <Topbar right={<span style={{ fontSize: 12 }}>{d.drill.personaName}, {d.drill.world.personaAge} · {d.drill.familyLabel} · {d.drill.device}</span>} />
      <div className="layout">
        <div className="paper">
          <div className="clip" />
          <h2>DRILL REPORT No. {d.drill.id.slice(0, 4).toUpperCase()}</h2>
          <div className="meta">{`Subject: ${d.drill.personaName}, ${d.drill.world.personaAge}, ${d.drill.world.city}\nCase: '${d.drill.caller.org}' · ${d.drill.familyLabel}\nDevice: ${d.drill.device} · Duration: ${hms(held)}`}</div>
          <div className={`stamp ${ending === "A" ? "green" : ending === "C" ? "dark" : ""}`}>{ending === "A" ? "GOT OUT" : ending === "C" ? "LEAKED" : "BREAKER TRIPPED"}<br />{ending === "B" && d.trip ? hms(Math.round((d.trip.ts - t0) / 1000)) : hms(held)}</div>
          <div className="rule" />
          <div className="story">{ending === "A" ? `Hung up at ${hms(held)}. The average victim folds at ${hms(avg)}.\nYou did the thing two in three victims don't.\nGave away: ${d.leaked.length ? d.leaked.join("; ") : "nothing usable."}\n₹${d.atRisk.toLocaleString("en-IN")} is still in the bank.` : ending === "C" ? `The caller got what they came for at ${hms(held)}.\nHere is the exact moment: ${d.leaked[0] ?? "the payment"}.\nWith the room visible, the breaker would have tripped at index 70.\nThe bank shows the money leaving. This is why the room exists.` : `Held the line for ${hms(held)}. The average victim folds at ${hms(avg)}.\nGave away: ${d.leaked.length ? d.leaked.join("; ") : "nothing usable."}\n${d.drill.world.guardian.name} was called. The caller hung up.\n₹${d.atRisk.toLocaleString("en-IN")} is still in the bank.`}</div>
          <div className="lbl">MOVES {ending === "C" ? "LANDED" : "SURVIVED"}</div>
          <div className="moves">{d.moves.length ? d.moves.map((m, i) => <div key={i} className="move" style={{ transform: `rotate(${(i % 3 - 1) * 2}deg)` }}>✔ {m.tactics.join(" + ")}<small>+{m.delta} idx · {m.phase}</small></div>) : <span style={{ fontSize: 12 }}>none pinned</span>}</div>
          {d.signals.length > 0 && <><div className="lbl">SESSION SIGNALS</div><div className="moves">{d.signals.map((s, i) => <div key={i} className="move">⚡ {s.kind.replace(/_/g, " ")}<small>+{s.delta} idx</small></div>)}</div></>}
          <div className="lbl">STICKERS EARNED</div>
          <div className="stickers">{d.stickers.length ? d.stickers.map((s) => <span key={s} className="sticker">{s}</span>) : <span className="sticker">🌱 next time</span>}</div>
          <div className="rule" />
          <div className="sig"><span>filed by the Reporter · {d.packetStatus === "ready" ? "1930 packet attached ↓" : d.packetStatus === "pending" ? "Lambda is still writing the packet…" : "packet available on request"}</span><div className="ring" /></div>
        </div>
        <div className="right">
          <div className={`tape ${playing ? "playing" : ""}`}>
            <div className="reels"><div className="reel" /><span>REPLAY THE DRILL · agents re-walk, board refills, needle re-climbs</span><div className="reel" /></div>
            <div className="strip"><div className="played" style={{ width: `${Math.min(100, (pos / total) * 100)}%` }} />{marks.map((m, i) => <div key={i} className="mark" style={{ left: `${Math.min(97, (m.at / total) * 100)}%` }}>{hms(Math.round(m.at))} {m.label}</div>)}</div>
            <div className="btns"><button onClick={replay}>▶ play the tape</button><button onClick={stop}>■ stop</button><span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 16 }}>{hms(Math.round(pos))} / {hms(total)}</span></div>
          </div>
          <div className="endings">
            <div className="ending" style={{ borderColor: ending === "A" ? "#1db954" : "#d9c9a8" }}><b>A · got out early</b>Board half full, lever never moved. You did the thing 2 in 3 victims don't.</div>
            <div className="ending" style={{ borderColor: ending === "B" ? "#e4572e" : "#d9c9a8" }}><b>B · breaker tripped</b>Index hit 70. {d.drill.world.guardian.name} was put on the line. Compared to the average victim, never to other players.</div>
            <div className="ending" style={{ borderColor: ending === "C" ? "#7a1e1e" : "#d9c9a8" }}><b>C · leaked (hard mode)</b>Room hidden, the caller won. The file shows the exact moment and what the room would have done.</div>
          </div>
          <div className="ctas">
            <button className="px-btn primary" onClick={() => nav({ to: "/drill/new" })}>Another persona</button>
            <button className="px-btn" onClick={() => again.mutate(true)} disabled={again.isPending}>Same case, hard mode</button>
            <a className="px-btn" href={d.packetUrl ?? `/api/drills/${d.drill.id}/packet`} target="_blank" rel="noreferrer">⬇ Download the 1930 file</a>
            <Link to="/how" className="px-btn ghost">How the room works</Link>
          </div>
          <div className="polaroid"><div className="photo">{ending === "C" ? "😬" : "✌"} {d.drill.personaName}</div>{ending === "C" ? "learned the hard way" : `survived a ${d.drill.familyLabel.toLowerCase()} drill`}<div style={{ fontSize: 9, color: "#8a7a62", marginTop: 4 }}>pinned to the cork board</div></div>
        </div>
      </div>
    </div>
  );
}
