import type { AgentName } from "~/shared/types";

export const W = 384;
export const H = 216;
export const WALK_Y = 170; // feet baseline

export const HOME: Record<AgentName, number> = { listener: 46, analyst: 142, reporter: 226, guardian: 262, archivist: 312 };
export const SPOT = { board: 118, cabinet: 306, lever: 268, booth: 352, printer: 214, desk: 60, camera: 200 };

export const OBJ = {
  gauge: { x: 14, y: 16, w: 46, h: 46 },
  board: { x: 72, y: 14, w: 96, h: 64 },
  crt: { x: 184, y: 26, w: 60, h: 46 },
  lever: { x: 256, y: 22, w: 24, h: 54 },
  cabinet: { x: 292, y: 52, w: 34, h: 70 },
  booth: { x: 338, y: 30, w: 36, h: 92 },
  listenerDesk: { x: 20, y: 132, w: 52, h: 22 },
  printer: { x: 196, y: 130, w: 42, h: 22 },
  desk: { x: 8, y: 186, w: 74, h: 26 },
  phone: { x: 34, y: 189, w: 9, h: 14 },
  plant: { x: 356, y: 156, w: 16, h: 28 },
};

export const AGENT_LABEL: Record<AgentName, string> = { listener: "Listener", analyst: "Analyst", archivist: "Archivist", guardian: "Guardian", reporter: "Reporter" };
export const AGENT_SERVICE: Record<AgentName, string> = {
  listener: "Amazon Transcribe streaming",
  analyst: "Amazon Bedrock · Claude + Guardrails",
  archivist: "Playbook match over the corpus (in-process)",
  guardian: "Escalation ladder · Polly speaks the family line",
  reporter: "Strands agent on Lambda · Step Functions · S3",
};
