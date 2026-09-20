import type { ReactNode } from "react";
import { MdArrowBack, MdPictureAsPdf, MdShare, MdMoreVert, MdClose } from "~/components/icons";
import "./docviewer.css";

export interface DocSpec { file: string; from: string; org: string; title: string; body: string; to: string; caseNo?: string; kind: "notice" | "offer" | "generic" }

/** A fake PDF of the thing the caller "sent": a letterhead, a reference, the body, a seal. Opens inside the phone or as a window on the laptop. */
export function DocPage({ doc }: { doc: DocSpec }) {
  const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const paras = doc.body.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  return (
    <div className="docpage">
      <div className="doc-head">
        <div className="doc-emblem">{doc.kind === "notice" ? "⚖" : doc.kind === "offer" ? "◆" : "▣"}</div>
        <div><b>{doc.org}</b><small>{doc.kind === "notice" ? "Office of the Investigating Officer · Cyber Cell" : doc.kind === "offer" ? "Human Resources · Campus Hiring" : "Official communication"}</small></div>
      </div>
      <div className="doc-ref"><span>Ref: {doc.caseNo ?? "N/A"}</span><span>Date: {date}</span></div>
      <h1>{doc.title}</h1>
      <p className="doc-to">To,<br />{doc.to}</p>
      {paras.map((p, i) => <p key={i}>{p}</p>)}
      {doc.kind === "notice" && <p>You are directed to remain available on this line for verification. Failure to comply will be treated as non-cooperation under the applicable sections and may result in a physical arrest.</p>}
      {doc.kind === "offer" && <p>Kindly confirm your seat by completing the onboarding formalities within 30 minutes of receipt. Seats are allotted on a first-confirmed basis.</p>}
      <div className="doc-seal">{doc.kind === "notice" ? "URGENT · CONFIDENTIAL" : doc.kind === "offer" ? "TIME SENSITIVE" : "ORIGINAL"}</div>
      <div className="doc-sign"><i /><span>{doc.from}</span><small>{doc.org}</small></div>
      <div className="doc-warn">Look closely: no real notice arrives on WhatsApp, none asks you to stay on a call, and none is signed by the person who called you. This document is part of a drill.</div>
    </div>
  );
}

export function PhoneDoc({ doc, onClose, extra }: { doc: DocSpec; onClose: () => void; extra?: ReactNode }) {
  return (
    <div className="docview phone">
      <div className="docbar"><button onClick={onClose} aria-label="Back"><MdArrowBack size={22} /></button><MdPictureAsPdf size={18} color="#e53935" /><b>{doc.file}</b><span style={{ marginLeft: "auto", display: "flex", gap: 14 }}><MdShare size={20} /><MdMoreVert size={20} /></span></div>
      <div className="docscroll"><DocPage doc={doc} />{extra}</div>
      <div className="docfoot">1 / 1 · PDF</div>
    </div>
  );
}

export function LaptopDoc({ doc, onClose }: { doc: DocSpec; onClose: () => void }) {
  return (
    <div className="docview laptop">
      <div className="docbar"><MdPictureAsPdf size={16} color="#e53935" /><b>{doc.file}</b><span style={{ marginLeft: "auto", fontSize: 11, color: "#666" }}>1 / 1 · 100%</span><button onClick={onClose} aria-label="Close" style={{ marginLeft: 12 }}><MdClose size={16} /></button></div>
      <div className="docscroll"><DocPage doc={doc} /></div>
    </div>
  );
}
