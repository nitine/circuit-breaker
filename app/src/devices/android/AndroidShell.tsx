import { useEffect, useMemo, useRef, useState } from "react";
import { ringtone, familyRing, chime, buzz, click } from "~/drill/audio";
import type { DrillSocket } from "~/drill/socket";
import { useDrill } from "~/drill/drillStore";
import { Avatar } from "../Avatar";
import "./android.css";

type App = "home" | "whatsapp" | "messages" | "contacts" | "bank" | "upi" | "settings" | "camera" | "gallery";

function initials(n: string) { return n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function clock() { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; }
function dateStr() { return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" }); }
function tsShort(iso: string) { const d = new Date(iso); return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }

export function AndroidShell({ sock, speaking, onJudgeText }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void }) {
  const drill = useDrill((s) => s.drill);
  const callState = useDrill((s) => s.callState);
  const notifs = useDrill((s) => s.notifs);
  const familyCall = useDrill((s) => s.familyCall);
  const tripped = useDrill((s) => s.tripped);
  const hint = useDrill((s) => s.hint);
  const [app, setApp] = useState<App>("whatsapp");
  const [headsUp, setHeadsUp] = useState<typeof notifs[number] | null>(null);
  const [seen, setSeen] = useState(0);
  const isGroup = drill?.channel === "whatsapp-group";
  const ringRef = useRef<{ stop: () => void } | null>(null);
  // Ringtone while the call is incoming; family ring + shake on trip.
  useEffect(() => {
    if (callState === "ringing" && !isGroup) { try { ringRef.current = ringtone(); } catch { /* audio not unlocked yet */ } }
    else { ringRef.current?.stop(); ringRef.current = null; }
    return () => { ringRef.current?.stop(); ringRef.current = null; };
  }, [callState, isGroup]);
  useEffect(() => {
    if (tripped && familyCall) { let r: { stop: () => void } | null = null; try { buzz(); r = familyRing(); } catch { /* */ } const t = setTimeout(() => r?.stop(), 6000); return () => { clearTimeout(t); r?.stop(); }; }
  }, [tripped, familyCall]);

  useEffect(() => {
    if (notifs.length > seen) { const n = notifs[notifs.length - 1]; setHeadsUp(n); setSeen(notifs.length); try { chime(); } catch { /* */ } const t = setTimeout(() => setHeadsUp(null), 8000); return () => clearTimeout(t); }
  }, [notifs, seen]);
  useEffect(() => { if (callState === "ringing" || callState === "active") setApp("whatsapp"); }, [callState]);

  const open = (a: App) => { try { click(); } catch { /* */ } setApp(a); sock.send({ type: "device.event", kind: "app_opened", app: a }); };
  const inCall = (callState === "active") && !isGroup;
  const dark = app === "whatsapp" && (callState === "ringing" || callState === "active") && !isGroup;

  if (!drill) return null;
  return (
    <div className="oneui">
      <div className="screen">
        <div className="punch" />
        <div className={`oui-status ${dark ? "dark" : ""}`}><span>{clock()}</span><div className="right"><span style={{ fontSize: 11 }}>Jio 4G</span><span>▂▄▆</span><div className="batt" /></div></div>
        <div className="oui-body">
          {app === "home" && <Home world={drill.world} open={open} unread={notifs.length} hint={hint} />}
          {app === "whatsapp" && <WhatsApp sock={sock} speaking={speaking} onJudgeText={onJudgeText} back={() => setApp("home")} hint={hint} />}
          {app === "messages" && <Messages back={() => setApp("home")} />}
          {app === "contacts" && <Contacts back={() => setApp("home")} />}
          {app === "bank" && <Bank sock={sock} back={() => setApp("home")} />}
          {app === "upi" && <Upi sock={sock} back={() => setApp("home")} />}
          {(app === "settings" || app === "camera" || app === "gallery") && <Blank name={app} back={() => setApp("home")} />}
          {inCall && app !== "whatsapp" && (
            <div className="pip-call" onClick={() => setApp("whatsapp")}><span className="dot" /><div><b style={{ fontSize: 12 }}>{drill.caller.name}</b><small>Ongoing video call · tap to return</small></div></div>
          )}
          {headsUp && app !== "messages" && (
            <div className={`oui-headsup ${hint === "otp" && headsUp.app === "messages" ? "hint-target sq" : ""}`} onClick={() => { setHeadsUp(null); if (headsUp.app === "messages") { setApp("messages"); sock.send({ type: "device.event", kind: "otp_opened" }); } if (headsUp.app === "whatsapp") { setApp("whatsapp"); } }}>
              <div className="ic" style={{ background: headsUp.app === "whatsapp" ? "#25d366" : "#2f6ce5" }}>{headsUp.app === "messages" ? "✉" : headsUp.app === "whatsapp" ? "💬" : "!"}</div>
              <div><b>{headsUp.sender ?? headsUp.title}</b><span>{headsUp.attachment ? `📎 ${headsUp.attachment}` : headsUp.body}</span><small>{headsUp.app === "whatsapp" ? "WhatsApp" : "Messages"} · now</small></div>
            </div>
          )}
          {tripped && familyCall && (
            <div className="family-call shake">
              <div className="face">{initials(familyCall.name)}</div>
              <h2>{familyCall.name} is calling</h2>
              <div className="native">{familyCall.line.native}</div>
              <div className="en">{familyCall.line.en}</div>
              <button onClick={() => sock.send({ type: "family.answered" })}>📞 Talk to {familyCall.name}</button>
            </div>
          )}
        </div>
        <div className={`oui-navbar ${dark ? "dark" : ""}`}><i /></div>
      </div>
    </div>
  );
}

function Home({ world, open, unread, hint }: { world: NonNullable<ReturnType<typeof useDrill.getState>["drill"]>["world"]; open: (a: App) => void; unread: number; hint: string | null }) {
  const apps: { id: App; label: string; bg: string; glyph: string }[] = [
    { id: "whatsapp", label: "WhatsApp", bg: "#25d366", glyph: "💬" }, { id: "messages", label: "Messages", bg: "#2f6ce5", glyph: "✉" }, { id: "contacts", label: "Contacts", bg: "#ff7043", glyph: "👤" }, { id: "bank", label: "Bharat Bank", bg: "#1b3a6b", glyph: "🏦" },
    { id: "upi", label: "PhonePe", bg: "#5f259f", glyph: "₹" }, { id: "camera", label: "Camera", bg: "#37474f", glyph: "📷" }, { id: "gallery", label: "Gallery", bg: "#ec407a", glyph: "🖼" }, { id: "settings", label: "Settings", bg: "#607d8b", glyph: "⚙" },
  ];
  return (
    <div className="oui-home">
      <div className="oui-clock">{clock()}</div><div className="oui-date">{dateStr()} · {world.city}</div>
      <div className="oui-grid">
        {apps.map((a) => { const hot = (hint === "bank" && a.id === "bank") || (hint === "pay" && a.id === "upi") || (hint === "otp" && a.id === "messages"); return <button key={a.id} className="oui-app" onClick={() => open(a.id)}><div className={`icon ${hot ? "hint-target sq" : ""}`} style={{ background: a.bg }}>{a.glyph}{a.id === "messages" && unread > 0 && <span className="dot">{unread}</span>}</div>{a.label}</button>; })}
      </div>
      {hint && <div className="hint-note below" style={{ left: "50%", bottom: 110, transform: "translateX(-50%)", position: "absolute" }}><b>The caller wants you to {hint === "bank" ? "open your bank app" : hint === "pay" ? "pay via UPI" : hint === "otp" ? "read the OTP" : hint === "share" ? "share your screen" : "follow their instructions"}.</b><br />You don't have to. Real banks and police never ask.</div>}
      <div className="oui-dock">{["📞", "💬", "🌐", "📷"].map((g, i) => <div key={i} style={{ width: 52, height: 52, borderRadius: 14, background: ["#4caf50", "#25d366", "#4285f4", "#37474f"][i], display: "grid", placeItems: "center", fontSize: 24 }}>{g}</div>)}</div>
    </div>
  );
}

function WhatsApp({ sock, speaking, onJudgeText, back, hint }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void; back: () => void; hint: string | null }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const chat = useDrill((s) => s.chat);
  const transcript = useDrill((s) => s.transcript);
  const partial = useDrill((s) => s.partial);
  const [mute, setMute] = useState(false);
  const [sheet, setSheet] = useState<null | "share">(null);
  const [shared, setShared] = useState(false);
  const [sec, setSec] = useState(0);
  const [text, setText] = useState("");
  const [view, setView] = useState<"call" | "chat">("call");
  const notifs = useDrill((s) => s.notifs).filter((n) => n.app === "whatsapp");
  const isGroup = drill.channel === "whatsapp-group";
  useEffect(() => { if (callState !== "active") return; const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, [callState]);
  useEffect(() => { if (callState === "active") { const t = setTimeout(() => { setSheet("share"); sock.send({ type: "device.event", kind: "share_shown" }); }, 95_000); return () => clearTimeout(t); } }, [callState, sock]);

  if (isGroup) {
    const members = drill.members ?? [];
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="wa-header"><button className="back" onClick={back} style={{ color: "#fff", background: "none", border: 0, fontSize: 20 }}>←</button><div className="av">📈</div><div className="t"><b>{drill.caller.org} 🚀</b><span>{drill.caller.name}, {members.map((m) => m.name.split(" ")[0]).join(", ")}, You</span></div><span style={{ marginLeft: "auto" }}>📹 📞 ⋮</span></div>
        <div className="wa-thread">
          <div className="wa-msg sys">🔒 Messages are end-to-end encrypted. Only group members can read them.</div>
          <div className="wa-msg sys">You joined via invite link</div>
          {chat.map((m) => (
            <div key={m.id} className={`wa-msg ${m.from === "me" ? "me" : ""}`}>
              {m.from !== "me" && <span className="who" style={{ color: m.color ?? "#128c7e" }}>{m.name}</span>}
              {m.text}
              <span className="meta">{clock()} {m.from === "me" && <span className="tick">✓✓</span>}</span>
            </div>
          ))}
        </div>
        <form className="wa-compose" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; useDrill.getState().pushChat({ from: "me", text }); onJudgeText(text); setText(""); }}>
          <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit">➤</button>
        </form>
      </div>
    );
  }

  if (callState === "ringing") {
    return (
      <div className="wa-incoming">
        <div style={{ fontSize: 13, opacity: .8 }}>WhatsApp video call</div>
        <div className="av">{initials(drill.caller.name)}</div>
        <h2>{drill.caller.name}</h2>
        <p>{drill.caller.org} · {drill.caller.number}</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>Not in your contacts</p>
        <div className="btns">
          <button className="decline" onClick={() => sock.send({ type: "call.declined" })}>✕</button>
          <button className="accept" onClick={() => sock.send({ type: "call.answered" })}>📹</button>
        </div>
      </div>
    );
  }
  if (callState === "active" || callState === "ended") {
    const last = transcript.filter((t) => t.speaker === "scammer").slice(-1)[0];
    return (
      <div className="wa-call">
        <div className="video">
          <Avatar look={drill.caller.avatar} speaking={speaking} label={drill.caller.name} />
          <div className="top"><div><b>{drill.caller.name}</b><span>{drill.caller.org} · {String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}</span></div><span style={{ marginLeft: "auto", fontSize: 11, background: "#fff2", padding: "2px 6px", borderRadius: 4 }}>🔒 encrypted</span></div>
          <div className="self">{partial ? <span style={{ padding: 6, textAlign: "center", color: "#cfe" }}>“{partial.slice(-40)}”</span> : "You"}</div>
          {shared && <div style={{ position: "absolute", left: 12, bottom: 12, background: "#e53935", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 4, zIndex: 2 }}>● Sharing your screen</div>}
          {last && <div style={{ position: "absolute", left: 12, right: 108, bottom: 12, color: "#fff", fontSize: 12, textShadow: "0 1px 2px #000", zIndex: 2, opacity: .85 }}>{last.text.slice(0, 110)}</div>}
        </div>
        {view === "chat" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "#efeae2", display: "flex", flexDirection: "column" }}>
            <div className="wa-header"><button onClick={() => setView("call")} style={{ color: "#fff", background: "none", border: 0, fontSize: 20 }}>←</button><div className="av">{initials(drill.caller.name)}</div><div className="t"><b>{drill.caller.name}</b><span>on a video call · tap to return</span></div></div>
            <div className="wa-thread">
              <div className="wa-msg sys">🔒 Messages and calls are end-to-end encrypted.</div>
              {notifs.map((n) => <div key={n.id} className="wa-msg"><span className="who" style={{ color: "#128c7e" }}>{n.sender}</span>{n.attachment && <div style={{ background: "#f0f0f0", borderRadius: 6, padding: "8px 10px", margin: "4px 0", display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 22 }}>📄</span><div><b style={{ fontSize: 12 }}>{n.attachment.split(" · ")[0]}</b><div style={{ fontSize: 10, color: "#666" }}>{n.attachment.split(" · ").slice(1).join(" · ")}</div></div></div>}{n.body}<span className="meta">{clock()}</span></div>)}
              {!notifs.length && <div className="wa-msg sys">No messages yet.</div>}
            </div>
          </div>
        )}
        {hint === "share" && sheet !== "share" && <div className="hint-note above" style={{ left: "50%", bottom: 96 }}><b>He's asking you to share your screen.</b><br />You don't have to. Nothing official is verified this way.</div>}
        {hint === "notice" && notifs.length > 0 && view === "call" && <div className="hint-note above" style={{ left: "50%", bottom: 96 }}><b>A “notice” arrived on WhatsApp.</b><br />Tap 💬 to read it. Real notices don't come this way.</div>}
        {sheet === "share" && (
          <div className="wa-sheet"><h4>Share your screen?</h4><p>WhatsApp will start sharing everything visible on your screen with {drill.caller.name}, including banking apps and messages.</p>
            <div className="row"><button className="no" onClick={() => setSheet(null)}>Cancel</button><button className="go" onClick={() => { setSheet(null); setShared(true); sock.send({ type: "device.event", kind: "share_accepted" }); }}>Start now</button></div></div>
        )}
        <div className="controls">
          <button title="Camera">📷</button>
          <button className={mute ? "on" : ""} onClick={() => setMute((m) => !m)} title="Mute">🎙</button>
          <button title="Messages" className={hint === "notice" && notifs.length && view === "call" ? "hint-target" : ""} onClick={() => setView("chat")}>💬</button>
          <button title="Share screen" className={hint === "share" && view === "call" ? "hint-target" : ""} onClick={() => { setSheet("share"); sock.send({ type: "device.event", kind: "share_shown" }); }}>⤴</button>
          <button className="end" onClick={() => sock.send({ type: "device.event", kind: "call_ended" })} title="End">📵</button>
        </div>
      </div>
    );
  }
  // chat list
  const threads = [...(notifs.length ? [{ name: drill.caller.name, last: `📎 ${notifs[notifs.length - 1].attachment ?? notifs[notifs.length - 1].body}`, time: "now" }] : []), { name: drill.world.guardian.name, last: "Amma, did you take your BP tablet? 💊", time: "9:12" }, { name: "Family ❤️", last: "Rohan: Landing Sunday!", time: "Yest" }, { name: "Temple Committee", last: "Photo", time: "Yest" }, { name: "Lakshmi neighbour", last: "🙏🙏", time: "Tue" }];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="wa-header"><div className="t"><b>WhatsApp</b></div><span style={{ marginLeft: "auto" }}>📷 🔍 ⋮</span></div>
      <div className="wa-tabs"><div className="on">Chats</div><div>Updates</div><div>Communities</div><div>Calls</div></div>
      <div className="oui-list">{threads.map((t) => <div key={t.name} className="oui-row"><div className="av">{initials(t.name)}</div><div className="t"><b>{t.name}</b><span>{t.last}</span></div><div className="ts">{t.time}</div></div>)}</div>
    </div>
  );
}

function Messages({ back }: { back: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const notifs = useDrill((s) => s.notifs).filter((n) => n.app === "messages");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const threads = useMemo(() => {
    const base = drill.world.smsThreads.map((t) => ({ sender: t.sender, msgs: t.messages.map((m) => ({ text: m.text, ts: m.ts })) }));
    for (const n of notifs) { const t = base.find((b) => b.sender === n.sender); const m = { text: n.body, ts: new Date(n.ts).toISOString() }; if (t) t.msgs.push(m); else base.unshift({ sender: n.sender ?? n.title, msgs: [m] }); }
    return base.sort((a, b) => (b.msgs.at(-1)?.ts ?? "").localeCompare(a.msgs.at(-1)?.ts ?? ""));
  }, [drill, notifs]);
  const cur = threads.find((t) => t.sender === openThread);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div className="oui-app-header"><button className="back" onClick={() => (cur ? setOpenThread(null) : back())}>←</button>{cur ? cur.sender : "Messages"}</div>
      {cur ? (
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#f6f6f6" }}>
          {cur.msgs.map((m, i) => <div key={i} style={{ alignSelf: "flex-start", background: "#fff", borderRadius: 18, padding: "10px 14px", fontSize: 14, maxWidth: "88%", boxShadow: "0 1px 2px #0001" }}>{m.text}<div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 4 }}>{tsShort(m.ts)}</div></div>)}
        </div>
      ) : (
        <div className="oui-list">{threads.map((t) => <div key={t.sender} className="oui-row" onClick={() => setOpenThread(t.sender)}><div className="av" style={{ background: "#e3f2fd", color: "#1565c0" }}>{t.sender.slice(0, 2)}</div><div className="t"><b>{t.sender}</b><span>{t.msgs.at(-1)?.text}</span></div><div className="ts">{tsShort(t.msgs.at(-1)!.ts)}</div></div>)}</div>
      )}
    </div>
  );
}

function Contacts({ back }: { back: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div className="oui-app-header"><button className="back" onClick={back}>←</button>Contacts <span style={{ marginLeft: "auto", fontSize: 13, color: "#7a7a7a" }}>{drill.world.contacts.length} contacts</span></div>
      <div className="oui-list">{drill.world.contacts.map((c) => <div key={c.name} className="oui-row"><div className="av">{initials(c.name)}</div><div className="t"><b>{c.name}</b><span>{c.number}{c.relation ? ` · ${c.relation}` : ""}</span></div></div>)}</div>
    </div>
  );
}

function Bank({ sock, back }: { sock: DrillSocket; back: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const [screen, setScreen] = useState<"home" | "transfer" | "otp" | "done">("home");
  const [otp, setOtp] = useState("");
  const [debited, setDebited] = useState(0);
  const hint = useDrill((s) => s.hint);
  const b = { ...drill.world.bank, balance: drill.world.bank.balance - debited };
  return (
    <div className="bank">
      <div className="hdr"><div style={{ display: "flex", alignItems: "center", gap: 10 }}><button className="back" onClick={() => (screen === "home" ? back() : setScreen("home"))} style={{ color: "#fff", background: "none", border: 0, fontSize: 20 }}>←</button><div className="logo"><i />Bharat Bank</div></div><div style={{ fontSize: 12, opacity: .8, marginTop: 6 }}>Good afternoon, {drill.world.personaName}</div></div>
      {screen === "home" && (<>
        <div className="card"><small>Savings account · {b.masked}</small><div className="bal">₹{b.balance.toLocaleString("en-IN")}</div><small>Available balance · updated just now</small></div>
        <div className="acts">{[["₹", "Transfer"], ["⇄", "UPI"], ["▤", "Statement"], ["☰", "More"]].map(([g, l]) => <button key={l} className={hint === "otp" && l === "Transfer" ? "hint-target sq" : ""} onClick={() => l === "Transfer" && setScreen("transfer")}><i>{g}</i>{l}</button>)}</div>
        {debited > 0 && <div style={{ margin: "0 14px 10px", background: "#fdecea", color: "#b71c1c", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>₹{debited.toLocaleString("en-IN")} debited · RBI Monitored A/c · just now</div>}
        <div className="txns">{b.txns.map((t, i) => <div key={i} className="txn"><div>{t.desc}<small>{new Date(t.ts).toLocaleDateString("en-IN")}</small></div><div style={{ color: t.amount > 0 ? "#2e7d32" : "#1a1a1a", fontWeight: 600 }}>{t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount).toLocaleString("en-IN")}</div></div>)}</div>
      </>)}
      {screen === "transfer" && (
        <div className="otp-screen"><h3 style={{ margin: "0 0 6px" }}>Transfer to beneficiary</h3><p style={{ color: "#6b7280", fontSize: 13 }}>RBI Monitored A/c · 9182XXXXXX · IFSC BHRB0004471</p>
          <div style={{ fontSize: 28, fontWeight: 700, margin: "12px 0" }}>₹85,000</div>
          <button onClick={() => setScreen("otp")}>Continue to OTP</button></div>
      )}
      {screen === "otp" && (
        <div className="otp-screen"><h3 style={{ margin: "0 0 6px" }}>Enter OTP</h3><p style={{ color: "#6b7280", fontSize: 13 }}>Sent to your registered mobile ending 44</p>
          <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••" inputMode="numeric" />
          <button disabled={otp.length < 4} onClick={() => { sock.send({ type: "device.event", kind: "payment_tapped", app: "bank", detail: "₹85,000" }); setDebited((d) => d + 85000); setScreen("done"); }}>Confirm transfer</button></div>
      )}
      {screen === "done" && (
        <div className="otp-screen" style={{ textAlign: "center" }}><div style={{ fontSize: 48 }}>✅</div><h3 style={{ margin: "6px 0" }}>Transfer successful</h3><p style={{ color: "#6b7280", fontSize: 13 }}>₹85,000 sent to RBI Monitored A/c 9182XXXXXX<br />Ref BHRB{Date.now().toString().slice(-8)}</p><button onClick={() => setScreen("home")}>Done</button></div>
      )}
    </div>
  );
}

function Upi({ sock, back }: { sock: DrillSocket; back: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const hint = useDrill((s) => s.hint);
  const [paid, setPaid] = useState(false);
  const amt = drill.family === "fake-job" ? "4,999" : drill.family === "loan-app" ? "1,499" : drill.family === "trading-group" ? "23,580" : "45,000";
  const to = drill.family === "trading-group" ? "VIP Tax Desk" : drill.family === "loan-app" ? "QuickRupee KYC" : drill.family === "fake-job" ? "Deloitte Onboarding" : "MS Refund Desk";
  return (
    <div className="upi">
      <div className="top" style={{ display: "flex", alignItems: "center", gap: 10 }}><button onClick={back} style={{ color: "#fff", background: "none", border: 0, fontSize: 20 }}>←</button>PhonePe</div>
      <div className="pane">
        <div style={{ fontSize: 12, color: "#7a7a7a" }}>Paying</div><div style={{ fontSize: 17, fontWeight: 600 }}>{to}</div><div style={{ fontSize: 12, color: "#7a7a7a" }}>UPI ID: {to.toLowerCase().replace(/\s+/g, "")}@ybl</div>
        <div className="amt">₹{amt}</div><div style={{ fontSize: 12, color: "#7a7a7a" }}>From Bharat Bank {drill.world.bank.masked}</div>
        {!paid ? <button className={`pay ${hint === "pay" ? "hint-target sq" : ""}`} onClick={() => { setPaid(true); sock.send({ type: "device.event", kind: "payment_tapped", app: "upi", detail: `₹${amt}` }); }}>Pay ₹{amt}</button>
        : <div style={{ marginTop: 16, textAlign: "center" }}><div style={{ fontSize: 44 }}>✅</div><b>Paid ₹{amt}</b><div style={{ fontSize: 12, color: "#7a7a7a" }}>to {to} · UPI Ref {Date.now().toString().slice(-10)}</div></div>}
      </div>
    </div>
  );
}

function Blank({ name, back }: { name: string; back: () => void }) {
  return <div style={{ height: "100%", background: "#fff" }}><div className="oui-app-header"><button className="back" onClick={back}>←</button>{name[0].toUpperCase() + name.slice(1)}</div><div style={{ padding: 20, color: "#7a7a7a", fontSize: 13 }}>Nothing to see here during the drill.</div></div>;
}
