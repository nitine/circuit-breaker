import type { DrillSummary, Move, Signal, Utterance, LadderStep, Ending } from "~/shared/types";
import { cfg } from "./config";
import { ddb } from "./aws";

export interface DrillRecord {
  summary: DrillSummary;
  utterances: Utterance[];
  moves: Move[];
  signals: Signal[];
  ladderSteps: LadderStep[];
  trip?: { ts: number; index: number };
  packet?: { md: string; url?: string; status: "pending" | "ready" | "none" };
  leaked: string[];
  ending?: Ending;
}

// Held on globalThis so every module graph in the process (Start SSR env, Nitro server env) shares one store.
const g = globalThis as unknown as { __cbRecords?: Map<string, DrillRecord>; __cbCreated?: number; __cbSweep?: boolean };
const records: Map<string, DrillRecord> = (g.__cbRecords ??= new Map());

export function drillCount() { return g.__cbCreated ?? 0; }
export function put(rec: DrillRecord) { records.set(rec.summary.id, rec); g.__cbCreated = (g.__cbCreated ?? 0) + 1; void persist(rec); }
export function get(id: string) { return records.get(id); }
export function all() { return [...records.values()]; }

let persistTimers = new Map<string, NodeJS.Timeout>();
export function touch(rec: DrillRecord) {
  if (!cfg.ddbTable) return;
  const t = persistTimers.get(rec.summary.id);
  if (t) clearTimeout(t);
  persistTimers.set(rec.summary.id, setTimeout(() => void persist(rec), 1500));
}

export async function persist(rec: DrillRecord) {
  if (!cfg.ddbTable) return;
  try {
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    const client = await ddb();
    await client.send(new PutCommand({
      TableName: cfg.ddbTable,
      Item: {
        pk: rec.summary.id, sk: "DRILL",
        ttl: Math.floor(Date.now() / 1000) + 24 * 3600,
        data: JSON.stringify(rec),
        updatedAt: Date.now(),
      },
    }));
  } catch (e) {
    console.warn("[store] persist failed", (e as Error).message);
  }
}

export async function load(id: string): Promise<DrillRecord | undefined> {
  const local = records.get(id);
  if (local || !cfg.ddbTable) return local;
  try {
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const client = await ddb();
    const out = await client.send(new GetCommand({ TableName: cfg.ddbTable, Key: { pk: id, sk: "DRILL" } }));
    if (out.Item?.data) {
      const rec = JSON.parse(out.Item.data as string) as DrillRecord;
      records.set(id, rec);
      return rec;
    }
  } catch (e) {
    console.warn("[store] load failed", (e as Error).message);
  }
  return undefined;
}

// Sweep in-memory records older than 24h (once per process)
if (!g.__cbSweep) {
  g.__cbSweep = true;
  setInterval(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const [id, r] of records) if (r.summary.createdAt < cutoff) records.delete(id);
  }, 10 * 60 * 1000).unref?.();
}
