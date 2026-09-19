import type { ClientEvent, ServerEvent } from "~/shared/types";
import { useRoom } from "~/room/roomStore";
import { useDrill } from "./drillStore";

export class DrillSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(e: ServerEvent) => void>();
  private lastSeq = 0;
  constructor(readonly drillId: string) {}

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws?drill=${encodeURIComponent(this.drillId)}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => useDrill.getState().set({ connected: true });
    this.ws.onclose = () => useDrill.getState().set({ connected: false });
    this.ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      let e: ServerEvent; try { e = JSON.parse(m.data); } catch { return; }
      if (e.seq && e.seq <= this.lastSeq) return; this.lastSeq = e.seq ?? this.lastSeq;
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
  close() { this.ws?.close(); this.ws = null; }
}
