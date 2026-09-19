import type { CreateDrillBody, Debrief, DrillSummary } from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) { let msg = res.statusText; try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ } throw new Error(msg); }
  return res.json() as Promise<T>;
}
export const api = {
  catalog: () => fetch("/api/catalog").then((r) => j<Catalog>(r)),
  createDrill: (body: CreateDrillBody) => fetch("/api/drills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => j<DrillSummary>(r)),
  drill: (id: string) => fetch(`/api/drills/${id}`).then((r) => j<DrillSummary>(r)),
  debrief: (id: string) => fetch(`/api/drills/${id}/debrief`).then((r) => j<Debrief>(r)),
  end: (id: string) => fetch(`/api/drills/${id}/end`, { method: "POST" }).then((r) => j<DrillSummary>(r)),
};
export interface Catalog {
  personas: { id: string; name: string; age: number; blurb: string; defaultFamily: string; sprite: string; guardian: { name: string; relation: string; label: string } }[];
  families: { id: string; label: string; device: "phone" | "laptop"; channel: string }[];
  tactics: Record<string, { delta: number; label: string; hint: string }>;
  mode: "aws" | "local";
  features: { transcribe: boolean; polly: boolean; bedrock: boolean };
}
