/**
 * One chat interface, three providers:
 *  - bedrock: Claude via the Converse API (AWS mode)
 *  - openai:  any OpenAI-compatible endpoint (llama.cpp server, Ollama, vLLM) for local dynamic conversation
 *  - none:    callers fall back to scripted playbooks and keyword rules
 */
import { cfg, features } from "./config";
import { converse } from "./aws";

export type Msg = { role: "user" | "assistant"; text: string };
export type Provider = "bedrock" | "openai" | "none";

const OPENAI_BASE = process.env.LLM_BASE_URL ?? "";
const OPENAI_MODEL = process.env.LLM_MODEL ?? "local";
const OPENAI_KEY = process.env.LLM_API_KEY ?? "none";

let openaiAlive: boolean | null = null;
let lastProbe = 0;
async function probeOpenAI(): Promise<boolean> {
  if (!OPENAI_BASE) return false;
  if (openaiAlive !== null && Date.now() - lastProbe < 30_000) return openaiAlive;
  lastProbe = Date.now();
  try {
    const r = await fetch(`${OPENAI_BASE.replace(/\/$/, "")}/models`, { signal: AbortSignal.timeout(1500), headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
    openaiAlive = r.ok;
  } catch { openaiAlive = false; }
  return openaiAlive;
}

export async function provider(): Promise<Provider> {
  if (features().bedrock) return "bedrock";
  if (await probeOpenAI()) return "openai";
  return "none";
}

export interface ChatOpts { system: string; messages: Msg[]; maxTokens?: number; temperature?: number; guardrail?: boolean; tier?: "fast" | "smart"; json?: boolean }

export async function chat(o: ChatOpts): Promise<string> {
  const p = await provider();
  if (p === "bedrock") {
    return converse({ modelId: o.tier === "smart" ? cfg.redModel : cfg.analystModel, system: o.system, messages: o.messages, maxTokens: o.maxTokens, temperature: o.temperature, guardrail: o.guardrail });
  }
  if (p === "openai") {
    const body = {
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: o.system }, ...o.messages.map((m) => ({ role: m.role, content: m.text }))],
      max_tokens: o.maxTokens ?? 200,
      temperature: o.temperature ?? 0.7,
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    };
    const r = await fetch(`${OPENAI_BASE.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 90_000)), // local models are slow; the callers all have base fallbacks
    });
    if (!r.ok) throw new Error(`llm ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("no llm provider");
}

export function extractJson(text: string): unknown {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no json");
  return JSON.parse(text.slice(a, b + 1));
}
