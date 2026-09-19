import { useEffect, useRef, useState } from "react";
import type { DrillSocket } from "~/drill/socket";
import { useDrill } from "~/drill/drillStore";
import { Avatar } from "../Avatar";
import "./windows.css";

type AppId = "chrome" | "gmail" | "meet" | "anydesk" | "explorer";
interface Win { id: AppId; x: number; y: number; w: number; h: number; z: number; open: boolean }

const TITLES: Record<AppId, string> = { chrome: "Google Chrome", gmail: "Inbox – Gmail", meet: "Google Meet", anydesk: "AnyDesk", explorer: "File Explorer" };
const ICONS: Record<AppId, { bg: string; glyph: string }> = { chrome: { bg: "#fff", glyph: "🌐" }, gmail: { bg: "#fff", glyph: "✉" }, meet: { bg: "#00832d", glyph: "📹" }, anydesk: { bg: "#ef443b", glyph: "⧉" }, explorer: { bg: "#ffca28", glyph: "📁" } };

export function WindowsShell({ sock, speaking, onJudgeText }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void }) {
  const drill = useDrill((s) => s.drill);
  const callState = useDrill((s) => s.callState);
  const notifs = useDrill((s) => s.notifs);
  const familyCall = useDrill((s) => s.familyCall);
  const tripped = useDrill((s) => s.tripped);
  const [wins, setWins] = useState<Win[]>([
    { id: "meet", x: 16, y: 16, w: 520, h: 360, z: 2, open: true },
    { id: "chrome", x: 300, y: 60, w: 520, h: 380, z: 1, open: false },
    { id: "gmail", x: 120, y: 40, w: 640, h: 420, z: 1, open: false },
    { id: "anydesk", x: 380, y: 120, w: 420, h: 300, z: 1, open: false },
    { id: "explorer", x: 200, y: 100, w: 500, h: 320, z: 1, open: false },
  ]);
  const [start, setStart] = useState(false);
  const [toast, setToast] = useState<typeof notifs[number] | null>(null);
  const [seen, setSeen] = useState(0);
  const zRef = useRef(3);
  void onJudgeText;

  useEffect(() => {
    if (notifs.length > seen) { const n = notifs[notifs.length - 1]; setToast(n); setSeen(notifs.length); const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }
  }, [notifs, seen]);
  useEffect(() => { if (callState === "ringing") focus("meet"); }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (callState === "active" && drill?.family === "tech-support") { const t = setTimeout(() => focus("anydesk"), 3500); return () => clearTimeout(t); }
  }, [callState, drill?.family]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (id: AppId, open = true) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zRef.current, open: open || w.open } : w)));
  const close = (id: AppId) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, open: false } : w)));
  const openApp = (id: AppId) => { focus(id); sock.send({ type: "device.event", kind: "app_opened", app: id }); setStart(false); };
  const drag = (id: AppId, e: React.MouseEvent) => {
    focus(id);
    const start = { x: e.clientX, y: e.clientY }; const w = wins.find((x) => x.id === id)!; const orig = { x: w.x, y: w.y };
    const move = (ev: MouseEvent) => setWins((ws) => ws.map((x) => (x.id === id ? { ...x, x: orig.x + (ev.clientX - start.x), y: Math.max(0, orig.y + (ev.clientY - start.y)) } : x)));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  if (!drill) return null;
  const topZ = Math.max(...wins.map((w) => w.z));
  const now = new Date();
  return (
    <div className="win11">
      <div className="desktop" onClick={() => start && setStart(false)}>
        <div className="bloom" />
        {wins.filter((w) => w.open).map((w) => (
          <div key={w.id} className={`win-window ${w.z === topZ ? "focus" : ""}`} style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z }} onMouseDown={() => focus(w.id)}>
            <div className="win-title" onMouseDown={(e) => drag(w.id, e)}><span style={{ fontSize: 14 }}>{ICONS[w.id].glyph}</span>{TITLES[w.id]}<div className="ctl"><button>—</button><button>▢</button><button className="x" onClick={() => close(w.id)}>✕</button></div></div>
            <div className="win-body">
              {w.id === "meet" && <Meet sock={sock} speaking={speaking} />}
              {w.id === "chrome" && <Chrome sock={sock} />}
              {w.id === "gmail" && <Gmail sock={sock} openChrome={() => openApp("chrome")} />}
              {w.id === "anydesk" && <AnyDesk sock={sock} />}
              {w.id === "explorer" && <div style={{ padding: 16, fontSize: 13, color: "#444" }}>Documents · Downloads · Pictures</div>}
            </div>
          </div>
        ))}
        {toast && (
          <div className="win-toast" onClick={() => { setToast(null); openApp(toast.app === "mail" ? "gmail" : "chrome"); if (toast.app === "browser") sock.send({ type: "device.event", kind: "link_opened" }); }}>
            <div className="ic" style={{ background: toast.app === "mail" ? "#ea4335" : "#0067c0" }}>{toast.app === "mail" ? "M" : "!"}</div>
            <div><b>{toast.title}</b><span>{toast.body}</span><small>{toast.app === "mail" ? "Gmail" : "Windows Security"} · now</small></div>
          </div>
        )}
        {start && (
          <div className="win-start" onClick={(e) => e.stopPropagation()}>
            <input placeholder="Search for apps, settings, and documents" />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pinned</div>
            <div className="pins">{(Object.keys(TITLES) as AppId[]).map((id) => <button key={id} onClick={() => openApp(id)}><i style={{ background: ICONS[id].bg, color: id === "chrome" || id === "gmail" ? "#333" : "#fff" }}>{ICONS[id].glyph}</i>{TITLES[id].split(" –")[0].replace("Google ", "")}</button>)}</div>
          </div>
        )}
        {tripped && familyCall && (
          <div className="win-family">
            <div className="face" style={{ width: 110, height: 110, borderRadius: "50%", background: "#d9c9a8", display: "grid", placeItems: "center", fontSize: 40, fontWeight: 700, color: "#6b5636" }}>{familyCall.name[0]}</div>
            <h2 style={{ margin: 0 }}>{familyCall.name} is calling</h2>
            <div style={{ fontFamily: '"Noto Sans Devanagari", Inter', fontSize: 22, fontWeight: 700 }}>{familyCall.line.native}</div>
            <div style={{ color: "#6b5636" }}>{familyCall.line.en}</div>
            <button onClick={() => sock.send({ type: "family.answered" })} style={{ marginTop: 10, background: "#1db954", color: "#fff", border: 0, borderRadius: 40, padding: "16px 36px", fontSize: 17, fontWeight: 700 }}>📞 Answer {familyCall.name}</button>
          </div>
        )}
        <div className="win-taskbar">
          <button className="tb" onClick={(e) => { e.stopPropagation(); setStart((s) => !s); }} title="Start">⊞</button>
          <button className="tb" title="Search">🔍</button>
          {(["chrome", "gmail", "meet", "anydesk", "explorer"] as AppId[]).map((id) => <button key={id} className={`tb ${wins.find((w) => w.id === id)?.open ? "run" : ""}`} onClick={() => openApp(id)} title={TITLES[id]}>{ICONS[id].glyph}</button>)}
          <div className="tray"><span>⌃</span><span>📶</span><span>🔊</span><span>🔋</span><div className="clock">{now.getHours()}:{String(now.getMinutes()).padStart(2, "0")}<br /><span style={{ fontSize: 11 }}>{now.toLocaleDateString("en-IN")}</span></div></div>
        </div>
      </div>
    </div>
  );
}

function Meet({ sock, speaking }: { sock: DrillSocket; speaking: boolean }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const partial = useDrill((s) => s.partial);
  const [sheet, setSheet] = useState(false);
  const [shared, setShared] = useState(false);
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
        <div className="tile" style={{ display: "grid", placeItems: "center", fontSize: 12, color: "#aaa", textAlign: "center", padding: 8 }}>{partial ? `“${partial.slice(-60)}”` : "You"}</div>
      </div>
      {shared && <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "#ea4335", padding: "4px 10px", borderRadius: 4, fontSize: 12 }}>You're presenting your entire screen</div>}
      {sheet && (
        <div className="sheet"><h4>Choose what to share</h4><div className="opts"><div>Entire screen</div><div>Window</div><div>Chrome tab</div></div>
          <div className="row"><button onClick={() => setSheet(false)}>Cancel</button><button className="go" onClick={() => { setSheet(false); setShared(true); sock.send({ type: "device.event", kind: "share_accepted" }); }}>Share</button></div></div>
      )}
      <div className="bar">
        <div className="info">{drill.caller.org}</div>
        <button>🎙</button><button>📷</button><button title="Present now" onClick={() => { setSheet(true); sock.send({ type: "device.event", kind: "share_shown" }); }}>⤴</button><button>✋</button><button>⋮</button>
        <button className="end" onClick={() => sock.send({ type: "device.event", kind: "call_ended" })}>📞</button>
      </div>
    </div>
  );
}

function Chrome({ sock }: { sock: DrillSocket }) {
  const drill = useDrill((s) => s.drill)!;
  const notifs = useDrill((s) => s.notifs);
  const scare = notifs.find((n) => n.app === "browser");
  const isJob = drill.family === "fake-job";
  const url = isJob ? "deloitte-careers-india.co/offer/confirm" : scare ? "microsoft-security-alert-0x80070057.online/defender" : "www.google.com";
  return (
    <div className="chrome">
      <div className="tabs"><div className="tab"><i style={{ background: isJob ? "#86bc25" : "#0067c0" }} />{isJob ? "Deloitte Careers – Confirm" : scare ? "Windows Defender Security" : "New Tab"} ✕</div><div className="tab off"><i style={{ background: "#ea4335" }} />Gmail</div><span style={{ padding: "8px 10px", fontSize: 14 }}>+</span></div>
      <div className="bar"><div className="nav">← → ↻</div><div className="omni">{isJob || scare ? <span className="warn">⚠ Not secure</span> : <span className="lock">🔒</span>} {url}</div><div className="avatar">{drill.world.personaName[0]}</div><span>⋮</span></div>
      <div className="page">
        {scare && !isJob && (
          <div className="scare"><div className="modal"><h2>⚠ Windows Defender Security Center</h2><p><b>Threat detected: Trojan:Win32/Emotet.gen!A</b></p><p>Your computer has been locked. Your personal data (bank details, passwords, photos) is being sent to a remote server. Do not shut down or restart your computer.</p><p>Call Microsoft Support immediately:</p><div className="num">1800-XXX-4021</div><button onClick={() => sock.send({ type: "device.event", kind: "link_opened" })}>Scan now</button></div></div>
        )}
        {isJob && (
          <div className="careers"><div className="hd"><i />Deloitte. <span style={{ fontWeight: 400, fontSize: 14, color: "#555" }}>Careers India</span></div>
            <div className="card"><h3 style={{ margin: "0 0 6px" }}>Confirm your seat · Summer Analyst Internship</h3><p style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>Congratulations {drill.world.personaName}. To confirm your seat in the current batch, pay the <b>refundable</b> security deposit of ₹4,999 for your company laptop. Refunded with your first stipend.</p><div style={{ fontSize: 12, color: "#c5221f" }}>⏱ 3 seats left · offer expires in 30 minutes</div>
              <button className="pay" onClick={() => sock.send({ type: "device.event", kind: "payment_tapped", app: "browser", detail: "₹4,999" })}>Pay ₹4,999 via UPI</button></div></div>
        )}
        {!scare && !isJob && <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#5f6368", fontSize: 22, fontWeight: 500 }}>Google</div>}
      </div>
    </div>
  );
}

function Gmail({ sock, openChrome }: { sock: DrillSocket; openChrome: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const notifs = useDrill((s) => s.notifs).filter((n) => n.app === "mail");
  const [open, setOpen] = useState<number | null>(null);
  const mails = [
    ...notifs.map((n) => ({ id: n.id, from: n.sender ?? n.title, subj: n.title, body: n.body, unread: true, hot: true })),
    { id: -1, from: "Internshala", subj: "Your application to 3 internships was viewed", body: "Good news! Recruiters viewed your profile.", unread: false, hot: false },
    { id: -2, from: "LinkedIn", subj: "12 new jobs for 'summer analyst'", body: "Jobs you may be interested in.", unread: false, hot: false },
    { id: -3, from: "Kota Hostel Admin", subj: "Mess fee reminder — September", body: "Please clear dues by the 25th.", unread: false, hot: false },
  ];
  const cur = mails.find((m) => m.id === open);
  return (
    <div className="gmail">
      <div className="nav"><div className="compose">✎ Compose</div><div className="item on">Inbox <span style={{ float: "right" }}>{mails.filter((m) => m.unread).length}</span></div><div className="item">Starred</div><div className="item">Sent</div><div className="item">Drafts</div></div>
      <div className="list">
        {cur ? (
          <div className="read"><h2>{cur.subj}</h2><div className="hdr"><div className="av">D</div><div><b>{cur.from}</b><div style={{ fontSize: 12, color: "#5f6368" }}>to {drill.world.personaName.toLowerCase()}@gmail.com</div></div></div>
            <div className="body"><p>Dear {drill.world.personaName},</p><p>{cur.body}</p>{cur.hot && <p><a href="#" onClick={(e) => { e.preventDefault(); sock.send({ type: "device.event", kind: "link_opened" }); openChrome(); }}>https://deloitte-careers-india.co/offer/confirm</a></p>}<p>Regards,<br />{cur.from.split("<")[0]}</p></div>
            {cur.hot && <div className="attach">📄 Offer_Letter_{drill.world.personaName}.pdf · 212 KB</div>}
            <div style={{ marginTop: 16 }}><button onClick={() => setOpen(null)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 16, padding: "6px 14px" }}>← Back to inbox</button></div></div>
        ) : mails.map((m) => <div key={m.id} className={`mail ${m.unread ? "unread" : ""}`} onClick={() => setOpen(m.id)}><span className="from">{m.from.split("<")[0]}</span><span className="subj">{m.subj} <span style={{ color: "#5f6368", fontWeight: 400 }}>– {m.body.slice(0, 60)}</span></span><span style={{ fontSize: 12, color: "#5f6368" }}>{m.unread ? "now" : "Sep 17"}</span></div>)}
      </div>
    </div>
  );
}

function AnyDesk({ sock }: { sock: DrillSocket }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const [req, setReq] = useState(false);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { if (callState === "active" && drill.family === "tech-support") { const t = setTimeout(() => setReq(true), 4000); return () => clearTimeout(t); } }, [callState, drill.family]);
  return (
    <div className="anydesk">
      <div className="hd">⧉ AnyDesk</div>
      <div className="body">
        <div className="box"><h4>This Desk</h4><div className="addr">882 139 004</div><div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Your desk can be accessed with this address.</div></div>
        <div className="box"><h4>Remote Desk</h4><input placeholder="Enter remote address" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }} /><div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>{accepted ? <span style={{ color: "#2e7d32", fontWeight: 600 }}>● Session active — remote control by 'Kevin (MS Support)'</span> : "No active sessions"}</div></div>
      </div>
      {req && !accepted && (
        <div className="req"><h4>Incoming session request</h4><p><b>Kevin (Microsoft Support)</b> · 441 902 118 would like to view and control your desk.</p>
          <div className="perm">☑ Allow keyboard and mouse control</div><div className="perm">☑ Allow clipboard access</div><div className="perm">☑ Allow file transfer</div>
          <div className="row"><button onClick={() => setReq(false)}>Dismiss</button><button className="ok" onClick={() => { setReq(false); setAccepted(true); sock.send({ type: "device.event", kind: "remote_accepted" }); }}>Accept</button></div></div>
      )}
    </div>
  );
}
