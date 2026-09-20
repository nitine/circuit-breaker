import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Room } from "~/room/Room";
import { useRoom, sim } from "~/room/roomStore";
import { Topbar } from "~/components/Topbar";
import { api } from "~/shared/api";
import type { Debrief } from "~/shared/types";
import { MdPlayArrow, MdStop, MdDownload, MdFamilyRestroom, MdTouchApp, MdShield, MdCheckCircle, MdWarning, FiZap, FiMonitor, FiSmartphone } from "~/components/icons";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/drill/$drillId_/debrief")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  component: DebriefPage,
});

function hms(s: number) { return `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`; }
const SIGNAL_WORDS: Record<string, string> = { went_along: "went along with an instruction", scare_page: "a scare page opened", long_call: "stayed on the line past 3 minutes", group_isolation: "joined the group and was told to keep quiet", share_accepted: "shared the screen", remote_accepted: "let them take control", otp_arrived: "an OTP arrived", bank_opened: "opened the bank", otp_read: "read out the OTP", payment_tapped: "tapped pay", link_opened: "opened their link", otp_opened: "opened the OTP message", app_opened: "opened an app", share_dismissed: "refused to share", remote_dismissed: "refused remote access", link_dismissed: "closed their page", pay_cancelled: "backed out of the payment", toast_dismissed: "dismissed the notification", window_closed: "closed a window", app_left: "left the call screen", muted: "muted the mic", camera_off: "turned the camera off", guardian_called: "called family", call_ended: "hung up", share_shown: "saw the share prompt", remote_shown: "saw the remote-access request" };

type Row = { ts: number; kind: "caller" | "you" | "member" | "device" | "ui" | "family" | "trip" | "signal"; text: string; sub?: string; tone?: "bad" | "good" | "warn" };

function DebriefPage() {
  const { drillId } = Route.useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["debrief", drillId], queryFn: () => api.debrief(drillId), refetchInterval: (query) => (query.state.data?.packetStatus === "pending" ? 3000 : false) });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const timers = useRef<number[]>([]);
  useEffect(() => { const r = useRoom.getState(); r.reset(); r.setMode("file"); r.setPhone(false, false); }, []);
  useEffect(() => { const d = q.data; if (!d) return; const r = useRoom.getState(); r.bubble("reporter", "here's your file", false, 6000); setTimeout(() => r.bubble("listener", "rewinding the tape…", false, 5000), 1200); setTimeout(() => r.bubble("analyst", `${d.moves.length} cards. not bad.`, false, 5000), 2400); if (d.trip) { sim.leverDown = true; } }, [q.data]);

  const d = q.data;
  const t0 = d ? (d.drill.startedAt ?? d.drill.createdAt) : 0;
  const total = d ? Math.max(1, d.durationSec) : 1;

  const rows = useMemo<Row[]>(() => {
    if (!d) return [];
    const out: Row[] = [];
    const moveAt = (ts: number) => d.moves.find((m) => Math.abs(m.ts - ts) < 1500);
    for (const u of d.utterances) {
      if (u.speaker === "scammer") { const m = moveAt(u.ts); out.push({ ts: u.ts, kind: "caller", text: u.text, sub: m ? `${m.tactics.map((t) => t.toLowerCase().replace(/_/g, " ")).join(" + ")} · +${m.delta} → index ${m.index}` : u.kind?.startsWith("reaction") ? `reacting to: ${u.kind === "reaction:silence" ? "your silence" : SIGNAL_WORDS[u.kind.slice(9)] ?? `you ${u.kind.slice(9).replace(/_/g, " ")}`}` : undefined, tone: m ? "bad" : undefined }); }
      else if (u.speaker === "judge") out.push({ ts: u.ts, kind: "you", text: u.text, sub: u.stance === "comply" ? "you went along" : u.stance === "resist" ? "you pushed back" : u.stance === "leak" ? "you leaked something" : undefined, tone: u.stance === "resist" ? "good" : u.stance === "leak" ? "bad" : u.stance === "comply" ? "warn" : undefined });
      else out.push({ ts: u.ts, kind: "member", text: u.text, sub: u.name });
    }
    for (const s of d.signals) out.push({ ts: s.ts, kind: "device", text: SIGNAL_WORDS[s.kind] ?? s.kind.replace(/_/g, " "), sub: s.delta ? `${s.delta > 0 ? "+" : ""}${s.delta} → index ${s.index}` : `index ${s.index}`, tone: s.delta > 0 ? "bad" : s.delta < 0 ? "good" : undefined });
    for (const s of d.uiSteps) out.push({ ts: s.ts, kind: "ui", text: `${s.title}`, sub: s.action ? `you chose “${s.action}”` : "shown on the device", tone: s.action === "close" || s.action === "cancel" ? "good" : s.action ? "warn" : undefined });
    if (d.trip) { out.push({ ts: d.trip.ts, kind: "trip", text: `Breaker tripped at index ${d.trip.index}`, tone: "warn" }); out.push({ ts: d.trip.ts + 1, kind: "family", text: `${d.drill.world.guardian.name} was messaged on WhatsApp`, sub: `${d.drill.world.guardian.relation} · replied and told you to hang up` }); }
    return out.sort((a, b) => a.ts - b.ts);
  }, [d]);

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
    const speed = Math.max(4, (total * 1000) / 20000);
    for (const e of events) timers.current.push(window.setTimeout(() => { e.fn(); setPos(e.at / 1000); }, Math.max(0, e.at / speed)));
    timers.current.push(window.setTimeout(() => { setPlaying(false); setPos(total); }, (total * 1000) / speed + 500));
  }
  function stop() { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); }
  const again = useMutation({ mutationFn: (hard: boolean) => api.createDrill({ personaId: d!.drill.personaId === "custom" ? undefined : d!.drill.personaId, personaText: d!.drill.personaId === "custom" ? d!.drill.world.personaName : undefined, family: d!.drill.family, device: d!.drill.device, hardMode: hard, language: d!.drill.language }), onSuccess: (x) => nav({ to: "/drill/$drillId", params: { drillId: x.id }, search: {} }) });

  if (!d) return <div className="debrief"><div className="bg"><Room camera="desk" /></div><Topbar /><div style={{ position: "relative", zIndex: 5, padding: 120, fontFamily: "var(--font-pixel)" }}>{q.error ? "Couldn't find that drill." : "Pulling the file…"}</div></div>;
  const ending = d.drill.ending ?? (d.trip ? "B" : "A");
  const held = d.durationSec; const avg = d.averageVictimSec;
  const marks = [...d.moves.map((m) => ({ at: (m.ts - t0) / 1000, label: m.tactics[0]?.toLowerCase().replace("_", " ") ?? "move" })), ...(d.trip ? [{ at: (d.trip.ts - t0) / 1000, label: "TRIP" }] : [])];
  const resisted = d.utterances.filter((u) => u.stance === "resist").length; const complied = d.utterances.filter((u) => u.stance === "comply").length;
  const story = ending === "A"
    ? `Hung up at ${hms(held)}. The average victim folds at ${hms(avg)}.\nYou pushed back ${resisted} time${resisted === 1 ? "" : "s"} and went along ${complied}.\nGave away: ${d.leaked.length ? d.leaked.join("; ") : "nothing usable."}\n₹${d.atRisk.toLocaleString("en-IN")} is still in the bank.`
    : ending === "C"
    ? `The caller got what they came for at ${hms(held)}.\nHere is the exact moment: ${d.leaked[0] ?? "the payment"}.\nWith the room visible, the breaker would have tripped at index 70.\nThe bank shows the money leaving. This is why the room exists.`
    : `Held the line for ${hms(held)}. The average victim folds at ${hms(avg)}.\nThe caller made ${d.moves.length} moves and reacted to your device ${d.reactions} time${d.reactions === 1 ? "" : "s"}.\nGave away: ${d.leaked.length ? d.leaked.join("; ") : "nothing usable."}\n${d.drill.world.guardian.name} was messaged. The caller hung up.\n₹${d.atRisk.toLocaleString("en-IN")} is still in the bank.`;
  return (
    <div className="debrief">
      <div className="bg"><Room camera="desk" /></div><div className="warm" />
      <Topbar right={<span style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>{d.drill.personaName}, {d.drill.world.personaAge} · {d.drill.familyLabel} · {d.drill.device === "laptop" ? <FiMonitor size={13} /> : <FiSmartphone size={13} />}</span>} />
      <div className="layout">
        <div className="paper">
          <div className="clip" />
          <h2>DRILL REPORT No. {d.drill.id.slice(0, 4).toUpperCase()}</h2>
          <div className="meta">{`Subject: ${d.drill.personaName}, ${d.drill.world.personaAge}, ${d.drill.world.city}\nCase: '${d.drill.caller.org}' · ${d.drill.familyLabel} · ${d.drill.language === "hi" ? "Hindi" : "English"}\nDevice: ${d.drill.device} · Duration: ${hms(held)} · Listener: ${d.drill.features.stt ?? "typed"} · Caller: ${d.drill.features.llm ?? "scripted"}`}</div>
          <div className={`stamp ${ending === "A" ? "green" : ending === "C" ? "dark" : ""}`}>{ending === "A" ? "GOT OUT" : ending === "C" ? "LEAKED" : "BREAKER TRIPPED"}<br />{ending === "B" && d.trip ? hms(Math.round((d.trip.ts - t0) / 1000)) : hms(held)}</div>
          <div className="rule" />
          <div className="story">{story}</div>
          <div className="lbl">MOVE BY MOVE</div>
          <div className="report">
            {rows.map((r, i) => (
              <div key={i} className={`rrow ${r.kind} ${r.tone ?? ""}`}>
                <span className="t">{hms(Math.round((r.ts - t0) / 1000))}</span>
                <span className="who">{r.kind === "caller" ? d.drill.caller.name.split(" ")[0] : r.kind === "you" ? "You" : r.kind === "member" ? r.sub : r.kind === "device" ? <><MdTouchApp size={12} /> device</> : r.kind === "ui" ? <><FiMonitor size={12} /> page</> : r.kind === "family" ? <><MdFamilyRestroom size={12} /> family</> : r.kind === "trip" ? <><FiZap size={12} /> room</> : "room"}</span>
                <span className="txt">{r.text}{r.sub && r.kind !== "member" && <small>{r.sub}</small>}</span>
              </div>
            ))}
            {!rows.length && <div className="rrow"><span className="txt">The call ended before anything was said.</span></div>}
          </div>
          <div className="lbl">MOVES {ending === "C" ? "LANDED" : "SURVIVED"}</div>
          <div className="moves">{d.moves.length ? d.moves.map((m, i) => <div key={i} className="move" style={{ transform: `rotate(${(i % 3 - 1) * 2}deg)` }}><MdCheckCircle size={12} /> {m.tactics.join(" + ")}<small>+{m.delta} idx · {m.phase}</small></div>) : <span style={{ fontSize: 12 }}>none pinned</span>}</div>
          {d.signals.length > 0 && <><div className="lbl">WHAT YOU DID ON THE DEVICE</div><div className="moves">{d.signals.map((s, i) => <div key={i} className={`move ${s.delta < 0 ? "good" : ""}`}>{s.delta > 0 ? <MdWarning size={12} /> : <MdShield size={12} />} {SIGNAL_WORDS[s.kind] ?? s.kind.replace(/_/g, " ")}<small>{s.delta > 0 ? "+" : ""}{s.delta} idx</small></div>)}</div></>}
          <div className="lbl">STICKERS EARNED</div>
          <div className="stickers">{d.stickers.length ? d.stickers.map((s) => <span key={s} className="sticker">{s}</span>) : <span className="sticker">next time</span>}</div>
          <div className="rule" />
          <div className="sig"><span>filed by the Reporter · {d.packetStatus === "ready" ? "1930 packet attached" : d.packetStatus === "pending" ? "Lambda is still writing the packet…" : "packet available on request"}</span><div className="ring" /></div>
        </div>
        <div className="right">
          <div className={`tape ${playing ? "playing" : ""}`}>
            <div className="reels"><div className="reel" /><span>REPLAY THE DRILL · agents re-walk, board refills, needle re-climbs</span><div className="reel" /></div>
            <div className="strip"><div className="played" style={{ width: `${Math.min(100, (pos / total) * 100)}%` }} />{marks.map((m, i) => <div key={i} className="mark" style={{ left: `${Math.min(97, (m.at / total) * 100)}%` }}>{hms(Math.round(m.at))} {m.label}</div>)}</div>
            <div className="btns"><button onClick={replay}><MdPlayArrow size={16} /> play the tape</button><button onClick={stop}><MdStop size={16} /> stop</button><span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 16 }}>{hms(Math.round(pos))} / {hms(total)}</span></div>
          </div>
          <div className="endings">
            <div className="ending" style={{ borderColor: ending === "A" ? "#1db954" : "#d9c9a8" }}><b>A · got out early</b>Board half full, lever never moved. You did the thing 2 in 3 victims don't.</div>
            <div className="ending" style={{ borderColor: ending === "B" ? "#e4572e" : "#d9c9a8" }}><b>B · breaker tripped</b>Index hit 70. {d.drill.world.guardian.name} was messaged and told you to hang up. Compared to the average victim, never to other players.</div>
            <div className="ending" style={{ borderColor: ending === "C" ? "#7a1e1e" : "#d9c9a8" }}><b>C · leaked (hard mode)</b>Room hidden, the caller won. The file shows the exact moment and what the room would have done.</div>
          </div>
          <div className="ctas">
            <button className="px-btn primary" onClick={() => nav({ to: "/drill/new" })}>Another persona</button>
            <button className="px-btn" onClick={() => again.mutate(true)} disabled={again.isPending}>Same case, hard mode</button>
            <a className="px-btn" href={d.packetUrl ?? `/api/drills/${d.drill.id}/packet`} target="_blank" rel="noreferrer"><MdDownload size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Download the 1930 file</a>
            <Link to="/how" className="px-btn ghost">How the room works</Link>
          </div>
          <div className="polaroid"><div className="photo"><img src={`/room/sprites/${d.drill.personaId === "custom" ? "custom" : d.drill.personaId}.png`} alt="" style={{ height: 48, imageRendering: "pixelated" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> {d.drill.personaName}</div>{ending === "C" ? "learned the hard way" : `survived a ${d.drill.familyLabel.toLowerCase()} drill`}<div style={{ fontSize: 9, color: "#8a7a62", marginTop: 4 }}>pinned to the cork board</div></div>
        </div>
      </div>
    </div>
  );
}
