import type { ClientEvent, ServerEvent } from "~/shared/types";
import { useRoom } from "~/room/roomStore";
import { useDrill } from "./drillStore";

export class DrillSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(e: ServerEvent) => void>();
  private lastSeq = 0;
  constructor(readonly drillId: string) {}

  private closed = false; private attempts = 0; private timer: ReturnType<typeof setTimeout> | null = null;
  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws?drill=${encodeURIComponent(this.drillId)}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => { this.attempts = 0; useDrill.getState().set({ connected: true }); };
    this.ws.onclose = () => {
      useDrill.getState().set({ connected: false });
      if (this.closed || useDrill.getState().ended) return;
      // The task behind the load balancer rolled, or the network blipped: come back with backoff (1s → 8s) and resume the call.
      const wait = Math.min(8000, 1000 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.connect(), wait);
    };
    this.ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      let e: ServerEvent; try { e = JSON.parse(m.data); } catch { return; }
      if (e.type === "drill.state") { this.lastSeq = 0; if (e.resumed) { useDrill.getState().set({ callState: "active", turn: "yours" }); } }
      else if (e.seq && e.seq <= this.lastSeq) return;
      this.lastSeq = e.seq ?? this.lastSeq;
      useRoom.getState().apply(e);
      useDrill.getState().apply(e);
      for (const l of this.listeners) l(e);
    };
  }
  on(fn: (e: ServerEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  send(e: ClientEvent) {
    if (e.type === "call.answered") useDrill.getState().set({ callState: "active" });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(e));
  }
  sendAudio(buf: ArrayBuffer) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf); }
  close() { this.closed = true; if (this.timer) clearTimeout(this.timer); this.ws?.close(); this.ws = null; }
}
