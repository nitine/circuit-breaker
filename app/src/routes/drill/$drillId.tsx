import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Room } from "~/room/Room";
import { useRoom } from "~/room/roomStore";
import { useDrill } from "~/drill/drillStore";
import { DrillSocket } from "~/drill/socket";
import { ensureAudio, playBase64, speakFallback, duck, Mic, browserRecognizer, stopPlayback } from "~/drill/audio";
import { AndroidShell } from "~/devices/android/AndroidShell";
import { WindowsShell } from "~/devices/windows/WindowsShell";
import type { ServerEvent } from "~/shared/types";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/drill/$drillId")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  validateSearch: (s: Record<string, unknown>): { auto?: 1 } => (s.auto === "1" || s.auto === true || s.auto === 1 ? { auto: 1 } : {}),
  component: DrillPage,
});

const AUTO_LINES = ["Hello? Yes, this is me. What is this about?", "I don't understand, I only ordered a phone.", "Oh no. What do I have to do?", "Okay… I am listening. Please don't do anything.", "I am opening it now. Please wait.", "Alright, tell me what to do next."];

function DrillPage() {
  const { drillId } = Route.useParams();
  const { auto } = Route.useSearch();
  const nav = useNavigate();
  const sockRef = useRef<DrillSocket | null>(null);
  const micRef = useRef<Mic | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const drill = useDrill((s) => s.drill);
  const callState = useDrill((s) => s.callState);
  const ended = useDrill((s) => s.ended);
  const connected = useDrill((s) => s.connected);
  const transcript = useDrill((s) => s.transcript);
  const partial = useDrill((s) => s.partial);
  const tripped = useDrill((s) => s.tripped);
  const [speaking, setSpeaking] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micMode, setMicMode] = useState<"transcribe" | "browser" | "typed">("typed");
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [devScale, setDevScale] = useState(1);
  useEffect(() => { const f = () => setDevScale(Math.min(1, (window.innerHeight - 70) / (useDrill.getState().drill?.device === "laptop" ? 600 : 770))); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [drill?.device]);
  const autoIdx = useRef(0);

  useEffect(() => {
    useDrill.getState().reset();
    const r = useRoom.getState(); r.reset(); r.setMode("dimmed");
    const sock = new DrillSocket(drillId); sockRef.current = sock; sock.connect();
    const off = sock.on((e: ServerEvent) => {
      if (e.type === "drill.state") { useRoom.getState().setMode(e.drill.hardMode ? "hidden" : "dimmed"); useRoom.getState().setDevice(e.drill.device); }
      if (e.type === "call.incoming") { useRoom.getState().setPhone(true, false); }
      if (e.type === "scammer.say") {
        setSpeaking(true);
        const done = () => setSpeaking(false);
        if (e.audio) void playBase64(e.audio, e.mime ?? "audio/mpeg", done).catch(() => speakFallback(e.text, "en-IN", false, done));
        else speakFallback(e.text, "en-IN", /female/.test(useDrill.getState().drill?.caller.voice ?? ""), done);
        if (auto) { const n = autoIdx.current++; setTimeout(() => sock.send({ type: "text.reply", text: AUTO_LINES[n % AUTO_LINES.length], source: "typed" }), 3500 + Math.min(5000, e.text.length * 35)); }
      }
      if (e.type === "breaker.trip") { duck(true); stopPlayback(); setSpeaking(false); }
      if (e.type === "family.called") { setTimeout(() => { if (e.audio) void playBase64(e.audio, e.mime ?? "audio/mpeg"); else speakFallback(e.line.en, "en-IN", true); }, 700); }
      if (e.type === "drill.ended") { setTimeout(() => nav({ to: "/drill/$drillId/debrief", params: { drillId }, search: {} }), 1800); }
    });
    return () => { off(); sock.close(); micRef.current?.stop(); recRef.current?.stop(); stopPlayback(); duck(false); };
  }, [drillId, nav, auto]);

  // Lift the device when the call arrives; switch room to live.
  useEffect(() => {
    if (callState === "ringing" && !lifted) {
      const t = setTimeout(() => { setLifted(true); useRoom.getState().setPhone(false, true); if (!useDrill.getState().drill?.hardMode) useRoom.getState().setMode("live"); }, 1400);
      return () => clearTimeout(t);
    }
  }, [callState, lifted]);
  useEffect(() => { if (callState !== "active") return; const t = setInterval(() => setElapsed((s) => s + 1), 1000); return () => clearInterval(t); }, [callState]);
  // Start audio on answer (user gesture already happened).
  useEffect(() => { if (callState === "active") { ensureAudio(); if (!auto) void startMic(); } }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startMic() {
    const sock = sockRef.current!; const d = useDrill.getState().drill;
    if (!d || micOn) return;
    const lang = d.world.language === "hi" ? "hi-IN" : "en-IN";
    if (d.features.transcribe) {
      try {
        const mic = new Mic((buf) => sock.sendAudio(buf), (hot) => { if (hot) sock.send({ type: "audio.start", sampleRate: 16000, lang }); });
        await mic.start(); micRef.current = mic; sock.send({ type: "audio.start", sampleRate: 16000, lang }); setMicMode("transcribe"); setMicOn(true); return;
      } catch { /* fall through */ }
    }
    const rec = browserRecognizer(lang, (t) => sock.send({ type: "text.reply", text: t, source: "speech" }), (t) => useDrill.getState().set({ partial: t }));
    if (rec) { recRef.current = rec; setMicMode("browser"); setMicOn(true); return; }
    setMicMode("typed");
  }
  function stopMic() { micRef.current?.stop(); micRef.current = null; recRef.current?.stop(); recRef.current = null; sockRef.current?.send({ type: "audio.stop" }); setMicOn(false); }
  const sendText = (t: string) => { if (!t.trim()) return; sockRef.current?.send({ type: "text.reply", text: t.trim(), source: "typed" }); setText(""); };

  const hard = drill?.hardMode;
  const isLaptop = drill?.device === "laptop";
  const mm = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const lines = useMemo(() => transcript.slice(-5), [transcript]);

  return (
    <div className="drill">
      <div className="bar">
        <div className="l"><span className="live">● {ended ? "DRILL OVER" : tripped ? "BREAKER TRIPPED" : "LIVE DRILL"}{hard ? " · HARD" : ""}</span>{drill && <><span>{drill.familyLabel}</span><span>{drill.personaName}, {drill.world.personaAge}</span><span>{isLaptop ? "Laptop" : "Phone"}</span><span>{mm}</span></>}</div>
        <div className="r"><span style={{ color: connected ? "#1db954" : "#e4572e", fontSize: 11 }}>{connected ? "● connected" : "○ reconnecting"}</span><span style={{ fontSize: 11, color: "#bdb5a6" }}>{drill?.awsMode ? "AWS mode" : "local mode"}</span><button className="link" onClick={() => sockRef.current?.send({ type: "drill.end" })}>End drill</button><Link to="/">✕</Link></div>
      </div>
      <div className={`stage ${lifted ? "split" : ""} ${isLaptop ? "laptop" : ""} ${hard ? "hard" : ""}`}>
        {lifted && (
          <div className="devcol">
            <div className={`device ${isLaptop ? "laptop-lift" : "lift"}`} style={{ zoom: devScale }}>
              {isLaptop ? <WindowsShell sock={sockRef.current!} speaking={speaking} onJudgeText={sendText} /> : <AndroidShell sock={sockRef.current!} speaking={speaking} onJudgeText={sendText} />}
            </div>
            {hard && <div className="watch-dot"><i />the room is watching</div>}
          </div>
        )}
        {!hard && (
          <div className="roomcol">
            <Room camera={lifted ? "push" : "none"} showHud={lifted}>
              {!lifted && callState === "ringing" && <div className="ringing"><div className="px-panel">📳 The {isLaptop ? "laptop" : "phone"} on the desk is ringing…</div></div>}
              {!lifted && callState === "idle" && <div className="ringing"><div className="px-panel">{drill ? `Building ${drill.personaName}'s ${isLaptop ? "laptop" : "phone"}…` : "Opening the case file…"}</div></div>}
              {lifted && (
                <div className="transcript">
                  {lines.map((l, i) => <div key={i} className={l.speaker === "judge" ? "j" : "s"}><b>{l.speaker === "judge" ? "You" : l.speaker === "member" ? l.name : drill?.caller.name}:</b> {l.text}</div>)}
                  {partial && <div className="p">You: {partial}…</div>}
                </div>
              )}
            </Room>
            {lifted && <Console micOn={micOn} micMode={micMode} onMic={() => (micOn ? stopMic() : void startMic())} text={text} setText={setText} onSend={sendText} onHangup={() => sockRef.current?.send({ type: "device.event", kind: "call_ended" })} guardian={drill?.world.guardian.name ?? "family"} onCallGuardian={() => sockRef.current?.send({ type: "drill.end" })} disabled={callState !== "active"} />}
          </div>
        )}
        {hard && lifted && (
          <div style={{ position: "absolute", left: 0, bottom: 0, right: 0 }}>
            <Console micOn={micOn} micMode={micMode} onMic={() => (micOn ? stopMic() : void startMic())} text={text} setText={setText} onSend={sendText} onHangup={() => sockRef.current?.send({ type: "device.event", kind: "call_ended" })} guardian={drill?.world.guardian.name ?? "family"} onCallGuardian={() => sockRef.current?.send({ type: "drill.end" })} disabled={callState !== "active"} />
          </div>
        )}
        {ended && <div className="ended">Drill over · opening the Reporter's file…</div>}
      </div>
    </div>
  );
}

function Console({ micOn, micMode, onMic, text, setText, onSend, onHangup, guardian, onCallGuardian, disabled }: { micOn: boolean; micMode: string; onMic: () => void; text: string; setText: (t: string) => void; onSend: (t: string) => void; onHangup: () => void; guardian: string; onCallGuardian: () => void; disabled: boolean }) {
  return (
    <div className="console">
      <div className="lab">YOU<br />ON THE LINE</div>
      <button className={`mic ${micOn ? "on" : ""}`} onClick={onMic} disabled={disabled} title={micMode}>{micOn ? `🎙 ${micMode === "transcribe" ? "Transcribe" : "browser"} on` : "🎙 Mic"}</button>
      <form onSubmit={(e) => { e.preventDefault(); onSend(text); }}>
        <input placeholder={disabled ? "Answer the call first…" : "…or type what you'd say and press Enter"} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
        <button type="submit" disabled={disabled}>Say it</button>
      </form>
      <div className="lab" style={{ width: 52 }}>FAMILY<br />CONSOLE</div>
      <button className="warn" onClick={onHangup} disabled={disabled}>Hang up</button>
      <button onClick={onCallGuardian} disabled={disabled}>Call {guardian}</button>
    </div>
  );
}
