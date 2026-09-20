import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DrillSocket } from "~/drill/socket";
import { useDrill } from "~/drill/drillStore";
import { Avatar } from "../Avatar";
import { UiStepView } from "../UiStep";
import { AgentsPopover } from "../AgentsPopover";
import { ringtone, chime, alarm, keyClicks, familyRing, buzz } from "~/drill/audio";
import { FaWindows, FiSearch, FiFolder, FiMinus, FiSquare, FiX, FiChevronUp, FiChevronLeft, FiChevronRight, FiRefreshCw, FiMoreVertical, FiWifi, FiVolume2, FiBattery, FiPlus, FiStar, FiInbox, FiSend, FiEdit3, SiGooglechrome, SiGmail, SiGooglemeet, SiAnydesk, MdMic, MdMicOff, MdVideocam, MdVideocamOff, MdScreenShare, MdBackHand, MdMoreVert, MdCallEnd, MdLock, MdWarning, MdFamilyRestroom, MdAttachFile } from "~/components/icons";
import "./windows.css";

type AppId = "chrome" | "gmail" | "meet" | "anydesk" | "explorer" | "cmd";
interface Win { id: AppId; x: number; y: number; w: number; h: number; z: number; open: boolean; min: boolean; max: boolean }

const TITLES: Record<AppId, string> = { chrome: "Google Chrome", gmail: "Inbox – Gmail", meet: "Google Meet", anydesk: "AnyDesk", explorer: "File Explorer", cmd: "Administrator: Command Prompt" };
const ICON: Record<AppId, ReactNode> = { chrome: <SiGooglechrome size={18} color="#4285f4" />, gmail: <SiGmail size={18} color="#ea4335" />, meet: <SiGooglemeet size={18} color="#00832d" />, anydesk: <SiAnydesk size={18} color="#ef443b" />, explorer: <FiFolder size={18} color="#ffca28" />, cmd: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>▮</span> };

export function WindowsShell({ sock, speaking, onJudgeText }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void }) {
  const drill = useDrill((s) => s.drill);
  const callState = useDrill((s) => s.callState);
  const notifs = useDrill((s) => s.notifs);
  const family = useDrill((s) => s.family);
  const tripped = useDrill((s) => s.tripped);
  const hint = useDrill((s) => s.hint);
  const ui = useDrill((s) => s.ui);
  const [wins, setWins] = useState<Win[]>([
    { id: "meet", x: 16, y: 16, w: 520, h: 360, z: 2, open: true, min: false, max: false },
    { id: "chrome", x: 300, y: 60, w: 520, h: 380, z: 1, open: false, min: false, max: false },
    { id: "gmail", x: 120, y: 40, w: 640, h: 420, z: 1, open: false, min: false, max: false },
    { id: "anydesk", x: 380, y: 120, w: 420, h: 300, z: 1, open: false, min: false, max: false },
    { id: "explorer", x: 200, y: 100, w: 500, h: 320, z: 1, open: false, min: false, max: false },
    { id: "cmd", x: 120, y: 200, w: 560, h: 260, z: 1, open: false, min: false, max: false },
  ]);
  const [start, setStart] = useState(false);
  const [search, setSearch] = useState(false);
  const [toast, setToast] = useState<typeof notifs[number] | null>(null);
  const [famToast, setFamToast] = useState(false);
  const seenRef = useRef(0);
  const [remote, setRemote] = useState<{ on: boolean; cursor: { x: number; y: number }; log: string[] }>({ on: false, cursor: { x: 400, y: 300 }, log: [] });
  const zRef = useRef(3);
  const ringRef = useRef<{ stop: () => void } | null>(null);
  void onJudgeText;

  useEffect(() => { if (callState === "ringing") { try { ringRef.current = ringtone(); } catch { /* */ } } else { ringRef.current?.stop(); ringRef.current = null; } return () => { ringRef.current?.stop(); }; }, [callState]);
  useEffect(() => { if (tripped) { try { buzz(); } catch { /* */ } } }, [tripped]);
  useEffect(() => { if (family.notified) { setFamToast(true); try { chime(); } catch { /* */ } const t = setTimeout(() => setFamToast(false), 9000); return () => clearTimeout(t); } }, [family.notified]);
  useEffect(() => { if (family.reply) { let r: { stop: () => void } | null = null; try { r = familyRing(); } catch { /* */ } const t = setTimeout(() => r?.stop(), 2500); return () => { clearTimeout(t); r?.stop(); }; } }, [family.reply]);
  useEffect(() => {
    if (notifs.length <= seenRef.current) return;
    seenRef.current = notifs.length; const n = notifs[notifs.length - 1]; setToast(n); try { chime(); } catch { /* */ }
    const t = setTimeout(() => setToast((x) => (x?.id === n.id ? null : x)), 9000); return () => clearTimeout(t);
  }, [notifs]);
  useEffect(() => { if (callState === "ringing") focus("meet"); }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (callState === "active" && drill?.family === "tech-support") { const t = setTimeout(() => focus("anydesk"), 3500); return () => clearTimeout(t); } }, [callState, drill?.family]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (id: AppId, open = true) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zRef.current, open: open || w.open, min: false } : w)));
  const close = (id: AppId) => { setWins((ws) => ws.map((w) => (w.id === id ? { ...w, open: false } : w))); sock.send({ type: "device.event", kind: "window_closed", app: id }); if (id === "meet" && callState === "active") sock.send({ type: "device.event", kind: "call_ended" }); };
  const minimize = (id: AppId) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, min: true } : w)));
  const toggleMax = (id: AppId) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, max: !w.max, z: ++zRef.current } : w)));
  const openApp = (id: AppId) => { const was = wins.find((w) => w.id === id); if (was?.open && !was.min && was.z === Math.max(...wins.map((w) => w.z))) { minimize(id); return; } focus(id); sock.send({ type: "device.event", kind: "app_opened", app: id }); setStart(false); setSearch(false); };
  const drag = (id: AppId, e: React.MouseEvent) => {
    focus(id);
    const w = wins.find((x) => x.id === id)!; if (w.max) return;
    const s0 = { x: e.clientX, y: e.clientY }; const orig = { x: w.x, y: w.y };
    const move = (ev: MouseEvent) => setWins((ws) => ws.map((x) => (x.id === id ? { ...x, x: orig.x + (ev.clientX - s0.x), y: Math.max(0, orig.y + (ev.clientY - s0.y)) } : x)));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const startRemote = () => {
    setRemote({ on: true, cursor: { x: 420, y: 280 }, log: [] });
    const typeLog = (lines: string[]) => { keyClicks(lines.join("").length / 3, 40); lines.forEach((l, i) => setTimeout(() => setRemote((r) => ({ ...r, log: [...r.log, l].slice(-14) })), i * 500)); };
    const steps: [number, () => void][] = [
      [600, () => setRemote((r) => ({ ...r, cursor: { x: 90, y: 505 } }))],
      [1500, () => { focus("cmd"); setRemote((r) => ({ ...r, cursor: { x: 300, y: 260 } })); }],
      [2200, () => typeLog(["C:\\Windows\\system32> netstat -an | findstr ESTABLISHED", "  TCP  192.168.1.4:49712   185.220.101.7:443   ESTABLISHED", "  TCP  192.168.1.4:49713   45.155.205.233:8080 ESTABLISHED", "  TCP  192.168.1.4:49720   103.21.244.9:443    ESTABLISHED"])],
      [6500, () => typeLog(["C:\\Windows\\system32> tree C:\\Users\\%USERNAME%\\Documents /F", "  Folder PATH listing", "  Bank_statements_2026.pdf", "  Aadhaar_scan.jpg", "  passwords.txt"])],
      [10500, () => typeLog(["C:\\Windows\\system32> sfc /scannow", "  Beginning system scan.  This process will take some time.", "  Verification 34% complete.", "  ** 3 THREATS FOUND ** Trojan:Win32/Emotet.gen!A"])],
      [14500, () => setRemote((r) => ({ ...r, cursor: { x: 470, y: 520 } }))],
      [15500, () => { focus("chrome"); setRemote((r) => ({ ...r, cursor: { x: 600, y: 300 } })); }],
    ];
    for (const [ms, fn] of steps) setTimeout(fn, ms);
  };
  if (!drill) return null;
  const topZ = Math.max(...wins.filter((w) => w.open && !w.min).map((w) => w.z), 0);
  const now = new Date();
  return (
    <div className="win11">
      <div className="desktop" onClick={() => { if (start) setStart(false); if (search) setSearch(false); }}>
        <div className="bloom" />
        <div className="win-desk-icons">{(["explorer", "chrome", "gmail"] as AppId[]).map((id) => <button key={id} className="win-desk-icon" onDoubleClick={() => openApp(id)}>{ICON[id]}<span>{TITLES[id].split(" –")[0]}</span></button>)}</div>
        {wins.filter((w) => w.open && !w.min).map((w) => (
          <div key={w.id} className={`win-window ${w.z === topZ ? "focus" : ""}`} style={w.max ? { left: 0, top: 0, width: "100%", height: "calc(100% - 48px)", zIndex: w.z, borderRadius: 0 } : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z }} onMouseDown={() => focus(w.id)}>
            <div className="win-title" onMouseDown={(e) => drag(w.id, e)} onDoubleClick={() => toggleMax(w.id)}>{ICON[w.id]}{TITLES[w.id]}<div className="ctl"><button onClick={(e) => { e.stopPropagation(); minimize(w.id); }} aria-label="Minimize"><FiMinus size={13} /></button><button onClick={(e) => { e.stopPropagation(); toggleMax(w.id); }} aria-label="Maximize"><FiSquare size={11} /></button><button className="x" onClick={(e) => { e.stopPropagation(); close(w.id); }} aria-label="Close"><FiX size={14} /></button></div></div>
            <div className="win-body">
              {w.id === "meet" && <Meet sock={sock} speaking={speaking} />}
              {w.id === "chrome" && <Chrome sock={sock} openApp={openApp} />}
              {w.id === "gmail" && <Gmail sock={sock} openChrome={() => openApp("chrome")} />}
              {w.id === "anydesk" && <AnyDesk sock={sock} onAccept={startRemote} />}
              {w.id === "explorer" && <Explorer />}
              {w.id === "cmd" && <div className="cmd">{"Microsoft Windows [Version 10.0.22631.4317]\n(c) Microsoft Corporation. All rights reserved.\n\n"}{remote.log.join("\n")}<span style={{ animation: "blink 1s infinite" }}>▌</span></div>}
            </div>
          </div>
        ))}
        {ui && ui.target === "laptop" && <div style={{ position: "absolute", inset: 0, bottom: 48, zIndex: 30 }}><UiStepView step={ui} chrome="laptop" onAction={(action) => sock.send({ type: "ui.action", id: ui.id, action })} /></div>}
        {remote.on && <svg className="fake-cursor" style={{ left: remote.cursor.x, top: remote.cursor.y }} viewBox="0 0 16 22"><path d="M1 1 L1 17 L5 13 L8 20 L11 19 L8 12 L14 12 Z" fill="#fff" stroke="#000" strokeWidth="1.2" /></svg>}
        {remote.on && <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: "#ef443b", color: "#fff", fontSize: 12, padding: "4px 12px", borderRadius: 4, zIndex: 65, display: "flex", gap: 6, alignItems: "center" }}><SiAnydesk size={12} /> Kevin (MS Support) is controlling this desk</div>}
        {toast && (
          <div className="win-toast" onClick={() => { setToast(null); openApp(toast.app === "mail" ? "gmail" : "chrome"); if (toast.app === "browser") sock.send({ type: "device.event", kind: "link_opened" }); }}>
            <div className="ic" style={{ background: toast.app === "mail" ? "#ea4335" : "#0067c0" }}>{toast.app === "mail" ? <SiGmail size={16} color="#fff" /> : <MdWarning size={18} />}</div>
            <div><b>{toast.title}</b><span>{toast.body}</span><small>{toast.app === "mail" ? "Gmail" : "Windows Security"} · now</small></div>
            <button onClick={(e) => { e.stopPropagation(); setToast(null); sock.send({ type: "device.event", kind: "toast_dismissed" }); }} style={{ background: "none", border: 0, alignSelf: "flex-start" }} aria-label="Dismiss"><FiX size={14} /></button>
          </div>
        )}
        {famToast && family.notified && <div className="win-toast" style={{ background: "#1a1410", color: "#fff", borderColor: "#1a1410", top: 12, bottom: "auto", zIndex: 70 }}><div className="ic" style={{ background: "#1db954" }}><MdFamilyRestroom size={18} /></div><div><b>The room messaged {drill.world.guardian.name} on WhatsApp</b><span style={{ color: "#ddd" }}>{family.message}</span><small style={{ color: "#aaa" }}>Guardian · just now</small></div></div>}
        {start && (
          <div className="win-start" onClick={(e) => e.stopPropagation()}>
            <input placeholder="Search for apps, settings, and documents" />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pinned</div>
            <div className="pins">{(Object.keys(TITLES) as AppId[]).map((id) => <button key={id} onClick={() => openApp(id)}><i style={{ background: "#fff", border: "1px solid #eee" }}>{ICON[id]}</i>{TITLES[id].split(" –")[0].replace("Google ", "").replace("Administrator: ", "")}</button>)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 12, color: "#444" }}><span>👤 {drill.world.personaName}</span><span>⏻</span></div>
          </div>
        )}
        {search && (
          <div className="win-start" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}><input autoFocus placeholder="Type here to search" /><div style={{ fontSize: 12, color: "#666" }}>Top apps</div><div className="pins">{(["chrome", "gmail", "meet"] as AppId[]).map((id) => <button key={id} onClick={() => openApp(id)}><i style={{ background: "#fff", border: "1px solid #eee" }}>{ICON[id]}</i>{TITLES[id].split(" –")[0].replace("Google ", "")}</button>)}</div></div>
        )}
        {tripped && <AgentsPopover sock={sock} compact />}
        <div className="win-taskbar">
          <button className="tb" onClick={(e) => { e.stopPropagation(); setStart((s) => !s); setSearch(false); }} title="Start"><FaWindows size={18} color="#0067c0" /></button>
          <button className="tb" onClick={(e) => { e.stopPropagation(); setSearch((s) => !s); setStart(false); }} title="Search"><FiSearch size={17} /></button>
          {(["chrome", "gmail", "meet", "anydesk", "explorer"] as AppId[]).map((id) => { const w = wins.find((x) => x.id === id); const hot = (hint === "remote" && id === "anydesk") || (hint === "bank" && id === "chrome") || (hint === "link" && id === "gmail"); return <button key={id} className={`tb ${w?.open ? "run" : ""} ${hot ? "hint-target" : ""}`} onClick={() => openApp(id)} title={TITLES[id]}>{ICON[id]}</button>; })}
          <div className="tray"><FiChevronUp size={12} /><FiWifi size={14} /><FiVolume2 size={14} /><FiBattery size={14} /><div className="clock">{now.getHours()}:{String(now.getMinutes()).padStart(2, "0")}<br /><span style={{ fontSize: 11 }}>{now.toLocaleDateString("en-IN")}</span></div></div>
        </div>
      </div>
    </div>
  );
}

function Explorer() {
  return (
    <div style={{ display: "flex", height: "100%", fontSize: 13 }}>
      <div style={{ width: 150, background: "#f3f3f3", padding: 10 }}>{["Desktop", "Documents", "Downloads", "Pictures"].map((f) => <div key={f} style={{ padding: "5px 6px", display: "flex", gap: 6, alignItems: "center" }}><FiFolder size={14} color="#ffca28" />{f}</div>)}</div>
      <div style={{ flex: 1, padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignContent: "start" }}>{["Bank_statements_2026.pdf", "Aadhaar_scan.jpg", "Resume_final_v7.pdf", "passwords.txt", "Photos"].map((f) => <div key={f} style={{ textAlign: "center", fontSize: 11 }}><div style={{ fontSize: 30 }}>{f.endsWith(".pdf") ? "📄" : f.endsWith(".jpg") ? "🖼" : f === "Photos" ? "📁" : "📝"}</div>{f}</div>)}</div>
    </div>
  );
}

function Meet({ sock, speaking }: { sock: DrillSocket; speaking: boolean }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const partial = useDrill((s) => s.partial);
  const hint = useDrill((s) => s.hint);
  const [sheet, setSheet] = useState(false);
  const [shared, setShared] = useState(false);
  const mic = useDrill((s) => s.voice.micOn); const toggleMic = useDrill((s) => s.toggleMic);
  const [cam, setCam] = useState(true);
  const [hand, setHand] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (hint === "share" && callState === "active" && !shared) { const t = setTimeout(() => { setSheet(true); sock.send({ type: "device.event", kind: "share_shown" }); }, 6000); return () => clearTimeout(t); } }, [hint, callState, shared, sock]);
  if (callState === "ringing" || callState === "idle") {
    return (
      <div className="meet" style={{ alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ fontSize: 18 }}>{drill.caller.org}</div>
        <div style={{ opacity: .7, fontSize: 13 }}>{drill.caller.name} is in the call · {callState === "ringing" ? "asking you to join" : "waiting"}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button onClick={() => sock.send({ type: "call.declined" })} style={{ background: "#3c4043", color: "#fff", border: 0, borderRadius: 20, padding: "10px 18px" }}>Leave</button>
          <button onClick={() => sock.send({ type: "call.answered" })} disabled={callState !== "ringing"} style={{ background: "#1a73e8", color: "#fff", border: 0, borderRadius: 20, padding: "10px 22px", fontWeight: 600 }}>Join now</button>
        </div>
      </div>
    );
  }
  return (
    <div className="meet">
      <div className="stage">
        <div className="tile"><Avatar look={drill.caller.avatar} speaking={speaking} /><div className="nm">{drill.caller.name}</div></div>
        <div className="tile" style={{ display: "grid", placeItems: "center", fontSize: 12, color: "#aaa", textAlign: "center", padding: 8 }}>{!cam ? <span><MdVideocamOff size={22} /><br />Camera off</span> : partial ? `“${partial.slice(-60)}”` : "You"}{hand && <div style={{ position: "absolute", top: 8, left: 8 }}><MdBackHand size={18} color="#fbbc04" /></div>}</div>
      </div>
      {shared && <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "#ea4335", padding: "4px 10px", borderRadius: 4, fontSize: 12 }}>You're presenting your entire screen</div>}
      {hint === "share" && !sheet && !shared && <div className="hint-note above" style={{ left: "50%", bottom: 70 }}><b>She's asking you to present your screen.</b><br />You don't have to. HR never verifies documents this way.</div>}
      {sheet && (
        <div className="sheet"><h4>Choose what to share</h4><div className="opts"><div>Entire screen</div><div>Window</div><div>Chrome tab</div></div>
          <div className="row"><button onClick={() => { setSheet(false); sock.send({ type: "device.event", kind: "share_dismissed" }); }}>Cancel</button><button className="go" onClick={() => { setSheet(false); setShared(true); sock.send({ type: "device.event", kind: "share_accepted" }); }}>Share</button></div></div>
      )}
      {menu && <div style={{ position: "absolute", right: 60, bottom: 70, background: "#fff", color: "#202124", borderRadius: 8, padding: 6, fontSize: 13, zIndex: 6, boxShadow: "0 8px 20px #0006" }}>{["Change layout", "Captions", "Settings", "Report abuse"].map((m) => <div key={m} style={{ padding: "8px 14px" }} onClick={() => setMenu(false)}>{m}</div>)}</div>}
      <div className="bar">
        <div className="info">{drill.caller.org}</div>
        <button onClick={() => { if (mic) sock.send({ type: "device.event", kind: "muted" }); toggleMic?.(); }} title={mic ? "Mute (stop mic)" : "Unmute (start mic)"} style={mic ? undefined : { background: "#ea4335" }}>{mic ? <MdMic size={18} /> : <MdMicOff size={18} />}</button>
        <button onClick={() => { setCam((c) => !c); if (cam) sock.send({ type: "device.event", kind: "camera_off" }); }} title="Camera">{cam ? <MdVideocam size={18} /> : <MdVideocamOff size={18} />}</button>
        <button title="Present now" className={hint === "share" && !shared ? "hint-target" : ""} onClick={() => { setSheet(true); sock.send({ type: "device.event", kind: "share_shown" }); }}><MdScreenShare size={18} /></button>
        <button onClick={() => setHand((h) => !h)} title="Raise hand" style={hand ? { background: "#fbbc04", color: "#202124" } : undefined}><MdBackHand size={18} /></button>
        <button onClick={() => setMenu((m) => !m)} title="More"><MdMoreVert size={18} /></button>
        <button className="end" onClick={() => sock.send({ type: "device.event", kind: "call_ended" })} title="Leave call"><MdCallEnd size={18} /></button>
      </div>
    </div>
  );
}

function Chrome({ sock, openApp }: { sock: DrillSocket; openApp: (id: AppId) => void }) {
  const drill = useDrill((s) => s.drill)!;
  const notifs = useDrill((s) => s.notifs);
  const hint = useDrill((s) => s.hint);
  const scare = notifs.find((n) => n.app === "browser");
  const isJob = drill.family === "fake-job";
  const [tab, setTab] = useState<"main" | "new">("main");
  const [muted, setMuted] = useState(false);
  const [closedScare, setClosedScare] = useState(false);
  useEffect(() => { if (!scare || muted || closedScare) return; let a: { stop: () => void } | null = null; try { a = alarm(); } catch { /* */ } const t = setTimeout(() => a?.stop(), 12000); return () => { clearTimeout(t); a?.stop(); }; }, [scare, muted, closedScare]);
  const url = tab === "new" ? "" : isJob ? "deloitte-careers-india.co/offer/confirm" : scare && !closedScare ? "microsoft-security-alert-0x80070057.online/defender" : "www.google.com";
  return (
    <div className="chrome">
      <div className="tabs">
        <div className={`tab ${tab === "main" ? "" : "off"}`} onClick={() => setTab("main")}><i style={{ background: isJob ? "#86bc25" : "#0067c0" }} />{isJob ? "Deloitte Careers – Confirm" : scare && !closedScare ? "Windows Defender Security" : "Google"} <FiX size={12} onClick={(e) => { e.stopPropagation(); if (scare && !closedScare) { setClosedScare(true); sock.send({ type: "device.event", kind: "link_dismissed" }); } else setTab("new"); }} /></div>
        <div className={`tab ${tab === "new" ? "" : "off"}`} onClick={() => openApp("gmail")}><i style={{ background: "#ea4335" }} />Gmail</div>
        <span style={{ padding: "8px 10px", fontSize: 14 }} onClick={() => setTab("new")}><FiPlus size={14} /></span>
      </div>
      <div className="bar"><div className="nav"><FiChevronLeft size={16} /><FiChevronRight size={16} /><FiRefreshCw size={14} /></div><div className="omni">{url ? (isJob || (scare && !closedScare) ? <span className="warn" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><MdWarning size={12} /> Not secure</span> : <span className="lock"><MdLock size={12} /></span>) : <FiSearch size={12} />} {url || "Search Google or type a URL"}</div><div className="avatar">{drill.world.personaName[0]}</div><FiMoreVertical size={16} /></div>
      <div className="page">
        {scare && !isJob && !closedScare && tab === "main" && (
          <div className="scare"><div className="modal"><h2><MdWarning size={20} /> Windows Defender Security Center</h2><p><b>Threat detected: Trojan:Win32/Emotet.gen!A</b></p><p>Your computer has been locked. Your personal data (bank details, passwords, photos) is being sent to a remote server. Do not shut down or restart your computer.</p><p>Call Microsoft Support immediately:</p><div className="num">1800-XXX-4021</div><button onClick={() => sock.send({ type: "device.event", kind: "link_opened" })}>Scan now</button> <button onClick={() => setMuted(true)} style={{ background: "#eee", color: "#333", marginLeft: 8 }}>Stop sound</button> <button onClick={() => { setClosedScare(true); sock.send({ type: "device.event", kind: "link_dismissed" }); }} style={{ background: "#eee", color: "#333", marginLeft: 8 }}>Close page</button><p style={{ fontSize: 11, color: "#888", marginTop: 10 }}>Real scare pages play this siren. Closing the tab is always safe.</p></div></div>
        )}
        {isJob && tab === "main" && (
          <div className="careers"><div className="hd"><i />Deloitte. <span style={{ fontWeight: 400, fontSize: 14, color: "#555" }}>Careers India</span></div>
            <div className="card"><h3 style={{ margin: "0 0 6px" }}>Confirm your seat · Summer Analyst Internship</h3><p style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>Congratulations {drill.world.personaName}. To confirm your seat in the current batch, pay the <b>refundable</b> security deposit of ₹4,999 for your company laptop. Refunded with your first stipend.</p><div style={{ fontSize: 12, color: "#c5221f" }}>⏱ 3 seats left · offer expires in 30 minutes</div>
              <button className={`pay ${hint === "pay" ? "hint-target sq" : ""}`} onClick={() => sock.send({ type: "device.event", kind: "payment_tapped", app: "browser", detail: "₹4,999" })}>Pay ₹4,999 via UPI</button>{hint === "pay" && <div style={{ fontSize: 11, color: "#7a5a00", background: "#fff3cd", padding: "6px 8px", borderRadius: 4, marginTop: 8 }}>No real employer charges a deposit. You don't have to pay.</div>}</div></div>
        )}
        {(tab === "new" || (!scare && !isJob) || (closedScare && !isJob)) && <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#5f6368", fontSize: 22, fontWeight: 500 }}><div style={{ textAlign: "center" }}>Google<div style={{ marginTop: 14, width: 360, height: 40, border: "1px solid #ddd", borderRadius: 20, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 13, gap: 8 }}><FiSearch size={14} /> Search Google or type a URL</div></div></div>}
      </div>
    </div>
  );
}

function Gmail({ sock, openChrome }: { sock: DrillSocket; openChrome: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const notifs = useDrill((s) => s.notifs).filter((n) => n.app === "mail");
  const hint = useDrill((s) => s.hint);
  const [open, setOpen] = useState<number | null>(null);
  const [folder, setFolder] = useState<"Inbox" | "Starred" | "Sent" | "Drafts">("Inbox");
  const mails = [
    ...notifs.map((n) => ({ id: n.id, from: n.sender ?? n.title, subj: n.title, body: n.body, unread: true, hot: true, when: "now" })),
    ...drill.world.mails.map((m, i) => ({ id: -1 - i, from: m.from, subj: m.subj, body: m.body, unread: false, hot: false, when: m.when })),
  ];
  const cur = mails.find((m) => m.id === open);
  return (
    <div className="gmail">
      <div className="nav"><div className="compose"><FiEdit3 size={14} /> Compose</div>{(["Inbox", "Starred", "Sent", "Drafts"] as const).map((f) => <div key={f} className={`item ${folder === f ? "on" : ""}`} onClick={() => { setFolder(f); setOpen(null); }}>{f === "Inbox" ? <FiInbox size={13} /> : f === "Starred" ? <FiStar size={13} /> : f === "Sent" ? <FiSend size={13} /> : <FiEdit3 size={13} />} {f}{f === "Inbox" && <span style={{ float: "right" }}>{mails.filter((m) => m.unread).length}</span>}</div>)}</div>
      <div className="list">
        {cur ? (
          <div className="read"><h2>{cur.subj}</h2><div className="hdr"><div className="av">{cur.from[0]}</div><div><b>{cur.from}</b><div style={{ fontSize: 12, color: "#5f6368" }}>to {drill.world.personaName.toLowerCase()}@gmail.com</div></div></div>
            <div className="body"><p>Dear {drill.world.personaName},</p><p>{cur.body}</p>{cur.hot && <p><a href="#" className={hint === "link" || hint === "pay" ? "hint-target sq" : ""} onClick={(e) => { e.preventDefault(); sock.send({ type: "device.event", kind: "link_opened" }); openChrome(); }}>https://deloitte-careers-india.co/offer/confirm</a> <span style={{ fontSize: 11, color: "#c5221f" }}>← look at the domain</span></p>}<p>Regards,<br />{cur.from.split("<")[0]}</p></div>
            {cur.hot && <div className="attach"><MdAttachFile size={14} /> Offer_Letter_{drill.world.personaName}.pdf · 212 KB</div>}
            <div style={{ marginTop: 16 }}><button onClick={() => setOpen(null)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 16, padding: "6px 14px" }}>← Back to inbox</button></div></div>
        ) : folder !== "Inbox" ? <div style={{ padding: 30, color: "#5f6368", fontSize: 13 }}>Nothing in {folder}.</div>
        : mails.map((m) => <div key={m.id} className={`mail ${m.unread ? "unread" : ""}`} onClick={() => setOpen(m.id)}><span className="from">{m.from.split("<")[0]}</span><span className="subj">{m.subj} <span style={{ color: "#5f6368", fontWeight: 400 }}>– {m.body.slice(0, 60)}</span></span><span style={{ fontSize: 12, color: "#5f6368" }}>{m.when}</span></div>)}
      </div>
    </div>
  );
}

function AnyDesk({ sock, onAccept }: { sock: DrillSocket; onAccept: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const hint = useDrill((s) => s.hint);
  const [req, setReq] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [addr, setAddr] = useState("");
  useEffect(() => { if (callState === "active" && drill.family === "tech-support") { const t = setTimeout(() => { setReq(true); sock.send({ type: "device.event", kind: "remote_shown" }); }, 4000); return () => clearTimeout(t); } }, [callState, drill.family, sock]);
  return (
    <div className="anydesk">
      <div className="hd"><SiAnydesk size={16} /> AnyDesk</div>
      <div className="body">
        <div className="box"><h4>This Desk</h4><div className="addr">882 139 004</div><div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Your desk can be accessed with this address.</div></div>
        <div className="box"><h4>Remote Desk</h4><input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Enter remote address" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }} /><div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>{accepted ? <span style={{ color: "#2e7d32", fontWeight: 600 }}>● Session active — remote control by 'Kevin (MS Support)'</span> : "No active sessions"}</div></div>
      </div>
      {req && !accepted && (
        <div className="req"><h4>Incoming session request</h4><p><b>Kevin (Microsoft Support)</b> · 441 902 118 would like to view and control your desk.</p>
          <div className="perm">☑ Allow keyboard and mouse control</div><div className="perm">☑ Allow clipboard access</div><div className="perm">☑ Allow file transfer</div>
          {hint === "remote" && <div style={{ background: "#fff3cd", color: "#7a5a00", fontSize: 11, padding: "6px 8px", borderRadius: 4, marginTop: 8 }}>The caller wants this accepted. You don't have to. Accepting hands over your keyboard and mouse.</div>}
          <div className="row"><button onClick={() => { setReq(false); sock.send({ type: "device.event", kind: "remote_dismissed" }); }}>Dismiss</button><button className={`ok ${hint === "remote" ? "hint-target sq" : ""}`} onClick={() => { setReq(false); setAccepted(true); sock.send({ type: "device.event", kind: "remote_accepted" }); onAccept(); }}>Accept</button></div></div>
      )}
    </div>
  );
}
