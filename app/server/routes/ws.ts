import { defineWebSocketHandler } from "nitro";
import type { ClientEvent } from "~/shared/types";
import { DrillSession } from "../lib/session";
import * as store from "../lib/store";

const sessions = new Map<string, DrillSession>();

function drillIdFrom(url: string | undefined) {
  try { return new URL(url ?? "", "http://x").searchParams.get("drill"); } catch { return null; }
}

export default defineWebSocketHandler({
  upgrade(request) {
    return { context: { drillId: drillIdFrom(request.url) } };
  },
  async open(peer) {
    const p = peer as unknown as { context?: { drillId?: string | null }; request?: { url?: string }; url?: string };
    const id = p.context?.drillId ?? drillIdFrom(p.request?.url ?? p.url);
    const rec = id ? await store.load(id) : undefined;
    if (!rec) { peer.send(JSON.stringify({ type: "error", message: "drill not found", seq: 0 })); peer.close(); return; }
    const existing = sessions.get(peer.id);
    existing?.dispose();
    const session = new DrillSession(rec, (e) => { try { peer.send(JSON.stringify(e)); } catch { /* closed */ } });
    sessions.set(peer.id, session);
    session.start();
  },
  message(peer, message) {
    const session = sessions.get(peer.id);
    if (!session) return;
    const raw = message.rawData as unknown;
    const isBinary = raw instanceof ArrayBuffer || ArrayBuffer.isView(raw as ArrayBufferView) || Buffer.isBuffer(raw);
    if (isBinary && !(typeof raw === "string")) {
      const u8 = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array((raw as ArrayBufferView).buffer, (raw as ArrayBufferView).byteOffset, (raw as ArrayBufferView).byteLength);
      // Text frames also arrive as Buffers in Node; sniff JSON.
      if (u8.length && u8[0] === 0x7b) {
        try { void session.handle(JSON.parse(Buffer.from(u8).toString("utf8")) as ClientEvent); return; } catch { /* fallthrough */ }
      }
      session.handleAudio(u8);
      return;
    }
    try { void session.handle(JSON.parse(message.text()) as ClientEvent); } catch { /* ignore */ }
  },
  close(peer) {
    const s = sessions.get(peer.id);
    s?.dispose();
    sessions.delete(peer.id);
  },
});
