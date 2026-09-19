import type { AgentName } from "~/shared/types";
import { SCENE } from "./scene";

export const W = SCENE.w;
export const H = SCENE.h;
export const HOME = SCENE.home;
export const SPOT = SCENE.spots;
export const OBJ = SCENE.objects;

export const AGENT_LABEL: Record<AgentName, string> = { listener: "Listener", analyst: "Analyst", archivist: "Archivist", guardian: "Guardian", reporter: "Reporter" };
export const AGENT_SERVICE: Record<AgentName, string> = {
  listener: "Amazon Transcribe streaming",
  analyst: "Amazon Bedrock · Claude + Guardrails",
  archivist: "Playbook match over the corpus (in-process)",
  guardian: "Escalation ladder · Polly speaks the family line",
  reporter: "Strands agent on Lambda · Step Functions · S3",
};
