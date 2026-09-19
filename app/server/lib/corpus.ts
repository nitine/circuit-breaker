import ontologyJson from "../../../corpus/ontology.json";
import personasJson from "../../../corpus/personas.json";
import digitalArrest from "../../../corpus/families/digital-arrest.json";
import techSupport from "../../../corpus/families/tech-support.json";
import fakeJob from "../../../corpus/families/fake-job.json";
import loanApp from "../../../corpus/families/loan-app.json";
import tradingGroup from "../../../corpus/families/trading-group.json";
import type { DeviceKind, FamilyId, Tactic, SignalKind, CallerInfo, GroupMember } from "~/shared/types";

export interface Phase {
  id: string; goal: string; tactics: Tactic[]; maxTurns: number;
  openers: string[]; resist: string[]; chorus?: string[];
  hi?: { openers: string[]; resist: string[]; chorus?: string[] };
}
export interface Family {
  id: FamilyId; label: string; device: DeviceKind; channel: string; caller: CallerInfo;
  hookKeywords: string[];
  hookSms: { sender: string; text: string } | null;
  members?: GroupMember[];
  phases: Phase[];
  winConditions: { kind: string; seconds?: number }[];
  notifications: { afterTurn: number; app: string; sender?: string; title: string; body: string; otp?: string; attachment?: string }[];
  loseLine: string; winLine: string;
  hi?: { winLine: string; loseLine: string };
}
export interface Persona {
  id: string; name: string; age: number; blurb: string; context: string;
  defaultFamily: FamilyId; guardian: { name: string; relation: string; label: string };
  language: "en" | "hi" | "kn";
  lines: { guardianNative: string; guardianEn: string };
  sprite: string;
}
export interface Ontology {
  tactics: Record<Tactic, { delta: number; label: string; hint: string }>;
  signals: Record<SignalKind, { delta: number; label: string }>;
  thresholds: { warn: number; nudge: number; trip: number };
  escalationMultiplier: number; playbookMultiplier: number; averageVictimSeconds: number;
}

export const ontology = ontologyJson as unknown as Ontology;
export const personas = personasJson as unknown as Persona[];
export const families: Record<FamilyId, Family> = {
  "digital-arrest": digitalArrest as unknown as Family,
  "tech-support": techSupport as unknown as Family,
  "fake-job": fakeJob as unknown as Family,
  "loan-app": loanApp as unknown as Family,
  "trading-group": tradingGroup as unknown as Family,
};
export const familyIds = Object.keys(families) as FamilyId[];

export function catalog() {
  return {
    personas: personas.map((p) => ({ id: p.id, name: p.name, age: p.age, blurb: p.blurb, defaultFamily: p.defaultFamily, sprite: p.sprite, guardian: p.guardian })),
    families: familyIds.map((id) => ({ id, label: families[id].label, device: families[id].device, channel: families[id].channel })),
    tactics: ontology.tactics,
  };
}
