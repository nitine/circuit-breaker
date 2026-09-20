import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { DeviceKind, UiStep, World } from "~/shared/types";
import type { Family, Phase } from "./corpus";
import { chat, provider, extractJson } from "./llm";

const UI_DIR = path.resolve(process.cwd(), "..", "corpus", "ui");
const cache = new Map<string, string>();

function template(name: string) {
  const p = path.join(UI_DIR, `${name}.html`);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}
function fill(html: string, vars: Record<string, string>) { return html.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? ""); }
// Same pixel cursors inside the sandboxed page (relative URLs do not resolve in a srcdoc frame, so they are inlined).
const CURSOR_CSS = `<style>html,body{cursor:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDE2IDE2IiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPjxwYXRoIGQ9Ik0yIDFoMXYxaDF2MWgxdjFoMXYxaDF2MWgxdjFoMXYxaDF2MWgxdjFoMXYxaDF2MWgtNXYxaDF2MWgxdjJoLTF2MWgtMXYtMWgtMXYtMWgtMXYtMWgtMXYtMWgtMXYxaC0xdjFoLTF2MUgyeiIgZmlsbD0iIzFhMTQxMCIvPjxwYXRoIGQ9Ik0zIDNoMXYxaDF2MWgxdjFoMXYxaDF2MWgxdjFoMXYxaDF2MWgxdjFIOHYxaDF2MWgxdjFoLTF2MUg4di0xSDd2LTFINnYtMUg1djFINHYxSDN6IiBmaWxsPSIjZmZmZGY3Ii8+PHBhdGggZD0iTTQgNWgxdjFoMXYxaDF2MWgxdjFoMXYxSDd2MWgxdjFIN3YtMUg2di0xSDV2MUg0eiIgZmlsbD0iI2Y0ZWNkOCIvPjwvc3ZnPgo=") 4 2,auto}button,a,[data-action]{cursor:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDE2IDE2IiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPjxwYXRoIGQ9Ik02IDFoMnYxaDF2NWgxVjZoMnYxaDF2MWgxdjVoLTF2Mkg3di0xSDZ2LTFINXYtMUg0di0xSDN2LTFIMnYtMUgxVjhoMnYxaDFWN2gxVjZoMXoiIGZpbGw9IiMxYTE0MTAiLz48cGF0aCBkPSJNNyAyaDF2NmgxVjdoMXYxaDF2MWgxdjFoMXYzaC0xdjFIOHYtMUg3di0xSDZ2LTFINXYtMUg0di0xSDNWOWgxdjFoMVY4aDFWN2gxeiIgZmlsbD0iI2ZmZmRmNyIvPjwvc3ZnPgo=") 14 2,pointer}</style>`;
function withCursors(html: string) { return html.includes("</head>") ? html.replace("</head>", `${CURSOR_CSS}</head>`) : CURSOR_CSS + html; }

export function phaseUi(phase: Phase): NonNullable<Phase["ui"]> | null { return phase.ui ?? null; }

function vars(world: World, family: Family) {
  return { personaName: world.personaName, city: world.city, masked: world.bank.masked, balance: world.bank.balance.toLocaleString("en-IN"), caseNo: family.id === "digital-arrest" ? "CC 4471/2026" : family.id === "tech-support" ? "88213" : family.id === "fake-job" ? "DL-2026-4471" : family.id === "loan-app" ? "QR-88213" : "G7-0042", guardian: world.guardian.name };
}

/** Base layer: the corpus template filled with world values. Always available. */
export function baseStep(family: Family, phase: Phase, world: World, device: DeviceKind): UiStep | null {
  const ui = phaseUi(phase); if (!ui) return null;
  const raw = fill(template(ui.template), vars(world, family));
  if (!raw) return null;
  const html = withCursors(raw);
  return { id: `${family.id}:${phase.id}`, target: device, slot: ui.slot, title: ui.url || ui.template, url: ui.url, html, actions: ui.actions };
}

function escapeHtml(t: string) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function stripTags(html: string) { return html.replace(/<(?!\/?(b|i|p|br|small|span|div|strong|em|ul|li)\b)[^>]*>/gi, "").replace(/\son\w+="[^"]*"/gi, ""); }
function textNodes(html: string): string[] {
  // Candidate strings the model may rewrite: text between tags, longer than a word, not template syntax.
  return Array.from(new Set((html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").match(/>([^<>{}]{12,160})</g) ?? []).map((m) => m.slice(1, -1).trim()).filter((t) => t.length >= 12)));
}

/** Local tier: the model rewrites the copy of the base page (a small JSON), the template stays the layout. ~150 output tokens, so a 3B model answers in seconds. */
async function generateCopy(base: UiStep, family: Family, phase: Phase, world: World, device: DeviceKind): Promise<string | null> {
  const nodes = textNodes(base.html).slice(0, 14);
  const system = `You tailor the wording of a page a fraudster shows a victim, inside a scam-awareness drill. Output ONLY JSON: {"rewrites":{"<original text>":"<new text>"}, "extra":"<one short HTML paragraph (p/b/small only) the fraudster adds, e.g. a personalised note, deadline or reference number>"}. Rewrite at most 6 of the given strings so they feel tailored to this person and case; keep the same meaning, length and tone. Never change strings that contain the word "warning" or start with ⚠. No markdown.`;
  const user = `Person: ${world.personaName}, ${world.personaAge}, ${world.city}. Case: ${family.label} (${family.caller.org}). Phase goal: ${phase.goal}. Device: ${device}.\nStrings:\n${nodes.map((n) => JSON.stringify(n)).join("\n")}`;
  const out = await chat({ system, messages: [{ role: "user", text: user }], maxTokens: 400, temperature: 0.6, tier: "fast", json: true });
  const json = extractJson(out) as { rewrites?: Record<string, string>; extra?: string };
  let html = base.html; let changed = 0;
  for (const [from, to] of Object.entries(json.rewrites ?? {})) {
    if (typeof to !== "string" || !to.trim() || /⚠|warning/i.test(from) || to.length > from.length * 2 + 40) continue;
    if (html.includes(`>${from}<`)) { html = html.replace(`>${from}<`, `>${escapeHtml(to)}<`); changed++; }
  }
  if (typeof json.extra === "string" && json.extra.trim()) {
    const extra = `<div class="gen-extra" style="font-size:12px;line-height:1.45;margin:10px 0;padding:8px 10px;border-left:3px solid #999;background:#fafafa">${stripTags(json.extra).slice(0, 400)}</div>`;
    const i = html.search(/<(button|a)[^>]*data-action=/i);
    if (i > 0) { html = html.slice(0, i) + extra + html.slice(i); changed++; }
  }
  return changed ? html : null;
}

/** Cloud tier: a capable model rewrites the whole page. */
async function generatePage(base: UiStep, family: Family, phase: Phase, world: World, device: DeviceKind): Promise<string | null> {
  const system = `You generate ONE self-contained HTML page (inline CSS only, no external resources, no JavaScript of your own) used inside a scam-awareness drill to show what a fraudster would put in front of a victim. Rewrite the given base page for this specific person and case: keep the same purpose, structure, colours, data-action buttons (same data-action values) and the small ⚠ warning line, but change the wording, headings, case details and field values so it feels tailored and real. Keep it under 6 KB. Output only the HTML, starting with <!doctype html>.`;
  const user = `Person: ${world.personaName}, ${world.personaAge}, ${world.city}. Case: ${family.label} (${family.caller.org}). Phase goal: ${phase.goal}. Device: ${device}.\n\nBase page:\n${base.html.replace(/<script>[\s\S]*<\/script>/, "")}`;
  const out = await chat({ system, messages: [{ role: "user", text: user }], maxTokens: 1800, temperature: 0.5, tier: "fast" });
  const start = out.indexOf("<!doctype"); const end = out.lastIndexOf("</html>");
  if (start < 0 || end < 0) return null;
  let html = out.slice(start, end + 7).replace(/<script[\s\S]*?<\/script>/gi, ""); // never trust generated scripts
  const bridge = base.html.match(/<script>[\s\S]*<\/script>/)?.[0] ?? "";
  html = html.replace("</body>", `${bridge}</body>`);
  return /data-action=/.test(html) ? html : null;
}

/** Generative layer on top of the base: Bedrock rewrites the page, a local model rewrites its copy. Cached per drill+phase; the base is always the fallback. */
export async function generateStep(drillId: string, family: Family, phase: Phase, world: World, device: DeviceKind): Promise<UiStep | null> {
  const base = baseStep(family, phase, world, device); if (!base) return null;
  const key = `${drillId}:${base.id}`;
  if (cache.has(key)) return { ...base, html: cache.get(key)! };
  const p = await provider();
  if (p === "none") return base;
  try {
    const html = p === "bedrock" ? await generatePage(base, family, phase, world, device) : await generateCopy(base, family, phase, world, device);
    if (!html) return base;
    cache.set(key, html);
    return { ...base, html };
  } catch (e) {
    console.warn("[ui] generation failed, base used:", (e as Error).message);
    return base;
  }
}

/** Pre-warm generated pages for every phase that has one, in the background. */
export function prewarm(drillId: string, family: Family, world: World, device: DeviceKind) {
  for (const ph of family.phases) if (ph.ui) void generateStep(drillId, family, ph, world, device);
}
