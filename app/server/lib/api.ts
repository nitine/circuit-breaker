import { nanoid } from "nanoid";
import type { CreateDrillBody, Debrief, DrillSummary, FamilyId } from "~/shared/types";
import { families, familyIds, personas, catalog, ontology } from "./corpus";
import { buildWorld } from "./world";
import { cfg, features } from "./config";
import * as store from "./store";
import { buildPacketMarkdown } from "./reporter";
import { sttMode } from "./listener";
import { provider } from "./llm";

export { catalog };

export async function createDrill(body: CreateDrillBody): Promise<DrillSummary> {
  if (store.drillCount() >= cfg.drillCap) throw new Error("Drill cap reached for this deployment.");
  const persona = body.personaId ? personas.find((p) => p.id === body.personaId) ?? null : null;
  let familyId: FamilyId = body.family === "surprise"
    ? familyIds[Math.floor(Math.random() * familyIds.length)]
    : (body.family as FamilyId);
  if (!families[familyId]) familyId = persona?.defaultFamily ?? "digital-arrest";
  const fam = families[familyId];
  const device = body.device && body.device !== "auto" ? body.device : fam.device;
  const world = await buildWorld(persona, body.personaText, fam);
  world.language = body.language === "hi" ? "hi" : "en";
  const summary: DrillSummary = {
    id: nanoid(10),
    personaId: persona?.id ?? "custom",
    personaName: world.personaName,
    family: familyId,
    familyLabel: fam.label,
    device,
    channel: fam.channel,
    hardMode: Boolean(body.hardMode),
    language: body.language === "hi" ? "hi" : "en",
    createdAt: Date.now(),
    index: 0,
    ladder: "armed",
    caller: fam.caller,
    members: fam.members,
    world,
    awsMode: cfg.isAws,
    features: { ...features(), stt: sttMode(body.language === "hi" ? "hi-IN" : "en-IN"), llm: await provider() },
  };
  store.put({ summary, utterances: [], moves: [], signals: [], ladderSteps: [], uiSteps: [], leaked: [] });
  return summary;
}

export async function getDrill(id: string) { return (await store.load(id))?.summary; }

export async function getDebrief(id: string): Promise<Debrief | undefined> {
  const rec = await store.load(id);
  if (!rec) return undefined;
  if (rec.packet?.status === "pending") {
    const fresh = await store.reload(id);
    if (fresh?.packet?.status === "ready") rec.packet = fresh.packet;
    else if (Date.now() - (rec.summary.endedAt ?? rec.summary.createdAt) > 180_000) rec.packet = { ...rec.packet, url: `/api/drills/${id}/packet`, status: "ready" }; // Lambda never answered; serve the in-process packet
  }
  const d = rec.summary; const t0 = d.startedAt ?? d.createdAt;
  const durationSec = Math.round(((d.endedAt ?? Date.now()) - t0) / 1000);
  const stickers: string[] = [];
  if (!rec.leaked.some((l) => l.startsWith("OTP"))) stickers.push("🛡 kept the OTP");
  if (!rec.signals.some((s) => s.kind === "share_accepted" || s.kind === "remote_accepted")) stickers.push("📵 no screen share");
  if (rec.utterances.some((u) => u.stance === "resist")) stickers.push("🗣 pushed back");
  if (rec.uiSteps?.some((s) => s.action === "close")) stickers.push("🚪 closed their page");
  if (rec.ending === "A") stickers.push("🚪 got out early");
  const atRisk = d.world.bank.balance;
  return {
    drill: d, utterances: rec.utterances, moves: rec.moves, signals: rec.signals, ladder: rec.ladderSteps, trip: rec.trip, reactions: rec.utterances.filter((u) => u.kind?.startsWith("reaction")).length, uiSteps: rec.uiSteps ?? [],
    packetUrl: rec.packet?.url, packetStatus: rec.packet?.status ?? "none",
    durationSec, averageVictimSec: ontology.averageVictimSeconds, leaked: rec.leaked, stickers, atRisk,
  };
}

export async function getPacket(id: string) {
  const rec = await store.load(id);
  if (!rec) return undefined;
  return rec.packet?.md ?? buildPacketMarkdown(rec);
}

export async function endDrill(id: string) {
  const rec = await store.load(id);
  if (!rec) return undefined;
  if (!rec.summary.endedAt) { rec.summary.endedAt = Date.now(); rec.ending = rec.ending ?? (rec.trip ? "B" : "A"); rec.summary.ending = rec.ending; store.touch(rec); }
  return rec.summary;
}
