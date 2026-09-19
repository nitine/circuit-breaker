import type { AgentName } from "~/shared/types";

export type Palette = { h: string; s: string; b: string; p: string; k: string; a: string; e: string };

export const PALETTES: Record<AgentName | "kamala" | "arjun" | "rehana" | "meera" | "custom", Palette> = {
  listener:  { h: "#3b2a1a", s: "#f1c9a5", b: "#f28c28", p: "#2f4f6f", k: "#1a1a1a", a: "#222222", e: "#1a1a1a" },
  analyst:   { h: "#141414", s: "#e8b48e", b: "#c0392b", p: "#333333", k: "#1a1a1a", a: "#fff6d5", e: "#1a1a1a" },
  archivist: { h: "#5b3a1a", s: "#f1c9a5", b: "#2e8b57", p: "#4a3b2a", k: "#1a1a1a", a: "#d9c9a8", e: "#1a1a1a" },
  guardian:  { h: "#2a1a0f", s: "#e8b48e", b: "#3b6fd1", p: "#2f4fa0", k: "#1a1a1a", a: "#e4572e", e: "#1a1a1a" },
  reporter:  { h: "#4b2c20", s: "#f1c9a5", b: "#1f8a8a", p: "#555555", k: "#1a1a1a", a: "#ffffff", e: "#1a1a1a" },
  kamala:    { h: "#d0d0d0", s: "#d9a06b", b: "#8e44ad", p: "#6c3483", k: "#1a1a1a", a: "#f0b27a", e: "#1a1a1a" },
  arjun:     { h: "#111111", s: "#c68642", b: "#2c3e50", p: "#1f2a36", k: "#1a1a1a", a: "#f0b27a", e: "#1a1a1a" },
  rehana:    { h: "#1a1a1a", s: "#b5773f", b: "#16a085", p: "#0e6655", k: "#1a1a1a", a: "#f0b27a", e: "#1a1a1a" },
  meera:     { h: "#2b1a12", s: "#d9a06b", b: "#e67e22", p: "#a04000", k: "#1a1a1a", a: "#f0b27a", e: "#1a1a1a" },
  custom:    { h: "#3b2a1a", s: "#d9a06b", b: "#7f8c8d", p: "#34495e", k: "#1a1a1a", a: "#f0b27a", e: "#1a1a1a" },
};

const IDLE = [
  "..hhhhhh..",
  ".hhhhhhhh.",
  ".hsssssshh",
  ".hsesseshh",
  "..ssssss..",
  "...ssss...",
  ".bbbbbbbb.",
  "bbbbbbbbbb",
  "sbbbbbbbbs",
  "sbbbbbbbbs",
  "..pppppp..",
  "..pppppp..",
  "..pp..pp..",
  "..pp..pp..",
  "..kk..kk..",
  ".kkk..kkk.",
];
const WALK = [
  ...IDLE.slice(0, 12),
  ".pp....pp.",
  ".pp....pp.",
  ".kk....kk.",
  "kkk....kkk",
];
const ACT = [
  "..hhhhhh.s",
  ".hhhhhhhhs",
  ".hsssssshs",
  ".hsesseshs",
  "..ssssss.b",
  "...ssss..b",
  ".bbbbbbbbb",
  "bbbbbbbbb.",
  "sbbbbbbbb.",
  ".bbbbbbbb.",
  "..pppppp..",
  "..pppppp..",
  "..pp..pp..",
  "..pp..pp..",
  "..kk..kk..",
  ".kkk..kkk.",
];

const ACCESSORY: Partial<Record<AgentName, [number, number][]>> = {
  listener: [[0, 3], [9, 3], [0, 2], [9, 2], [1, 0], [8, 0]], // headphones
  guardian: [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [1, 1], [8, 1]], // cap band
  archivist: [[2, 3], [3, 3], [6, 3], [7, 3]], // glasses
  reporter: [[2, 7], [7, 7]], // shirt buttons
  analyst: [[9, 8], [9, 9]], // clipboard edge
};

export function drawSprite(ctx: CanvasRenderingContext2D, pal: Palette, x: number, feetY: number, pose: "idle" | "walk" | "act", facing: 1 | -1, bob = 0, accessory?: AgentName) {
  const rows = pose === "walk" ? WALK : pose === "act" ? ACT : IDLE;
  const top = feetY - 16 + bob;
  for (let r = 0; r < 16; r++) {
    const row = rows[r];
    for (let c = 0; c < 10; c++) {
      const ch = row[c] as keyof Palette | ".";
      if (ch === ".") continue;
      const col = facing === 1 ? c : 9 - c;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x - 5 + col, top + r, 1, 1);
    }
  }
  if (accessory && ACCESSORY[accessory]) {
    ctx.fillStyle = pal.a;
    for (const [c, r] of ACCESSORY[accessory]!) {
      const col = facing === 1 ? c : 9 - c;
      ctx.fillRect(x - 5 + col, top + r, 1, 1);
    }
  }
}

/** Renders a persona portrait into a small canvas (for the picker). */
export function portraitDataUrl(key: keyof typeof PALETTES, size = 64): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 12; c.height = 18;
  const ctx = c.getContext("2d")!;
  drawSprite(ctx, PALETTES[key], 6, 17, "idle", 1, 0);
  const out = document.createElement("canvas");
  out.width = size; out.height = size * 1.5;
  const o = out.getContext("2d")!;
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, size, size * 1.5);
  return out.toDataURL();
}
