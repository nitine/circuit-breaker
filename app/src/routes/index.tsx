import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Room } from "~/room/Room";
import { useRoom } from "~/room/roomStore";
import { Topbar } from "~/components/Topbar";
import pagesCss from "~/styles/pages.css?url";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "stylesheet", href: pagesCss }] }),
  component: Landing,
});

function Landing() {
  useEffect(() => { const r = useRoom.getState(); r.reset(); r.setMode("attract"); }, []);
  return (
    <div className="landing">
      <div className="hero-room">
        <Room hideBubblesLeftOf={760} parallax />
        <div className="ground" />
        <Topbar />
        <div className="hero">
          <div className="eyebrow">A LIVE SCAM DRILL · BUILT ON AWS</div>
          <h1>Get scammed.<br />Safely.</h1>
          <p className="sub">A real AI scammer calls you. Five agents in this room listen for coercion and trip the breaker before you lose anything. Built for the people scammers target: elders, students, migrant workers, anyone alone with a phone.</p>
          <div className="ctas">
            <Link to="/drill/new" className="px-btn primary">📞 Start the drill</Link>
            <Link to="/how" className="px-btn ghost">How the room works</Link>
          </div>
          <div className="trust">No real money. No recordings kept. Fictional scenarios only. Not affiliated with any app, bank or agency shown.</div>
        </div>
      </div>
      <section className="below">
        <div>
          <h2>Everyone watches the number. Nobody watches the call.</h2>
          <p>Airtel and Jio score callers at the network layer. Truecaller scores reputation. DoT's Fraud Risk Indicator scores numbers for banks. None of them hears the conversation, and one in three victims call the scammer back themselves.</p>
          <p>Circuit Breaker scores the conversation. A live transcript plus what's happening on the device becomes one number, the coercion index. At seventy, the breaker trips and someone you trust is put between you and the caller.</p>
          <p>Judges can't experience a real scam, so this site gives you one. The scammer is synthetic. The engine is not.</p>
          <div className="rooms">
            <div><b>LISTENER</b>Amazon Transcribe streaming</div>
            <div><b>ANALYST</b>Bedrock + Guardrails</div>
            <div><b>ARCHIVIST</b>Playbook corpus</div>
            <div><b>GUARDIAN</b>The breaker · Polly</div>
            <div><b>REPORTER</b>Strands on Lambda · S3</div>
          </div>
        </div>
        <blockquote>
          “A time-based kill switch does not address the underlying coercion; it merely interrupts the technical session.”
          <cite>WhatsApp, to the Supreme Court of India, in the digital-arrest suo motu case, 2026. We built the thing that addresses the coercion.</cite>
        </blockquote>
      </section>
      <footer><span>Circuit Breaker · a drill simulator for the WeMakeDevs × AWS First Commit hackathon</span><span>Apache-2.0</span></footer>
    </div>
  );
}
