import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Room } from "~/room/Room";
import { useRoom } from "~/room/roomStore";
import { Topbar } from "~/components/Topbar";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/how")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  component: How,
});

const ITEMS: { key: string; object: string; agent: string; service: string; body: string; code: string; status?: string }[] = [
  { key: "listenerDesk", object: "Headphones desk", agent: "Listener", service: "AMAZON TRANSCRIBE STREAMING", body: "Your mic streams 16 kHz PCM over the drill WebSocket only while you're speaking. Transcribe returns partial results, so the CRT ticker moves before you finish the sentence. en-IN and hi-IN. Local mode swaps in the browser's own speech recognition.", code: "transcript.partial → CRT ticker\ntranscript.final   → Analyst" },
  { key: "board", object: "Cork board", agent: "Analyst", service: "AMAZON BEDROCK · CLAUDE + GUARDRAILS", body: "Every scammer line is tagged against the coercion ontology with a JSON schema: authority, personalisation, fear, isolation, urgency, control, payment steering, reciprocity. Each tactic has a weight; repeats within 60 s escalate ×1.5. The card on the board is the raw JSON drawn as paper.", code: '{ "tactics": ["ISOLATION"], "quote": "Do not tell your son" }\n→ +15, index 46' },
  { key: "cabinet", object: "Filing cabinet", agent: "Archivist", service: "PLAYBOOK CORPUS · IN-PROCESS MATCH", body: "Five scam families as JSON playbooks: phases, goals, openers, resist branches, win conditions. The Archivist matches the live transcript to a phase and hands the Analyst the next expected move, which is how cards pre-land. A Bedrock Knowledge Base would replace this; skipped for the demo because OpenSearch Serverless costs ~$12/day idle.", code: "playbook.match { family, phase, score, next }", status: "in-process for the demo" },
  { key: "gauge", object: "Wall gauge", agent: "the index", service: "COERCION INDEX · 0 → 100", body: "Monotonic within a session because coercion is cumulative. Utterance deltas plus device signals: screen share accepted +15, remote access accepted +25, OTP arriving mid-call +12, bank app opened +10. Thresholds 40 warn, 55 nudge, 70 trip.", code: "index = Σ tactic deltas × escalation × playbook + signals" },
  { key: "lever", object: "Breaker lever", agent: "Guardian", service: "ESCALATION LADDER · AMAZON POLLY", body: "Armed → warn → nudge → trip. At 70 the lever drops, the scammer's audio ducks to 20%, and the family member's line plays on the device in Polly's voice. No real phone call is placed; the trip is entirely on the device. Step Functions for the ladder itself is a stretch.", code: "ladder.step { from, to } · breaker.trip · family.called" },
  { key: "booth", object: "Phone booth", agent: "Guardian", service: "FAMILY ON THE LINE", body: "The Guardian runs here on trip. The device shows one green button and the guardian's face. No red. The scammer might be watching the screen.", code: "family.answered → drill ends · ending B" },
  { key: "printer", object: "Printer", agent: "Reporter", service: "STRANDS AGENT · LAMBDA · STEP FUNCTIONS · S3", body: "On trip or end, the process puts drill.tripped on an EventBridge bus. A rule starts a Step Functions execution that runs the Reporter, a Strands Agents SDK agent in a Python Lambda, which writes the 1930 helpline packet to S3 and the presigned URL to DynamoDB. Local mode builds the same packet in-process.", code: "packet.progress 20 → 60 → 100 · packet.ready { url }" },
  { key: "crt", object: "CRT screen", agent: "the transcript", service: "NITRO WEBSOCKET · TANSTACK START", body: "One WebSocket per drill, in the same Node process that serves the pages. Audio up as binary frames, room events down as JSON with a sequence number. The room ignores out-of-order events, so a slow Analyst never makes a sprite walk backwards.", code: "ws://…/ws?drill=<id>" },
  { key: "desk", object: "The phone on the desk", agent: "the device", service: "ONE UI · WINDOWS 11 · REACT", body: "Faithful replicas of the apps a scam touches: WhatsApp, Messages, Contacts, a fictional bank, PhonePe; Chrome, Gmail, Meet, AnyDesk. Everything you do that matters is a device.event to the engine. Bedrock builds the phone's contents from the persona.", code: "device.event { kind: 'share_accepted' } → +15" },
  { key: "analyst", object: "Everything else", agent: "hosting", service: "ECS FARGATE · ALB · CLOUDFRONT · DYNAMODB", body: "One container behind an ALB, CloudFront in front for HTTPS (the mic needs it) and the WebSocket. Drill state in a single DynamoDB table with a 24 h TTL. CDK in infra/. About $65 of a $100 credit for 150 drills, with billing alarms at $60 and $80.", code: "node .output/server/index.mjs" },
];

function How() {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>("board");
  useEffect(() => { const r = useRoom.getState(); r.reset(); r.setMode("exploded"); r.setPhone(false, false); }, []);
  const key = hover ?? pinned;
  const item = ITEMS.find((i) => i.key === key || (key && ["listener", "analyst", "archivist", "guardian", "reporter"].includes(key) && i.agent.toLowerCase() === key));
  return (
    <div className="how">
      <div className="stage">
        <Topbar right={<span style={{ fontSize: 12 }}>Hover any object in the room · click a row to pin</span>} />
        <div style={{ paddingTop: 64 }}>
          <Room interactiveHover onHover={setHover} />
        </div>
        {item && (
          <div className="card"><h3>{item.agent} · {item.object}</h3><div className="svc">{item.service}</div><p>{item.body}</p><code>{item.code}</code>{item.status && <p style={{ color: "#6b5636", fontSize: 11, marginTop: 8 }}>◆ {item.status}</p>}</div>
        )}
      </div>
      <div className="legend">
        <h4>EVERY OBJECT IS A SERVICE</h4>
        {ITEMS.map((i) => <div key={i.key} className={`row ${key === i.key ? "on" : ""}`} onMouseEnter={() => setHover(i.key)} onMouseLeave={() => setHover(null)} onClick={() => setPinned(i.key)}><b>{i.object} · {i.agent}</b><span>{i.service}</span></div>)}
        <div className="note">◆ Hover an object in the room and its row lights up, and the other way round. This page is the "Built on AWS" criterion, interactive. Items marked in-process are honest about what runs where in the demo.</div>
      </div>
    </div>
  );
}
