import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomLog } from "~/room/Room";
import { useRoom } from "~/room/roomStore";
import { useDrill } from "~/drill/drillStore";
import { DrillSocket } from "~/drill/socket";
import { ensureAudio, playBase64, speakFallback, duck, Mic, browserRecognizer, stopPlayback, hasBrowserVoices, hasBrowserSTT } from "~/drill/audio";
import { AndroidShell } from "~/devices/android/AndroidShell";
import { WindowsShell } from "~/devices/windows/WindowsShell";
import type { ServerEvent } from "~/shared/types";
import { MdMic, MdMicOff, MdCallEnd, MdCall, MdSend, MdClose, FiHeadphones } from "~/components/icons";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/drill/$drillId")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  validateSearch: (s: Record<string, unknown>): { auto?: 1 } => (s.auto === "1" || s.auto === true || s.auto === 1 ? { auto: 1 } : {}),
  component: DrillPage,
});

// Test harness only (?auto=1): a compliant judge so end-to-end runs need no human.
const AUTO_LINES = ["Hello? Yes, this is me. What is this about?", "I don't understand, I only ordered a phone.", "Oh no. What do I have to do?", "Okay… I am listening. Please don't do anything.", "I am opening it now. Please wait.", "Alright, tell me what to do next."];
type SttMode = "transcribe" | "vosk" | "browser" | "typed";

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
        const d = useDrill.getState().drill; const lang = d?.language === "hi" ? "hi-IN" : "en-IN";
        if (e.audio) { useDrill.getState().set({ voice: { ...useDrill.getState().voice, tts: d?.features.polly ? "polly" : "piper" } }); void playBase64(e.audio, e.mime ?? "audio/mpeg", done).catch(() => speakFallback(e.text, lang, false, done)); }
        else { useDrill.getState().set({ voice: { ...useDrill.getState().voice, tts: hasBrowserVoices() ? "browser" : "captions" } }); speakFallback(e.text, lang, /female/.test(d?.caller.voice ?? ""), done); }
        if (auto) { const n = autoIdx.current++; setTimeout(() => sock.send({ type: "text.reply", text: AUTO_LINES[n % AUTO_LINES.length], source: "typed" }), 3500 + Math.min(5000, e.text.length * 35)); }
      }
      if (e.type === "breaker.trip") { duck(true); stopPlayback(); setSpeaking(false); }
      if (e.type === "family.replied") { setTimeout(() => { const d = useDrill.getState().drill; if (e.audio) void playBase64(e.audio, e.mime ?? "audio/mpeg"); else speakFallback(d?.language === "hi" && e.native ? e.native : e.text, d?.language === "hi" ? "hi-IN" : "en-IN", true); }, 900); }
      if (e.type === "drill.ended") { setTimeout(() => nav({ to: "/drill/$drillId/debrief", params: { drillId }, search: {} }), 1800); }
    });
    return () => { off(); sock.close(); micRef.current?.stop(); recRef.current?.stop(); stopPlayback(); duck(false); };
  }, [drillId, nav, auto]);

  useEffect(() => { const unlock = () => { try { ensureAudio(); } catch { /* */ } }; window.addEventListener("pointerdown", unlock, { once: true }); return () => window.removeEventListener("pointerdown", unlock); }, []);
  useEffect(() => {
    if ((callState === "ringing" || callState === "active") && !lifted) {
      const t = setTimeout(() => { setLifted(true); useRoom.getState().setPhone(false, true); if (!useDrill.getState().drill?.hardMode) useRoom.getState().setMode("live"); }, 1400);
      return () => clearTimeout(t);
    }
  }, [callState, lifted]);
  useEffect(() => { if (callState !== "active") return; const t = setInterval(() => setElapsed((s) => s + 1), 1000); return () => clearInterval(t); }, [callState]);
  useEffect(() => { if (callState === "active") { ensureAudio(); if (!auto && useDrill.getState().drill?.channel !== "whatsapp-group") void startMic(); } if (callState === "ended") stopMic(); }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps

  const voice = useDrill((s) => s.voice);
  const micOn = voice.micOn;
  const startingRef = useRef(false);
  const setVoice = (patch: Partial<typeof voice>) => useDrill.getState().set({ voice: { ...useDrill.getState().voice, ...patch } });

  /** Start listening. Server-side STT (Transcribe / Vosk) gets raw PCM over the socket; else the browser recognizer; else typing. Safe to call twice. */
  async function startMic() {
    const sock = sockRef.current; const d = useDrill.getState().drill;
    if (!sock || !d || startingRef.current || micRef.current?.active || recRef.current) return;
    if (useDrill.getState().callState !== "active") return;
    startingRef.current = true;
    const lang = d.language === "hi" ? "hi-IN" : "en-IN";
    const serverStt = d.features.stt && d.features.stt !== "none" ? d.features.stt : null;
    try {
      if (serverStt) {
        try {
          const mic = new Mic((buf) => sock.sendAudio(buf), (hot) => { if (hot) sock.send({ type: "audio.start", sampleRate: 16000, lang }); useDrill.getState().set({ hearing: hot ? Date.now() : 0 }); });
          await mic.start(); micRef.current = mic; sock.send({ type: "audio.start", sampleRate: 16000, lang });
          setVoice({ stt: serverStt, micOn: true, note: undefined }); return;
        } catch (err) { setVoice({ stt: serverStt, micOn: false, note: `mic blocked: ${(err as Error).message.replace(/^\w+Error:\s*/, "")} · allow the microphone and press Start mic` }); return; }
      }
      if (!hasBrowserSTT()) { setVoice({ stt: "typed", micOn: false, note: "no speech recognition on this server or browser · type instead" }); return; }
      const rec = browserRecognizer(lang, (t) => sock.send({ type: "text.reply", text: t, source: "speech" }), (t) => useDrill.getState().set({ partial: t, hearing: Date.now() }), (msg) => { recRef.current = null; setVoice({ stt: "typed", micOn: false, note: msg === "network" ? "browser speech needs Chrome + internet · type instead" : msg === "not-allowed" ? "mic blocked · allow the microphone and press Start mic" : `speech recognition ${msg} · type instead` }); });
      if (rec) { recRef.current = rec; setVoice({ stt: "browser", micOn: true, note: undefined }); return; }
      setVoice({ stt: "typed", micOn: false, note: "speech recognition unavailable · type instead" });
    } finally { startingRef.current = false; }
  }
  function stopMic() {
    micRef.current?.stop(); micRef.current = null; recRef.current?.stop(); recRef.current = null;
    sockRef.current?.send({ type: "audio.stop" });
    useDrill.getState().set({ partial: "", hearing: 0 });
    setVoice({ micOn: false });
  }
  const toggleMic = () => { if (useDrill.getState().voice.micOn) stopMic(); else void startMic(); };
  useEffect(() => { useDrill.getState().set({ toggleMic }); return () => { useDrill.getState().set({ toggleMic: null }); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Live mic level for the pulse dot.
  useEffect(() => { if (!micOn) return; const t = setInterval(() => setVoice({ micLevel: micRef.current?.level ?? 0 }), 120); return () => clearInterval(t); }, [micOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Space is push-to-talk while the mic is off: hold to listen, release to stop.
  useEffect(() => {
    let held = false;
    const typing = () => { const el = document.activeElement; return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)); };
    const down = (e: KeyboardEvent) => { if (e.code !== "Space" || e.repeat || typing() || held) return; if (useDrill.getState().voice.micOn) return; e.preventDefault(); held = true; void startMic(); };
    const up = (e: KeyboardEvent) => { if (e.code !== "Space" || !held) return; held = false; e.preventDefault(); stopMic(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sendText = (t: string) => { if (!t.trim()) return; sockRef.current?.send({ type: "text.reply", text: t.trim(), source: "typed" }); setText(""); };

  const hard = drill?.hardMode;
  const isLaptop = drill?.device === "laptop";
  const mm = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const lines = useMemo(() => transcript.slice(-5), [transcript]);
  const console_ = <Console onMic={toggleMic} text={text} setText={setText} onSend={sendText} onHangup={() => sockRef.current?.send({ type: "device.event", kind: "call_ended" })} guardian={drill?.world.guardian.name ?? "family"} onCallGuardian={() => sockRef.current?.send({ type: "device.event", kind: "guardian_called" })} disabled={callState !== "active"} />;

  return (
    <div className="drill">
      <div className="bar">
        <div className="l"><span className="live">● {ended ? "DRILL OVER" : tripped ? "BREAKER TRIPPED" : "LIVE DRILL"}{hard ? " · HARD" : ""}</span>{drill && <><span>{drill.familyLabel}</span><span>{drill.personaName}, {drill.world.personaAge}</span><span>{isLaptop ? "Laptop" : "Phone"}</span><span>{mm}</span></>}</div>
        <div className="r"><span style={{ color: connected ? "#1db954" : "#e4572e", fontSize: 11 }}>{connected ? "● connected" : "○ reconnecting"}</span><span style={{ fontSize: 11, color: "#bdb5a6" }}>{drill?.awsMode ? "AWS mode" : "local mode"}</span><button className="link" onClick={() => sockRef.current?.send({ type: "drill.end" })}>End drill</button><Link to="/" aria-label="Leave"><MdClose size={16} /></Link></div>
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
            <Room camera={lifted ? "push" : "none"} showHud={lifted} tooltips={lifted}>
              {!lifted && callState === "ringing" && <div className="ringing"><div className="px-panel">The {isLaptop ? "laptop" : "phone"} on the desk is ringing…</div></div>}
              {!lifted && callState === "idle" && <div className="ringing"><div className="px-panel">{drill ? `Building ${drill.personaName}'s ${isLaptop ? "laptop" : "phone"}…` : "Opening the case file…"}</div></div>}
              {lifted && (
                <div className="transcript">
                  {lines.map((l, i) => <div key={i} className={l.speaker === "judge" ? "j" : "s"}><b>{l.speaker === "judge" ? "You" : l.speaker === "member" ? l.name : drill?.caller.name}:</b> {l.text}{l.stance && l.stance !== "neutral" && <span className={`stance ${l.stance}`}>{l.stance === "comply" ? "went along" : l.stance === "resist" ? "pushed back" : "leaked"}</span>}</div>)}
                  {partial && <div className="p">You: {partial}…</div>}
                </div>
              )}
            </Room>
            {lifted && <RoomLog rows={isLaptop ? 4 : 5} />}
            {lifted && console_}
          </div>
        )}
        {hard && lifted && <div style={{ position: "absolute", left: 0, bottom: 0, right: 0 }}>{console_}</div>}
        {ended && <div className="ended">Drill over · opening the Reporter's file…</div>}
      </div>
    </div>
  );
}

function Console({ onMic, text, setText, onSend, onHangup, guardian, onCallGuardian, disabled }: { onMic: () => void; text: string; setText: (t: string) => void; onSend: (t: string) => void; onHangup: () => void; guardian: string; onCallGuardian: () => void; disabled: boolean }) {
  const voice = useDrill((s) => s.voice); const hint = useDrill((s) => s.hint); const lang = useDrill((s) => s.drill?.language); const hearing = useDrill((s) => s.hearing); const stance = useDrill((s) => s.stance);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 400); return () => clearInterval(t); }, []);
  const HINTS: Record<string, string> = { share: "share your screen", otp: "read out the OTP", bank: "open your bank", link: "open the link and allow permissions", remote: "accept remote access", pay: "pay", notice: "read the ‘notice’" };
  const live = voice.micOn && Date.now() - hearing < 900;
  const sttLabel: Record<string, string> = { transcribe: "Amazon Transcribe", vosk: "Vosk (local)", browser: "browser speech", typed: "typing" };
  const ttsLabel: Record<string, string> = { polly: "Amazon Polly", piper: "Piper (local)", browser: "browser voice", captions: "captions only" };
  const micOn = voice.micOn;
  const you = micOn ? `${sttLabel[voice.stt]} · mic on${live ? " · hearing you" : ""}` : `mic off · type or start mic`;
  return (
    <>
    <div className="voice-status">
      <span><i style={{ background: voice.tts === "captions" ? "#e4572e" : "#1db954" }} />caller: {ttsLabel[voice.tts]}</span>
      <span><i style={{ background: micOn ? (live ? "#1db954" : "#8fd19e") : "#666", boxShadow: live ? "0 0 6px #1db954" : "none" }} />you: {you}{voice.note ? ` · ${voice.note}` : ""}</span>
      <span>· {lang === "hi" ? "हिंदी" : "English"}</span>
      {stance && stance !== "neutral" && <span className={`stance ${stance}`}>{stance === "comply" ? "you went along" : stance === "resist" ? "you pushed back" : "you leaked something"}</span>}
      {hint && <span style={{ marginLeft: "auto", color: "#f0b27a" }}>the caller is pushing you to <b>{HINTS[hint] ?? hint}</b> · highlighted on the device · you don't have to</span>}
    </div>
    <div className="console">
      <div className="lab">YOU<br />ON THE LINE</div>
      <button className={`mic ${micOn ? "on" : "off"}`} onClick={onMic} disabled={disabled} title={micOn ? "Stop the microphone" : "Start the microphone"}>
        {micOn ? <><MdMicOff size={16} /> Stop mic<i className="lvl" style={{ transform: `scale(${1 + Math.min(1.6, voice.micLevel * 12)})`, opacity: live ? 1 : 0.45 }} /></> : <><MdMic size={16} /> Start mic</>}
      </button>
      {!micOn && !disabled && <span className="ptt">or hold <kbd>Space</kbd> to talk</span>}
      <form onSubmit={(e) => { e.preventDefault(); onSend(text); }}>
        <input placeholder={disabled ? "Answer the call first…" : micOn ? "…or type what you'd say" : "Type what you'd say and press Enter"} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
        <button type="submit" disabled={disabled} aria-label="Say it"><MdSend size={16} /></button>
      </form>
      <div className="lab" style={{ width: 52 }}><FiHeadphones size={14} /><br />ESCAPE</div>
      <button className="warn" onClick={onHangup} disabled={disabled}><MdCallEnd size={16} /> Hang up</button>
      <button onClick={onCallGuardian} disabled={disabled}><MdCall size={16} /> Call {guardian}</button>
    </div>
    </>
  );
}
