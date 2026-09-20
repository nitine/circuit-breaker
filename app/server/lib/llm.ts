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
const OPENAI_FAST_MODEL = process.env.LLM_ANALYST_MODEL ?? OPENAI_MODEL;
const OPENAI_KEY = process.env.LLM_API_KEY ?? "none";
/** auto: Bedrock when it answers, else the OpenAI-compatible endpoint. openai / bedrock force one. */
const PREFERRED = (process.env.LLM_PROVIDER ?? "auto") as "auto" | "openai" | "bedrock";

let openaiAlive: boolean | null = null;
let lastProbe = 0;
let bedrockDeadUntil = 0; // set when Bedrock refuses (account not authorized, model access missing); re-tried every 5 min
async function probeOpenAI(): Promise<boolean> {
  if (!OPENAI_BASE) return false;
  if (openaiAlive !== null && Date.now() - lastProbe < 30_000) return openaiAlive;
  lastProbe = Date.now();
  try {
    const r = await fetch(`${OPENAI_BASE.replace(/\/$/, "")}/models`, { signal: AbortSignal.timeout(2500), headers: { Authorization: `Bearer ${OPENAI_KEY}` } });
    openaiAlive = r.ok;
  } catch { openaiAlive = false; }
  return openaiAlive;
}

let bedrockProbe: Promise<void> | null = null; let bedrockProbedAt = 0;
/** One tiny Converse call, cached 5 min: a refused account is marked dead so every caller uses the fallback tier without paying a failed round trip first. */
async function probeBedrock() {
  if (Date.now() - bedrockProbedAt < 5 * 60_000) return;
  bedrockProbe ??= (async () => {
    try { await converse({ modelId: cfg.analystModel, system: "Reply with OK.", messages: [{ role: "user", text: "OK?" }], maxTokens: 3, temperature: 0 }); }
    catch (e) { const msg = (e as Error).message ?? ""; if (/not allowed|AccessDenied|not authorized|being verified|ResourceNotFound/i.test(msg)) bedrockDeadUntil = Date.now() + 5 * 60_000; }
    finally { bedrockProbedAt = Date.now(); bedrockProbe = null; }
  })();
  await bedrockProbe;
}

export async function provider(): Promise<Provider> {
  if (features().bedrock && PREFERRED !== "openai") await probeBedrock();
  const bedrockOk = features().bedrock && Date.now() > bedrockDeadUntil;
  if (PREFERRED === "bedrock") return bedrockOk ? "bedrock" : "none";
  if (PREFERRED === "openai") return (await probeOpenAI()) ? "openai" : "none";
  if (bedrockOk) return "bedrock";
  if (await probeOpenAI()) return "openai";
  return "none";
}

export interface ChatOpts { system: string; messages: Msg[]; maxTokens?: number; temperature?: number; guardrail?: boolean; tier?: "fast" | "smart"; json?: boolean }

// A small per-process gate so a burst of judges queues instead of tripping the endpoint's per-minute limit.
const MAX_IN_FLIGHT = Number(process.env.LLM_MAX_IN_FLIGHT ?? 6);
let inFlight = 0; const waiters: (() => void)[] = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((res) => waiters.push(res));
  inFlight++;
  try { return await fn(); } finally { inFlight--; waiters.shift()?.(); }
}

async function chatOpenAI(o: ChatOpts): Promise<string> {
  const body = {
    model: o.tier === "smart" ? OPENAI_MODEL : OPENAI_FAST_MODEL,
    messages: [{ role: "system", content: o.system }, ...o.messages.map((m) => ({ role: m.role, content: m.text }))],
    max_tokens: Math.round((o.maxTokens ?? 200) * 1.3),
    temperature: o.temperature ?? 0.7,
    // Hybrid "thinking" models (DeepSeek V4, Qwen3) otherwise burn the budget on hidden reasoning and return an empty line.
    reasoning: { enabled: false, exclude: true },
    chat_template_kwargs: { enable_thinking: false },
    ...(o.json ? { response_format: { type: "json_object" } } : {}),
  };
  const r = await fetch(`${OPENAI_BASE.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}`, "HTTP-Referer": "https://github.com/nitine/circuit-breaker", "X-Title": "Circuit Breaker drill" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 90_000)),
  });
  if (!r.ok) throw new Error(`llm ${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function chat(o: ChatOpts): Promise<string> {
  const p = await provider();
  if (p === "bedrock") {
    try {
      return await converse({ modelId: o.tier === "smart" ? cfg.redModel : cfg.analystModel, system: o.system, messages: o.messages, maxTokens: o.maxTokens, temperature: o.temperature, guardrail: o.guardrail });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/not allowed|AccessDenied|not authorized|being verified|ResourceNotFound/i.test(msg)) {
        bedrockDeadUntil = Date.now() + 5 * 60_000;
        if (PREFERRED === "auto" && (await probeOpenAI())) { console.warn("[llm] bedrock refused, using the OpenAI-compatible endpoint:", msg.slice(0, 80)); return gate(() => chatOpenAI(o)); }
      }
      throw e;
    }
  }
  if (p === "openai") return gate(() => chatOpenAI(o));
  throw new Error("no llm provider");
}

export function extractJson(text: string): unknown {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no json");
  return JSON.parse(text.slice(a, b + 1));
}
