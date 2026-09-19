import type { Tactic } from "~/shared/types";
import { ontology } from "./corpus";
import { cfg, features } from "./config";
import { converse } from "./aws";

const RULES: Record<Tactic, RegExp> = {
  AUTHORITY: /\b(police|cbi|cyber ?cell|inspector|officer|rbi|sebi|microsoft|hr\b|customs|warrant|court|fir\b|department|ndps|case number|employee id|recovery department|registered)/i,
  PERSONALISATION: /\b(parcel|courier|flipkart|customs|aadhaar|your son|your daughter|rohan|priya|internship|application|forty applications|loan|march|husband|night shift|supervisor|insurance|your 50,000|1,31,000|group 7)/i,
  FEAR: /\b(arrest|jail|freeze|frozen|blocked|default|legal action|notice|neighbours|lose|blacklist|hackers|at risk|copy your|flag(?:ged)?|lose my job|accomplice)/i,
  ISOLATION: /\b(do not tell|don't tell|not tell anyone|nobody|confidential|secret|sebi rules|stay on the line|stay in the room|do not disconnect|don't disconnect|don't hang|do not hang|obstruction|outside the group|not allowed to see|digital arrest)/i,
  URGENCY: /\b(right now|immediately|minutes?|tonight|today|closes?|last chance|others waiting|hurry|deadline|within the hour|expires|slots? left|thirty minutes|three minutes|every minute)/i,
  CONTROL: /\b(share (?:your|the) screen|screen ?share|anydesk|remote|click accept|keep the camera|camera on|install|allow it|permission|don't touch|do not touch|open your bank|open the link|open the bank)/i,
  PAYMENT_STEERING: /\b(otp|code|read (?:me|it)|six digits|upi|deposit|pay (?:now|it|the)|transfer|tax|processing fee|fee of|send back|forty-five thousand|₹|rupees|temporary .*account|withdraw)/i,
  RECIPROCITY: /\b(refund|overpaid|by mistake|typing mistake|goodwill|we (?:already )?helped|returned|extra money|became|profit|withdrawal in)/i,
};

export interface Tagged { tactics: Tactic[]; quote: string; source: "rules" | "bedrock" }

export function tagByRules(text: string, hookKeywords: string[]): Tagged {
  const tactics: Tactic[] = [];
  for (const [t, re] of Object.entries(RULES) as [Tactic, RegExp][]) if (re.test(text)) tactics.push(t);
  if (!tactics.includes("PERSONALISATION") && hookKeywords.some((k) => text.toLowerCase().includes(k.toLowerCase()))) tactics.push("PERSONALISATION");
  const sentence = text.split(/(?<=[.!?])\s+/).find((s) => tactics.some((t) => RULES[t].test(s))) ?? text;
  return { tactics: tactics.slice(0, 3), quote: sentence.slice(0, 120), source: "rules" };
}

export async function tag(text: string, recent: { speaker: string; text: string }[], hookKeywords: string[]): Promise<Tagged> {
  const rules = tagByRules(text, hookKeywords);
  if (!features().bedrock) return rules;
  const system = `You are the Analyst in a scam-awareness drill. You tag ONE utterance spoken by a (fictional) scammer with the coercion tactics it uses. Tactics and meanings:\n${Object.entries(ontology.tactics).map(([k, v]) => `${k}: ${v.hint}`).join("\n")}\nReturn ONLY JSON: {"tactics":[...up to 3 tactic keys...],"quote":"the most coercive short phrase, verbatim, <=100 chars"}. If nothing coercive, return {"tactics":[],"quote":""}. Transcripts may be noisy speech-to-text.`;
  const ctx = recent.slice(-6).map((r) => `${r.speaker}: ${r.text}`).join("\n");
  try {
    const out = await converse({ modelId: cfg.analystModel, system, messages: [{ role: "user", text: `Recent context:\n${ctx}\n\nUtterance to tag (scammer): ${text}` }], maxTokens: 200, temperature: 0 });
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const valid = (json.tactics as string[]).filter((t): t is Tactic => t in ontology.tactics).slice(0, 3);
    return { tactics: valid, quote: (json.quote as string) || rules.quote, source: "bedrock" };
  } catch (e) {
    console.warn("[analyst] bedrock failed, rules used:", (e as Error).message);
    return rules;
  }
}

export function delta(tactics: Tactic[], recentTactics: { tactic: Tactic; ts: number }[], playbookScore: number, now = Date.now()): number {
  let sum = 0;
  for (const t of tactics) {
    let d = ontology.tactics[t].delta;
    if (recentTactics.some((r) => r.tactic === t && now - r.ts < 60_000)) d *= ontology.escalationMultiplier;
    sum += d;
  }
  if (playbookScore > 0.9) sum *= ontology.playbookMultiplier;
  return Math.round(sum);
}
