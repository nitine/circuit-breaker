import { useEffect, useRef } from "react";
import type { UiStep } from "~/shared/types";
import { MdArrowBack, MdLock, MdMoreVert, MdClose, MdWarning, MdPictureAsPdf, MdShare } from "~/components/icons";
import "./docviewer.css";

/**
 * Renders a generated page inside the device in a sandboxed iframe.
 * Buttons inside the page carry data-action; a tiny bridge posts them to us, and we turn them into ui.action for the engine.
 */
export function UiStepView({ step, onAction, chrome }: { step: UiStep; onAction: (action: string) => void; chrome: "phone" | "laptop" }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => { if (ev.source === ref.current?.contentWindow && ev.data?.cb === "action" && typeof ev.data.action === "string") onAction(ev.data.action); };
    window.addEventListener("message", onMsg); return () => window.removeEventListener("message", onMsg);
  }, [onAction]);
  const frame = <iframe ref={ref} title={step.title} sandbox="allow-scripts" srcDoc={step.html} style={{ border: 0, width: "100%", height: "100%", background: "#fff" }} />;
  if (step.kind === "doc") {
    return chrome === "phone" ? (
      <div className="docview phone">
        <div className="docbar"><button onClick={() => onAction("close")} aria-label="Back"><MdArrowBack size={22} /></button><MdPictureAsPdf size={18} color="#e53935" /><b>{step.title}</b><span style={{ marginLeft: "auto", display: "flex", gap: 14 }}><MdShare size={20} /><MdMoreVert size={20} /></span></div>
        <div style={{ flex: 1 }}>{frame}</div>
        <div className="docfoot">1 / 1 · PDF</div>
      </div>
    ) : (
      <div className="docview laptop">
        <div className="docbar"><MdPictureAsPdf size={16} color="#e53935" /><b>{step.title}</b><span style={{ marginLeft: "auto", fontSize: 11, color: "#666" }}>1 / 1 · 100%</span><button onClick={() => onAction("close")} aria-label="Close" style={{ marginLeft: 12 }}><MdClose size={16} /></button></div>
        <div style={{ flex: 1 }}>{frame}</div>
      </div>
    );
  }
  if (chrome === "phone") {
    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f6f6f6", borderBottom: "1px solid #e5e5e5", fontFamily: "Roboto, Inter, sans-serif" }}>
          <button onClick={() => onAction("close")} style={{ background: "none", border: 0, display: "grid", placeItems: "center" }} aria-label="Back"><MdArrowBack size={22} /></button>
          <div style={{ flex: 1, background: "#fff", borderRadius: 18, padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#444", border: "1px solid #e5e5e5" }}><MdWarning size={14} color="#c5221f" /> {step.url ?? step.title}</div>
          <MdMoreVert size={20} />
        </div>
        <div style={{ flex: 1 }}>{frame}</div>
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "#fff", display: "flex", flexDirection: "column" }}>
      {step.slot === "modal" ? (
        <div style={{ position: "absolute", inset: 0, background: "#0006", display: "grid", placeItems: "center" }}>
          <div style={{ width: 460, height: 420, background: "#fff", borderRadius: 8, boxShadow: "0 16px 40px #0006", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 32, background: "#f3f3f3", display: "flex", alignItems: "center", padding: "0 10px", fontSize: 12, gap: 8 }}>{step.title}<button onClick={() => onAction("close")} style={{ marginLeft: "auto", background: "none", border: 0 }} aria-label="Close"><MdClose size={16} /></button></div>
            <div style={{ flex: 1 }}>{frame}</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "#fff", borderBottom: "1px solid #e5e5e5", fontFamily: "Inter, sans-serif" }}>
            <button onClick={() => onAction("close")} style={{ background: "none", border: 0 }} aria-label="Back"><MdArrowBack size={18} /></button>
            <div style={{ flex: 1, background: "#f1f3f4", borderRadius: 20, padding: "7px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#c5221f", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><MdLock size={12} /> Not secure</span> {step.url ?? step.title}</div>
          </div>
          <div style={{ flex: 1 }}>{frame}</div>
        </>
      )}
    </div>
  );
}
