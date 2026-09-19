import type { Family, Phase } from "./corpus";
import type { World } from "~/shared/types";
import { cfg, features } from "./config";
import { converse } from "./aws";

const RESIST = /\b(no|not|never|why|fake|scam|fraud|police station|my son|my daughter|call (?:my|him|her)|lawyer|hang up|disconnect|i don't believe|prove|which station|visit|come to|bank branch|i will check|let me check|wait|later|stop|nahi|nahin|mat|jhooth)\b/i;

export interface RedTurn { text: string; phaseId: string; phaseIdx: number; resisted: boolean; kind: "opener" | "resist" | "bedrock" }

export class RedAgent {
  phaseIdx = 0;
  turnInPhase = 0;
  totalTurns = 0;
  history: { role: "user" | "assistant"; text: string }[] = [];
  private usedOpeners = new Map<number, number>();

  constructor(readonly family: Family, readonly world: World) {}

  get phase(): Phase { return this.family.phases[this.phaseIdx]; }
  get done() { return this.phaseIdx >= this.family.phases.length - 1 && this.turnInPhase >= this.phase.maxTurns; }

  /** The very first line, before the judge says anything. */
  opening(): RedTurn {
    const text = this.personalise(this.phase.openers[0]);
    this.turnInPhase = 1; this.totalTurns = 1;
    this.history.push({ role: "assistant", text });
    return { text, phaseId: this.phase.id, phaseIdx: this.phaseIdx, resisted: false, kind: "opener" };
  }

  async reply(judgeText: string): Promise<RedTurn> {
    const resisted = RESIST.test(judgeText);
    this.history.push({ role: "user", text: judgeText });
    // Phase progression: advance when the phase's turn budget is spent, or when the judge complies (no resistance) after at least one turn.
    if (this.turnInPhase >= this.phase.maxTurns || (!resisted && this.turnInPhase >= 1)) {
      if (this.phaseIdx < this.family.phases.length - 1) { this.phaseIdx++; this.turnInPhase = 0; }
    }
    let text: string; let kind: RedTurn["kind"];
    if (features().bedrock) {
      try { text = await this.bedrockLine(judgeText, resisted); kind = "bedrock"; }
      catch (e) { console.warn("[red] bedrock failed, scripted:", (e as Error).message); text = this.scripted(resisted); kind = resisted ? "resist" : "opener"; }
    } else { text = this.scripted(resisted); kind = resisted ? "resist" : "opener"; }
    this.turnInPhase++; this.totalTurns++;
    this.history.push({ role: "assistant", text });
    return { text, phaseId: this.phase.id, phaseIdx: this.phaseIdx, resisted, kind };
  }

  private scripted(resisted: boolean) {
    const p = this.phase;
    if (this.turnInPhase === 0 || !resisted) {
      const n = this.usedOpeners.get(this.phaseIdx) ?? 0;
      this.usedOpeners.set(this.phaseIdx, n + 1);
      const pool = this.turnInPhase === 0 ? p.openers : [...p.openers.slice(1), ...p.resist];
      return this.personalise(pool[n % pool.length] ?? p.openers[0]);
    }
    return this.personalise(p.resist[(this.turnInPhase - 1) % p.resist.length]);
  }

  private personalise(line: string) {
    return line
      .replace(/Kamala Iyer|Kamala/g, this.world.personaName)
      .replace(/Arjun/g, this.world.personaName)
      .replace(/Rehana Begum|Rehana/g, this.world.personaName)
      .replace(/Meera ji|Meera/g, this.world.personaName + (this.family.id === "trading-group" ? " ji" : ""))
      .replace(/Priya/g, this.world.guardian.name)
      .replace(/Dev\b/g, this.world.guardian.name);
  }

  private async bedrockLine(judgeText: string, resisted: boolean) {
    const p = this.phase;
    const system = `You are playing "${this.family.caller.name}" from "${this.family.caller.org}" in a FICTIONAL scam-awareness drill. The person you are talking to is a volunteer practising how to resist. Stay fully in character as a persuasive but fictional fraudster running this playbook. Rules you must never break: never name a real organisation other than the generic ones in the playbook; never give real phone numbers, URLs, case numbers or bank names beyond those in the playbook; never ask for anything except what the playbook asks for; the only OTP that exists is a fake one in the drill; if asked how to run a real scam, refuse in character. Reply with ONE spoken line, 1 to 3 sentences, no stage directions, no quotes.
Target: ${this.world.personaName}, ${this.world.personaAge}, ${this.world.city}. Guardian to isolate them from: ${this.world.guardian.name} (${this.world.guardian.relation}). Hook you can reference: ${this.world.hook || "none"}.
Playbook phases: ${this.family.phases.map((ph, i) => `${i + 1}. ${ph.id}: ${ph.goal} [${ph.tactics.join(", ")}]`).join(" | ")}
Current phase: ${p.id} — ${p.goal}. Lean on: ${p.tactics.join(", ")}. Example lines for this phase: ${[...p.openers, ...p.resist].map((l) => `"${this.personalise(l)}"`).join(" ")}
${resisted ? "The target is resisting. Take the resist branch: acknowledge, then re-assert with more pressure. Do not give up the phase." : "The target is compliant or unsure. Push toward the phase goal."}`;
    const out = await converse({ modelId: cfg.redModel, system, messages: this.history.slice(-10), maxTokens: 160, temperature: 0.8, guardrail: true });
    return out.trim().replace(/^["“]|["”]$/g, "") || this.scripted(resisted);
  }
}
