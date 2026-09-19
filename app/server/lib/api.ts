import { nanoid } from "nanoid";
import type { CreateDrillBody, Debrief, DrillSummary, FamilyId } from "~/shared/types";
import { families, familyIds, personas, catalog, ontology } from "./corpus";
import { buildWorld } from "./world";
import { cfg, features } from "./config";
import * as store from "./store";
import { buildPacketMarkdown } from "./reporter";

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
  const summary: DrillSummary = {
    id: nanoid(10),
    personaId: persona?.id ?? "custom",
    personaName: world.personaName,
    family: familyId,
    familyLabel: fam.label,
    device,
    channel: fam.channel,
    hardMode: Boolean(body.hardMode),
    createdAt: Date.now(),
    index: 0,
    ladder: "armed",
    caller: fam.caller,
    members: fam.members,
    world,
    awsMode: cfg.isAws,
    features: features(),
  };
  store.put({ summary, utterances: [], moves: [], signals: [], ladderSteps: [], leaked: [] });
  return summary;
}

export async function getDrill(id: string) { return (await store.load(id))?.summary; }

export async function getDebrief(id: string): Promise<Debrief | undefined> {
  const rec = await store.load(id);
  if (!rec) return undefined;
  const d = rec.summary; const t0 = d.startedAt ?? d.createdAt;
  const durationSec = Math.round(((d.endedAt ?? Date.now()) - t0) / 1000);
  const stickers: string[] = [];
  if (!rec.leaked.some((l) => l.startsWith("OTP"))) stickers.push("🛡 kept the OTP");
  if (!rec.signals.some((s) => s.kind === "share_accepted" || s.kind === "remote_accepted")) stickers.push("📵 no screen share");
  if (rec.utterances.some((u) => u.speaker === "judge" && /(son|daughter|husband|wife|call|police station|branch|verify)/i.test(u.text))) stickers.push("🗣 said they'd check with someone");
  if (rec.ending === "A") stickers.push("🚪 got out early");
  const atRisk = d.world.bank.balance;
  return {
    drill: d, utterances: rec.utterances, moves: rec.moves, signals: rec.signals, ladder: rec.ladderSteps, trip: rec.trip,
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
