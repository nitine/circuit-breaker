import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DrillSocket } from "~/drill/socket";
import { useDrill } from "~/drill/drillStore";
import { Avatar } from "../Avatar";
import { UiStepView } from "../UiStep";
import { AgentsPopover } from "../AgentsPopover";
import { ringtone, familyRing, chime, buzz, click } from "~/drill/audio";
import { MdCallEnd, MdVideocam, MdVideocamOff, MdMic, MdMicOff, MdScreenShare, MdChat, MdMessage, MdContacts, MdAccountBalance, MdCameraAlt, MdPhotoLibrary, MdSettings, MdArrowBack, MdMoreVert, MdSearch, MdLock, MdPictureAsPdf, MdSend, MdCheckCircle, MdCurrencyRupee, MdSwapHoriz, MdReceiptLong, MdMenu, MdSignalCellularAlt, MdWifi, MdBatteryFull, MdCall, MdPhoneInTalk, MdShield, MdFamilyRestroom, MdVolumeUp, MdOpenInNew, SiWhatsapp, SiPhonepe } from "~/components/icons";
import "./android.css";

type App = "home" | "whatsapp" | "messages" | "contacts" | "bank" | "upi" | "settings" | "camera" | "gallery" | "phone";
const NAMES: Record<App, string> = { home: "Home", whatsapp: "WhatsApp", messages: "Messages", contacts: "Contacts", bank: "Bharat Bank", upi: "PhonePe", settings: "Settings", camera: "Camera", gallery: "Gallery", phone: "Phone" };

function initials(n: string) { return n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function clock() { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; }
function dateStr() { return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" }); }
function tsShort(iso: string) { const d = new Date(iso); return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }

export function AndroidShell({ sock, speaking, onJudgeText }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void }) {
  const drill = useDrill((s) => s.drill);
  const callState = useDrill((s) => s.callState);
  const notifs = useDrill((s) => s.notifs);
  const family = useDrill((s) => s.family);
  const tripped = useDrill((s) => s.tripped);
  const hint = useDrill((s) => s.hint);
  const ui = useDrill((s) => s.ui);
  const [app, setApp] = useState<App>("whatsapp");
  const [headsUp, setHeadsUp] = useState<typeof notifs[number] | null>(null);
  const seenRef = useRef(0);
  const [famToast, setFamToast] = useState(false);
  const isGroup = drill?.channel === "whatsapp-group";
  const ringRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (callState === "ringing" && !isGroup) { try { ringRef.current = ringtone(); } catch { /* not unlocked yet */ } }
    else { ringRef.current?.stop(); ringRef.current = null; }
    return () => { ringRef.current?.stop(); ringRef.current = null; };
  }, [callState, isGroup]);
  useEffect(() => { if (tripped) { try { buzz(); } catch { /* */ } } }, [tripped]);
  useEffect(() => { if (family.notified) { setFamToast(true); try { chime(); } catch { /* */ } const t = setTimeout(() => setFamToast(false), 9000); return () => clearTimeout(t); } }, [family.notified]);
  useEffect(() => { if (family.reply) { let r: { stop: () => void } | null = null; try { r = familyRing(); } catch { /* */ } const t = setTimeout(() => r?.stop(), 2500); return () => { clearTimeout(t); r?.stop(); }; } }, [family.reply]);
  useEffect(() => {
    if (notifs.length <= seenRef.current) return;
    seenRef.current = notifs.length; const n = notifs[notifs.length - 1]; setHeadsUp(n); try { chime(); } catch { /* */ }
    const t = setTimeout(() => setHeadsUp((h) => (h?.id === n.id ? null : h)), 8000); return () => clearTimeout(t);
  }, [notifs]);
  useEffect(() => { if (callState === "ringing") setApp("whatsapp"); }, [callState]);

  const open = (a: App) => {
    try { click(); } catch { /* */ }
    if (app === "whatsapp" && a !== "whatsapp" && callState === "active") sock.send({ type: "device.event", kind: "app_left", app: a });
    setApp(a);
    sock.send({ type: "device.event", kind: "app_opened", app: a });
  };
  const inCall = callState === "active" && !isGroup;
  const dark = app === "whatsapp" && (callState === "ringing" || callState === "active") && !isGroup && !ui;

  if (!drill) return null;
  return (
    <div className="oneui">
      <div className="screen">
        <div className="punch" />
        <div className={`oui-status ${dark ? "dark" : ""}`}><span>{clock()}</span><div className="right"><span style={{ fontSize: 11 }}>Jio</span><MdSignalCellularAlt size={15} /><MdWifi size={15} /><MdBatteryFull size={16} /></div></div>
        <div className="oui-body">
          {app === "home" && <Home world={drill.world} open={open} unread={notifs.length} hint={hint} />}
          {app === "whatsapp" && <WhatsApp sock={sock} speaking={speaking} onJudgeText={onJudgeText} back={() => open("home")} hint={hint} />}
          {app === "messages" && <Messages back={() => open("home")} sock={sock} />}
          {app === "contacts" && <Contacts back={() => open("home")} sock={sock} />}
          {app === "phone" && <Contacts back={() => open("home")} sock={sock} dialer />}
          {app === "bank" && <Bank sock={sock} back={() => open("home")} />}
          {app === "upi" && <Upi sock={sock} back={() => open("home")} />}
          {(app === "settings" || app === "camera" || app === "gallery") && <Blank name={NAMES[app]} back={() => open("home")} />}
          {ui && ui.target === "phone" && <UiStepView step={ui} chrome="phone" onAction={(action) => sock.send({ type: "ui.action", id: ui.id, action })} />}
          {inCall && app !== "whatsapp" && (
            <div className="pip-call" onClick={() => setApp("whatsapp")}><span className="dot" /><div><b style={{ fontSize: 12 }}>{drill.caller.name}</b><small>Ongoing video call · tap to return</small></div></div>
          )}
          {headsUp && app !== "messages" && !ui && (
            <div className={`oui-headsup ${hint === "otp" && headsUp.app === "messages" ? "hint-target sq" : ""}`} onClick={() => { setHeadsUp(null); if (headsUp.app === "messages") { open("messages"); sock.send({ type: "device.event", kind: "otp_opened" }); } if (headsUp.app === "whatsapp") setApp("whatsapp"); }}>
              <div className="ic" style={{ background: headsUp.app === "whatsapp" ? "#25d366" : "#2f6ce5" }}>{headsUp.app === "messages" ? <MdMessage size={18} /> : headsUp.app === "whatsapp" ? <SiWhatsapp size={18} /> : "!"}</div>
              <div><b>{headsUp.sender ?? headsUp.title}</b><span>{headsUp.attachment ? `📎 ${headsUp.attachment}` : headsUp.body}</span><small>{headsUp.app === "whatsapp" ? "WhatsApp" : "Messages"} · now</small></div>
              <button onClick={(e) => { e.stopPropagation(); setHeadsUp(null); sock.send({ type: "device.event", kind: "toast_dismissed" }); }} style={{ background: "none", border: 0, alignSelf: "flex-start", color: "#7a7a7a" }} aria-label="Dismiss">✕</button>
            </div>
          )}
          {famToast && family.notified && (
            <div className="fam-toast"><MdFamilyRestroom size={20} /><div><b>The room messaged {drill.world.guardian.name} on WhatsApp</b>{family.message}<small>Guardian · just now</small></div></div>
          )}
          {tripped && <AgentsPopover sock={sock} />}
        </div>
        <div className={`oui-navbar ${dark ? "dark" : ""}`}><i /></div>
      </div>
    </div>
  );
}

function AppIcon({ id, bg, children }: { id: App; bg: string; children: ReactNode }) { void id; return <div className="icon" style={{ background: bg }}>{children}</div>; }

function Home({ world, open, unread, hint }: { world: NonNullable<ReturnType<typeof useDrill.getState>["drill"]>["world"]; open: (a: App) => void; unread: number; hint: string | null }) {
  const apps: { id: App; label: string; bg: string; glyph: ReactNode }[] = [
    { id: "whatsapp", label: "WhatsApp", bg: "#25d366", glyph: <SiWhatsapp size={28} color="#fff" /> }, { id: "messages", label: "Messages", bg: "#2f6ce5", glyph: <MdMessage size={28} color="#fff" /> },
    { id: "contacts", label: "Contacts", bg: "#ff7043", glyph: <MdContacts size={28} color="#fff" /> }, { id: "bank", label: "Bharat Bank", bg: "#1b3a6b", glyph: <MdAccountBalance size={28} color="#fff" /> },
    { id: "upi", label: "PhonePe", bg: "#5f259f", glyph: <SiPhonepe size={26} color="#fff" /> }, { id: "camera", label: "Camera", bg: "#37474f", glyph: <MdCameraAlt size={28} color="#fff" /> },
    { id: "gallery", label: "Gallery", bg: "#ec407a", glyph: <MdPhotoLibrary size={28} color="#fff" /> }, { id: "settings", label: "Settings", bg: "#607d8b", glyph: <MdSettings size={28} color="#fff" /> },
  ];
  const hotFor = (id: App) => (hint === "bank" && id === "bank") || (hint === "pay" && id === "upi") || (hint === "otp" && id === "messages");
  return (
    <div className="oui-home">
      <div className="oui-clock">{clock()}</div><div className="oui-date">{dateStr()} · {world.city}</div>
      <div className="oui-grid">
        {apps.map((a) => <button key={a.id} className="oui-app" onClick={() => open(a.id)}><div className={`icon ${hotFor(a.id) ? "hint-target sq" : ""}`} style={{ background: a.bg }}>{a.glyph}{a.id === "messages" && unread > 0 && <span className="dot">{unread}</span>}</div>{a.label}</button>)}
      </div>
      {hint && <div className="hint-note below" style={{ left: "50%", bottom: 110, position: "absolute" }}><b>The caller wants you to {hint === "bank" ? "open your bank app" : hint === "pay" ? "pay via UPI" : hint === "otp" ? "read the OTP" : hint === "share" ? "share your screen" : "follow their instructions"}.</b><br />You don't have to. Real banks and police never ask.</div>}
      <div className="oui-dock">
        {([["phone", "#4caf50", <MdCall size={26} color="#fff" />], ["whatsapp", "#25d366", <SiWhatsapp size={24} color="#fff" />], ["messages", "#2f6ce5", <MdMessage size={26} color="#fff" />], ["camera", "#37474f", <MdCameraAlt size={26} color="#fff" />]] as [App, string, ReactNode][]).map(([id, bg, g]) => (
          <button key={id} className="oui-app" onClick={() => open(id)}><AppIcon id={id} bg={bg}>{g}</AppIcon></button>
        ))}
      </div>
    </div>
  );
}

function AutoScroll({ dep }: { dep: unknown }) { const r = useRef<HTMLDivElement>(null); useEffect(() => { const el = r.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [dep]); return <div ref={r} />; }

function WhatsApp({ sock, speaking, onJudgeText, back, hint }: { sock: DrillSocket; speaking: boolean; onJudgeText: (t: string) => void; back: () => void; hint: string | null }) {
  const drill = useDrill((s) => s.drill)!;
  const callState = useDrill((s) => s.callState);
  const chat = useDrill((s) => s.chat);
  const transcript = useDrill((s) => s.transcript);
  const partial = useDrill((s) => s.partial);
  const family = useDrill((s) => s.family);
  const notifs = useDrill((s) => s.notifs).filter((n) => n.app === "whatsapp");
  const micOn = useDrill((s) => s.voice.micOn); const toggleMic = useDrill((s) => s.toggleMic); const mute = !micOn;
  const [cam, setCam] = useState(true);
  const [speaker, setSpeaker] = useState(true);
  const [sheet, setSheet] = useState<null | "share">(null);
  const [shared, setShared] = useState(false);
  const [sec, setSec] = useState(0);
  const [text, setText] = useState("");
  const [view, setView] = useState<"call" | "chat" | "list" | "guardian">("call");
  const isGroup = drill.channel === "whatsapp-group";
  useEffect(() => { if (callState !== "active") return; const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, [callState]);
  useEffect(() => { if (hint === "share" && callState === "active" && !shared) { const t = setTimeout(() => { setSheet("share"); sock.send({ type: "device.event", kind: "share_shown" }); }, 6000); return () => clearTimeout(t); } }, [hint, callState, shared, sock]);
  const hasFamilyReply = Boolean(family.reply);

  const compose = (
    <form className="wa-compose" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; useDrill.getState().pushChat({ from: "me", text }); onJudgeText(text); setText(""); }}>
      <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" aria-label="Send"><MdSend size={18} /></button>
    </form>
  );

  if (isGroup) {
    const members = drill.members ?? [];
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="wa-header"><button className="back" onClick={() => { sock.send({ type: "device.event", kind: "app_left" }); back(); }} style={{ color: "#fff", background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={22} /></button><div className="av">📈</div><div className="t"><b>{drill.caller.org} 🚀</b><span>{drill.caller.name}, {members.map((m) => m.name.split(" ")[0]).join(", ")}, You</span></div><span style={{ marginLeft: "auto", display: "flex", gap: 12 }}><MdVideocam size={20} /><MdCall size={20} /><MdMoreVert size={20} /></span></div>
        <div className="wa-thread">
          <div className="wa-msg sys"><MdLock size={11} /> Messages are end-to-end encrypted. Only group members can read them.</div>
          <div className="wa-msg sys">You joined via invite link</div>
          {chat.map((m) => (
            <div key={m.id} className={`wa-msg ${m.from === "me" ? "me" : ""}`}>
              {m.from !== "me" && <span className="who" style={{ color: m.color ?? "#128c7e" }}>{m.name}</span>}
              {m.text}
              <span className="meta">{clock()} {m.from === "me" && <span className="tick">✓✓</span>}</span>
            </div>
          ))}
          <AutoScroll dep={chat.length} />
        </div>
        {compose}
      </div>
    );
  }

  if (callState === "ringing") {
    return (
      <div className="wa-incoming">
        <div style={{ fontSize: 13, opacity: .8, display: "flex", gap: 6, alignItems: "center" }}><SiWhatsapp size={14} /> WhatsApp video call</div>
        <div className="av">{initials(drill.caller.name)}</div>
        <h2>{drill.caller.name}</h2>
        <p>{drill.caller.org} · {drill.caller.number}</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>Not in your contacts</p>
        <div className="btns">
          <button className="decline" onClick={() => sock.send({ type: "call.declined" })} aria-label="Decline"><MdCallEnd size={30} /></button>
          <button className="accept" onClick={() => sock.send({ type: "call.answered" })} aria-label="Answer"><MdVideocam size={30} /></button>
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
          <div className="top"><div><b>{drill.caller.name}</b><span>{drill.caller.org} · {String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}</span></div><span style={{ marginLeft: "auto", fontSize: 11, background: "#fff2", padding: "2px 6px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4 }}><MdLock size={11} /> encrypted</span></div>
          <div className="self">{!cam ? <span style={{ padding: 6, textAlign: "center" }}><MdVideocamOff size={22} /><br />Camera off</span> : partial ? <span style={{ padding: 6, textAlign: "center", color: "#cfe" }}>“{partial.slice(-40)}”</span> : "You"}</div>
          {shared && <div style={{ position: "absolute", left: 12, bottom: 12, background: "#e53935", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 4, zIndex: 2, display: "flex", alignItems: "center", gap: 4 }}><MdScreenShare size={12} /> Sharing your screen</div>}
          {mute && <div style={{ position: "absolute", left: 12, bottom: shared ? 60 : 36, background: "#0008", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 4, zIndex: 2 }}><MdMicOff size={12} /> You're muted</div>}
          {last && !shared && !mute && <div style={{ position: "absolute", left: 12, right: 108, bottom: 36, color: "#fff", fontSize: 12, textShadow: "0 1px 2px #000", zIndex: 2, opacity: .85 }}>{last.text.slice(0, 110)}</div>}
        </div>
        {view === "chat" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "#efeae2", display: "flex", flexDirection: "column" }}>
            <div className="wa-header"><button onClick={() => setView("call")} style={{ color: "#fff", background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={22} /></button><div className="av">{initials(drill.caller.name)}</div><div className="t"><b>{drill.caller.name}</b><span>on a video call · tap to return</span></div></div>
            <div className="wa-thread">
              <div className="wa-msg sys"><MdLock size={11} /> Messages and calls are end-to-end encrypted.</div>
              {notifs.map((n) => <div key={n.id} className="wa-msg"><span className="who" style={{ color: "#128c7e" }}>{n.sender}</span>{n.attachment && <div style={{ background: "#f0f0f0", borderRadius: 6, padding: "8px 10px", margin: "4px 0", display: "flex", gap: 8, alignItems: "center" }}><MdPictureAsPdf size={26} color="#e53935" /><div><b style={{ fontSize: 12 }}>{n.attachment.split(" · ")[0]}</b><div style={{ fontSize: 10, color: "#666" }}>{n.attachment.split(" · ").slice(1).join(" · ")}</div></div></div>}{n.body}<span className="meta">{clock()}</span></div>)}
              {!notifs.length && <div className="wa-msg sys">No messages yet.</div>}
              <AutoScroll dep={notifs.length + chat.length} />
            </div>
            {compose}
          </div>
        )}
        {view === "guardian" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "#efeae2", display: "flex", flexDirection: "column" }}>
            <div className="wa-header"><button onClick={() => setView("call")} style={{ color: "#fff", background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={22} /></button><div className="av">{initials(drill.world.guardian.name)}</div><div className="t"><b>{drill.world.guardian.name}</b><span>{drill.world.guardian.relation} · online</span></div></div>
            <div className="wa-thread">
              <div className="wa-msg me">{drill.world.chats[0]?.last ?? "Hi"}<span className="meta">9:12 <span className="tick">✓✓</span></span></div>
              {family.reply && <div className="wa-msg"><span className="who" style={{ color: "#128c7e" }}>{drill.world.guardian.name}</span>{family.native && family.native !== family.reply && <div style={{ fontFamily: '"Noto Sans Kannada","Noto Sans Devanagari",Inter', fontWeight: 700 }}>{family.native}</div>}{family.reply}<span className="meta">{clock()}</span></div>}
              {!family.reply && <div className="wa-msg sys">{family.notified ? "The room has messaged them. Waiting for a reply…" : "Say something, or let the room decide."}</div>}
            </div>
            <div className="wa-compose"><button type="button" onClick={() => sock.send({ type: "device.event", kind: "guardian_called" })} style={{ width: "auto", padding: "0 16px", borderRadius: 22, display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><MdCall size={16} /> Call {drill.world.guardian.name}</button></div>
          </div>
        )}
        {hint === "share" && sheet !== "share" && !shared && view === "call" && <div className="hint-note above" style={{ left: "50%", bottom: 96 }}><b>He's asking you to share your screen.</b><br />You don't have to. Nothing official is verified this way.</div>}
        {hint === "notice" && notifs.length > 0 && view === "call" && <div className="hint-note above" style={{ left: "50%", bottom: 96 }}><b>A “notice” arrived on WhatsApp.</b><br />Tap the chat icon to read it. Real notices don't come this way.</div>}
        {hasFamilyReply && view === "call" && <div className="hint-note above" style={{ left: "50%", bottom: 96, background: "#1a7f3a" }}><b>{drill.world.guardian.name} replied on WhatsApp.</b><br />Tap the chat icon to read it.</div>}
        {sheet === "share" && (
          <div className="wa-sheet"><h4>Share your screen?</h4><p>WhatsApp will start sharing everything visible on your screen with {drill.caller.name}, including banking apps and messages.</p>
            <div className="row"><button className="no" onClick={() => { setSheet(null); sock.send({ type: "device.event", kind: "share_dismissed" }); }}>Cancel</button><button className="go" onClick={() => { setSheet(null); setShared(true); sock.send({ type: "device.event", kind: "share_accepted" }); }}>Start now</button></div></div>
        )}
        <div className="controls">
          <button className={!cam ? "on" : ""} onClick={() => { setCam((c) => !c); if (cam) sock.send({ type: "device.event", kind: "camera_off" }); }} title="Camera">{cam ? <MdVideocam size={22} /> : <MdVideocamOff size={22} />}</button>
          <button className={mute ? "on" : ""} onClick={() => { if (micOn) sock.send({ type: "device.event", kind: "muted" }); toggleMic?.(); }} title={mute ? "Unmute (start mic)" : "Mute (stop mic)"}>{mute ? <MdMicOff size={22} /> : <MdMic size={22} />}</button>
          <button className={speaker ? "" : "on"} onClick={() => setSpeaker((s) => !s)} title="Speaker"><MdVolumeUp size={22} /></button>
          <button title="Messages" className={(hint === "notice" && notifs.length && view === "call") || (hasFamilyReply && view === "call") ? "hint-target" : ""} onClick={() => setView(hasFamilyReply ? "guardian" : "chat")}><MdChat size={22} /></button>
          <button title="Share screen" className={hint === "share" && view === "call" && !shared ? "hint-target" : ""} onClick={() => { setSheet("share"); sock.send({ type: "device.event", kind: "share_shown" }); }}><MdScreenShare size={22} /></button>
          <button className="end" onClick={() => sock.send({ type: "device.event", kind: "call_ended" })} title="End call"><MdCallEnd size={22} /></button>
        </div>
      </div>
    );
  }
  const threads = [...(notifs.length ? [{ name: drill.caller.name, last: `📎 ${notifs[notifs.length - 1].attachment ?? notifs[notifs.length - 1].body}`, time: "now" }] : []), ...drill.world.chats];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="wa-header"><div className="t"><b>WhatsApp</b></div><span style={{ marginLeft: "auto", display: "flex", gap: 14 }}><MdCameraAlt size={20} /><MdSearch size={20} /><MdMoreVert size={20} /></span></div>
      <div className="wa-tabs"><div className="on">Chats</div><div>Updates</div><div>Communities</div><div>Calls</div></div>
      <div className="oui-list">{threads.map((t) => <div key={t.name} className="oui-row" onClick={() => t.name === drill.world.guardian.name ? setView("guardian") : undefined}><div className="av">{initials(t.name)}</div><div className="t"><b>{t.name}</b><span>{t.last}</span></div><div className="ts">{t.time}</div></div>)}</div>
    </div>
  );
}

function Messages({ back, sock }: { back: () => void; sock: DrillSocket }) {
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
      <div className="oui-app-header"><button className="back" onClick={() => (cur ? setOpenThread(null) : back())} aria-label="Back"><MdArrowBack size={22} /></button>{cur ? cur.sender : "Messages"}<span style={{ marginLeft: "auto", display: "flex", gap: 12 }}><MdSearch size={20} /><MdMoreVert size={20} /></span></div>
      {cur ? (
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#f6f6f6" }}>
          {cur.msgs.map((m, i) => <div key={i} style={{ alignSelf: "flex-start", background: "#fff", borderRadius: 18, padding: "10px 14px", fontSize: 14, maxWidth: "88%", boxShadow: "0 1px 2px #0001" }} onClick={() => /OTP/i.test(m.text) && sock.send({ type: "device.event", kind: "otp_opened" })}>{m.text}<div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 4 }}>{tsShort(m.ts)}</div></div>)}
        </div>
      ) : (
        <div className="oui-list">{threads.map((t) => <div key={t.sender} className="oui-row" onClick={() => { setOpenThread(t.sender); if (t.msgs.some((m) => /OTP/i.test(m.text))) sock.send({ type: "device.event", kind: "otp_opened" }); }}><div className="av" style={{ background: "#e3f2fd", color: "#1565c0" }}>{t.sender.slice(0, 2)}</div><div className="t"><b>{t.sender}</b><span>{t.msgs.at(-1)?.text}</span></div><div className="ts">{tsShort(t.msgs.at(-1)!.ts)}</div></div>)}</div>
      )}
    </div>
  );
}

function Contacts({ back, sock, dialer = false }: { back: () => void; sock: DrillSocket; dialer?: boolean }) {
  const drill = useDrill((s) => s.drill)!;
  const [calling, setCalling] = useState<string | null>(null);
  useEffect(() => { sock.send({ type: "device.event", kind: "app_opened", app: "contacts" }); }, [sock]);
  if (calling) {
    const g = drill.world.guardian;
    return (
      <div className="wa-incoming" style={{ background: "linear-gradient(#1b3a6b, #0b141a)" }}>
        <div style={{ fontSize: 13, opacity: .8 }}>Calling…</div><div className="av">{initials(calling)}</div><h2>{calling}</h2><p>{calling === g.name ? `${g.relation} · mobile` : "mobile"}</p>
        <p style={{ fontSize: 12, marginTop: 8, opacity: .8 }}>{calling === g.name ? "This is the right move. Calling someone you trust ends the drill." : "Only calling someone you trust ends the drill."}</p>
        <div className="btns" style={{ gap: 20 }}><button className="decline" onClick={() => setCalling(null)} aria-label="End"><MdCallEnd size={28} /></button>{calling === g.name && <button className="accept" onClick={() => sock.send({ type: "device.event", kind: "guardian_called" })} aria-label="Connected"><MdPhoneInTalk size={28} /></button>}</div>
      </div>
    );
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div className="oui-app-header"><button className="back" onClick={back} aria-label="Back"><MdArrowBack size={22} /></button>{dialer ? "Phone" : "Contacts"} <span style={{ marginLeft: "auto", fontSize: 13, color: "#7a7a7a" }}>{drill.world.contacts.length} contacts</span></div>
      <div className="oui-list">{drill.world.contacts.map((c) => <div key={c.name} className="oui-row" onClick={() => setCalling(c.name)}><div className="av" style={c.name === drill.world.guardian.name ? { background: "#dcefdc", color: "#1a7f3a" } : undefined}>{initials(c.name)}</div><div className="t"><b>{c.name}</b><span>{c.number}{c.relation ? ` · ${c.relation}` : ""}</span></div><MdCall size={20} color="#4caf50" /></div>)}</div>
    </div>
  );
}

function Bank({ sock, back }: { sock: DrillSocket; back: () => void }) {
  const drill = useDrill((s) => s.drill)!;
  const [screen, setScreen] = useState<"home" | "transfer" | "otp" | "done" | "statement" | "more">("home");
  const [otp, setOtp] = useState("");
  const [debited, setDebited] = useState(0);
  const hint = useDrill((s) => s.hint);
  const b = { ...drill.world.bank, balance: drill.world.bank.balance - debited };
  const goBack = () => { if (screen === "home") back(); else { if (screen === "otp" || screen === "transfer") sock.send({ type: "device.event", kind: "pay_cancelled" }); setScreen("home"); } };
  return (
    <div className="bank">
      <div className="hdr"><div style={{ display: "flex", alignItems: "center", gap: 10 }}><button className="back" onClick={goBack} style={{ color: "#fff", background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={22} /></button><div className="logo"><i />Bharat Bank</div></div><div style={{ fontSize: 12, opacity: .8, marginTop: 6 }}>Good afternoon, {drill.world.personaName}</div></div>
      {screen === "home" && (<>
        <div className="card"><small>Savings account · {b.masked}</small><div className="bal">₹{b.balance.toLocaleString("en-IN")}</div><small>Available balance · updated just now</small></div>
        <div className="acts">
          <button className={hint === "otp" ? "hint-target sq" : ""} onClick={() => setScreen("transfer")}><i><MdCurrencyRupee size={18} /></i>Transfer</button>
          <button onClick={() => { back(); }}><i><MdSwapHoriz size={18} /></i>UPI</button>
          <button onClick={() => setScreen("statement")}><i><MdReceiptLong size={18} /></i>Statement</button>
          <button onClick={() => setScreen("more")}><i><MdMenu size={18} /></i>More</button>
        </div>
        {debited > 0 && <div style={{ margin: "0 14px 10px", background: "#fdecea", color: "#b71c1c", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>₹{debited.toLocaleString("en-IN")} debited · RBI Monitored A/c · just now</div>}
        <div className="txns">{b.txns.map((t, i) => <div key={i} className="txn"><div>{t.desc}<small>{new Date(t.ts).toLocaleDateString("en-IN")}</small></div><div style={{ color: t.amount > 0 ? "#2e7d32" : "#1a1a1a", fontWeight: 600 }}>{t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount).toLocaleString("en-IN")}</div></div>)}</div>
      </>)}
      {screen === "statement" && <div className="otp-screen"><h3 style={{ margin: "0 0 10px" }}>September statement</h3>{b.txns.map((t, i) => <div key={i} className="txn" style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13 }}><span>{t.desc}</span><span>{t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount).toLocaleString("en-IN")}</span></div>)}<p style={{ fontSize: 12, color: "#6b7280", marginTop: 12 }}>No transactions to an "RBI monitored account" exist. RBI does not hold customer money.</p></div>}
      {screen === "more" && <div className="otp-screen">{["Cards", "Loans", "Fixed deposits", "Block card", "Report fraud · 1930"].map((l) => <div key={l} style={{ padding: "12px 0", borderBottom: "1px solid #eee", fontSize: 14 }}>{l}</div>)}</div>}
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
        <div className="otp-screen" style={{ textAlign: "center" }}><MdCheckCircle size={52} color="#2e7d32" /><h3 style={{ margin: "6px 0" }}>Transfer successful</h3><p style={{ color: "#6b7280", fontSize: 13 }}>₹85,000 sent to RBI Monitored A/c 9182XXXXXX<br />Ref BHRB{Date.now().toString().slice(-8)}</p><button onClick={() => setScreen("home")}>Done</button></div>
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
      <div className="top" style={{ display: "flex", alignItems: "center", gap: 10 }}><button onClick={() => { if (!paid) sock.send({ type: "device.event", kind: "pay_cancelled" }); back(); }} style={{ color: "#fff", background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={22} /></button><SiPhonepe size={20} /> PhonePe</div>
      <div className="pane">
        <div style={{ fontSize: 12, color: "#7a7a7a" }}>Paying</div><div style={{ fontSize: 17, fontWeight: 600 }}>{to}</div><div style={{ fontSize: 12, color: "#7a7a7a" }}>UPI ID: {to.toLowerCase().replace(/\s+/g, "")}@ybl</div>
        <div className="amt">₹{amt}</div><div style={{ fontSize: 12, color: "#7a7a7a" }}>From Bharat Bank {drill.world.bank.masked}</div>
        {!paid ? <button className={`pay ${hint === "pay" ? "hint-target sq" : ""}`} onClick={() => { setPaid(true); sock.send({ type: "device.event", kind: "payment_tapped", app: "upi", detail: `₹${amt}` }); }}>Pay ₹{amt}</button>
        : <div style={{ marginTop: 16, textAlign: "center" }}><MdCheckCircle size={44} color="#2e7d32" /><br /><b>Paid ₹{amt}</b><div style={{ fontSize: 12, color: "#7a7a7a" }}>to {to} · UPI Ref {Date.now().toString().slice(-10)}</div></div>}
        {hint === "pay" && !paid && <div style={{ fontSize: 11, color: "#7a5a00", background: "#fff3cd", padding: "6px 8px", borderRadius: 4, marginTop: 8 }}>⚠ No lender, employer or exchange collects fees this way. You don't have to pay.</div>}
      </div>
    </div>
  );
}

function Blank({ name, back }: { name: string; back: () => void }) {
  return <div style={{ height: "100%", background: "#fff" }}><div className="oui-app-header"><button className="back" onClick={back} aria-label="Back"><MdArrowBack size={22} /></button>{name}</div><div style={{ padding: 20, color: "#7a7a7a", fontSize: 13 }}>Nothing to see here during the drill.</div></div>;
}
void MdShield; void MdOpenInNew;
