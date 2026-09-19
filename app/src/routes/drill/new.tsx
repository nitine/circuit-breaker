import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Room } from "~/room/Room";
import { useRoom } from "~/room/roomStore";
import { Topbar } from "~/components/Topbar";
import { api } from "~/shared/api";
import type { DeviceKind, Lang } from "~/shared/types";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/drill/new")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  component: Picker,
});

function Picker() {
  const nav = useNavigate();
  const cat = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });
  const [personaId, setPersonaId] = useState<string>("kamala");
  const [custom, setCustom] = useState("");
  const [family, setFamily] = useState<string>("digital-arrest");
  const [device, setDevice] = useState<DeviceKind | "auto">("auto");
  const [hard, setHard] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { const r = useRoom.getState(); r.reset(); r.setMode("dimmed"); }, []);
  useEffect(() => { const p = cat.data?.personas.find((x) => x.id === personaId); if (p) setFamily(p.defaultFamily); }, [personaId, cat.data]);
  const create = useMutation({
    mutationFn: () => api.createDrill({ personaId: personaId === "custom" ? undefined : personaId, personaText: personaId === "custom" ? custom : undefined, family: family as never, device, hardMode: hard, language: lang }),
    onSuccess: (d) => nav({ to: "/drill/$drillId", params: { drillId: d.id }, search: {} }),
  });
  const famDevice = useMemo(() => cat.data?.families.find((f) => f.id === family)?.device, [cat.data, family]);
  const effDevice = device === "auto" ? famDevice ?? "phone" : device;
  const canGo = personaId !== "custom" || custom.trim().length > 10;

  return (
    <div className="picker">
      <div className="bg"><Room /></div>
      <Topbar right={<a href="/" style={{ fontSize: 12 }}>✕ back to the room</a>} />
      <div className="file px-panel">
        <div className="tab">CASE FILE · NEW</div><div className="clip" />
        <h1>Who's on the desk today?</h1>
        <p className="hint">Pick a person, pick the case, and the phone on the desk will ring. Nothing here is real: no money moves, nothing is recorded, every name is fictional.</p>
        <div className="sec">
          <span className="px-label">1 · Who you are</span>
          <div className="personas">
            {cat.data?.personas.map((p) => (
              <button key={p.id} className={`persona ${personaId === p.id ? "on" : ""}`} onClick={() => setPersonaId(p.id)}>
                <img src={`/room/sprites/${p.sprite}.png`} alt="" />
                <b>{p.name}, {p.age}</b><span>{p.blurb}</span>
              </button>
            ))}
            <div className={`persona ${personaId === "custom" ? "on" : ""}`} onClick={() => setPersonaId("custom")} role="button">
              <img src="/room/sprites/custom.png" alt="" />
              <b>+ Your own</b>
              <textarea placeholder={"\"I'm 22, just moved to Pune for a BPO job, mother is sick…\""} value={custom} onChange={(e) => { setCustom(e.target.value); setPersonaId("custom"); }} />
              <span style={{ color: "#1f5fbf" }}>{cat.data?.features.bedrock ? "Bedrock builds the phone from this." : "Local mode: a template phone is built from this."}</span>
            </div>
          </div>
        </div>
        <div className="sec">
          <span className="px-label">2 · The case</span>
          <div className="chips">
            {cat.data?.families.map((f) => <button key={f.id} className={`px-chip ${family === f.id ? "on" : ""}`} onClick={() => setFamily(f.id)}>{f.label}</button>)}
            <button className={`px-chip ${family === "surprise" ? "on" : ""}`} onClick={() => setFamily("surprise")}>Surprise me</button>
            <span style={{ fontFamily: "var(--font-type)", fontSize: 12, color: "#1f5fbf", alignSelf: "center" }}>← one playbook per case, from the Archivist's cabinet</span>
          </div>
        </div>
        <div className="sec">
          <span className="px-label">3 · Language of the call</span>
          <div className="chips">
            <button className={`px-chip ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>English</button>
            <button className={`px-chip ${lang === "hi" ? "on" : ""}`} onClick={() => setLang("hi")}>हिंदी · Hindi</button>
            <span style={{ fontFamily: "var(--font-type)", fontSize: 12, color: "#1f5fbf", alignSelf: "center" }}>
              {lang === "hi" ? (cat.data?.features.polly ? "Caller speaks Hindi via Polly; Transcribe listens in hi-IN." : "Hindi lines for the phone cases; voice needs Polly or a Hindi browser voice, else captions.") : (cat.data?.features.polly ? "Polly voice, Transcribe listens in en-IN." : cat.data?.features.piper ? "Local neural voice (Piper). Browser speech recognition listens." : "No voice engine found: captions only until AWS keys or Piper are set.")}
            </span>
          </div>
        </div>
        <div className="sec">
          <span className="px-label">4 · Your device</span>
          <div className="devices">
            {([["auto", "Follows the case", `${family === "surprise" ? "Decided when the drill starts" : `${famDevice === "laptop" ? "Windows laptop" : "Android phone"} for this case`}`], ["phone", "Android phone", "One UI · WhatsApp, Messages, Bank, PhonePe"], ["laptop", "Windows laptop", "Windows 11 · Chrome, Gmail, Meet, AnyDesk"]] as const).map(([id, b, s]) => (
              <button key={id} className={`device ${device === id ? "on" : ""}`} onClick={() => setDevice(id)}><span style={{ fontSize: 22 }}>{id === "laptop" ? "💻" : id === "phone" ? "📱" : "🎲"}</span><div><b>{b}</b><span>{s}</span></div></button>
            ))}
          </div>
        </div>
        <div className="foot">
          <div className="opts">
            <label><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard mode — hide the room</label>
            <span style={{ color: "#6b5636" }}>Mode: {cat.data?.mode === "aws" ? "AWS (Bedrock · Transcribe · Polly)" : "local (scripted caller, browser voice)"}</span>
          </div>
          <button className="px-btn primary" disabled={!canGo || create.isPending || !cat.data} onClick={() => create.mutate()}>
            {create.isPending ? "Building the phone…" : effDevice === "laptop" ? "💻 Put the laptop on the desk" : "📞 Put the phone on the desk"}
          </button>
        </div>
        {create.error && <div className="err">{(create.error as Error).message}</div>}
        <div className="disclose">Simulation for awareness training. App names and interfaces are reproduced for realism only; no affiliation with WhatsApp, Google, Microsoft, AnyDesk, PhonePe or any bank.</div>
      </div>
    </div>
  );
}
