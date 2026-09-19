import { useEffect, useRef } from "react";
import type { AgentName } from "~/shared/types";
import { W, H, OBJ, HOME, WALK_Y } from "./layout";
import { drawSprite, PALETTES } from "./sprites";
import { sim, useRoom, IDLE_BUBBLES, enqueue } from "./roomStore";

const ORDER: AgentName[] = ["archivist", "guardian", "reporter", "analyst", "listener"];

export function RoomCanvas({ interactiveHover, onHover }: { interactiveHover?: boolean; onHover?: (obj: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    let last = performance.now();
    let idleTimer = 0;
    let idleIdx = 0;
    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      sim.t += dt;
      step(dt);
      // attract chatter
      const st = useRoom.getState();
      if (st.mode === "attract" || st.mode === "dimmed" || st.mode === "file") {
        idleTimer += dt;
        if (idleTimer > 4500) {
          idleTimer = 0;
          if (st.mode === "attract") {
            const [a, text] = IDLE_BUBBLES[idleIdx++ % IDLE_BUBBLES.length];
            st.bubble(a, text, false, 3500);
            if (Math.random() < 0.6) { const ag = sim.agents[a]; enqueue(a, { kind: "go", x: Math.max(24, Math.min(360, HOME[a] + (Math.random() * 60 - 30))) }, { kind: "act", ms: 600 }, { kind: "home" }); void ag; }
          }
        }
      }
      draw(ctx, hoverRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!interactiveHover) return;
    const canvas = ref.current!;
    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * W; const y = ((ev.clientY - r.top) / r.height) * H;
      const hit = hitTest(x, y);
      if (hit !== hoverRef.current) { hoverRef.current = hit; onHover?.(hit); }
    };
    const onLeave = () => { hoverRef.current = null; onHover?.(null); };
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("mouseleave", onLeave);
    return () => { canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); };
  }, [interactiveHover, onHover]);

  return <canvas ref={ref} className="room-canvas pixel" width={W} height={H} style={{ cursor: interactiveHover ? "pointer" : "default" }} />;
}

export function hitTest(x: number, y: number): string | null {
  const boxes: [string, { x: number; y: number; w: number; h: number }][] = [
    ["gauge", OBJ.gauge], ["board", OBJ.board], ["crt", OBJ.crt], ["lever", OBJ.lever], ["cabinet", OBJ.cabinet], ["booth", OBJ.booth],
    ["listenerDesk", OBJ.listenerDesk], ["printer", OBJ.printer], ["desk", { x: OBJ.desk.x, y: OBJ.desk.y - 6, w: OBJ.desk.w, h: OBJ.desk.h + 6 }],
  ];
  for (const [k, b] of boxes) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  for (const a of ORDER) { const ag = sim.agents[a]; if (Math.abs(x - ag.x) <= 6 && y >= ag.y - 16 && y <= ag.y) return a; }
  return null;
}

function step(dt: number) {
  const now = Date.now();
  const speed = 0.045 * dt; // px per ms at internal res
  for (const name of ORDER) {
    const a = sim.agents[name];
    if (a.actUntil > now && a.pose !== "walk") { a.pose = "act"; }
    else if (a.pose === "act" && a.actUntil <= now) a.pose = "idle";
    const task = a.queue[0];
    if (task) {
      if (task.kind === "go" || task.kind === "home") {
        const tx = task.kind === "home" ? HOME[name] : task.x;
        a.targetX = tx;
        const d = tx - a.x;
        if (Math.abs(d) <= speed) { a.x = tx; a.queue.shift(); a.pose = "idle"; }
        else { a.x += Math.sign(d) * speed; a.facing = d > 0 ? 1 : -1; a.pose = "walk"; a.frame += dt; }
      } else if (task.kind === "act") {
        if (!(task as { started?: number }).started) { (task as { started?: number }).started = now; a.actUntil = now + task.ms; a.pose = "act"; }
        if (now - (task as { started?: number }).started! >= task.ms) { a.queue.shift(); a.pose = "idle"; }
      }
    }
  }
  const target = useRoom.getState().index;
  sim.needle += (target - sim.needle) * Math.min(1, dt / 400);
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

function draw(ctx: CanvasRenderingContext2D, hover: string | null) {
  const st = useRoom.getState();
  const exploded = st.mode === "exploded";
  const dimOthers = exploded && hover;
  const t = sim.t;
  // wall
  px(ctx, 0, 0, W, 122, "#e3d3b0");
  for (let y = 0; y < 122; y += 10) px(ctx, 0, y, W, 1, "#d8c7a2");
  px(ctx, 0, 100, W, 18, "#b89b72");
  px(ctx, 0, 118, W, 4, "#6e4a2a");
  // floor
  px(ctx, 0, 122, W, H - 122, "#a66e3a");
  for (let y = 122; y < H; y += 12) px(ctx, 0, y, W, 1, "#8a5a2e");
  for (let i = 0; i < 12; i++) { const x = (i * 37 + Math.floor((i % 3) * 11)) % W; px(ctx, x, 128 + ((i * 29) % 80), 1, 10, "#8a5a2e"); }
  // rug under the victim desk
  px(ctx, 0, 180, 96, 36, "#7a3b2a"); px(ctx, 2, 182, 92, 32, "#93483a"); for (let x = 6; x < 92; x += 8) px(ctx, x, 196, 4, 2, "#7a3b2a");

  const alpha = (key: string) => (dimOthers && hover !== key ? 0.35 : 1);
  const withAlpha = (key: string, fn: () => void) => { ctx.globalAlpha = alpha(key); fn(); ctx.globalAlpha = 1; };

  // gauge
  withAlpha("gauge", () => {
    const g = OBJ.gauge; const cx = g.x + g.w / 2, cy = g.y + g.h / 2, r = g.w / 2;
    px(ctx, g.x - 3, g.y - 3, g.w + 6, g.h + 6, "#3b2a1a");
    ctx.fillStyle = "#f4ecd8"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7a4a1a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
    // arc zones: -210deg .. 30deg
    const a0 = Math.PI * 7 / 6, a1 = Math.PI * 1 / 6;
    const seg = (from: number, to: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, r - 6, from, to); ctx.stroke(); };
    const ang = (v: number) => a0 + (a1 + Math.PI * 2 - a0) * (v / 100);
    seg(ang(0), ang(40), "#8fbf8f"); seg(ang(40), ang(70), "#f0b27a"); seg(ang(70), ang(100), "#e4572e");
    const na = ang(Math.max(0, Math.min(100, sim.needle)));
    ctx.strokeStyle = "#1a1410"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (r - 8), cy + Math.sin(na) * (r - 8)); ctx.stroke();
    px(ctx, cx - 2, cy - 2, 4, 4, "#e4572e");
    if (st.ladder === "warn" || st.ladder === "nudge") { if (Math.floor(t / 300) % 2 === 0) px(ctx, g.x + g.w - 6, g.y + g.h - 2, 5, 5, st.ladder === "nudge" ? "#e4572e" : "#f0b27a"); }
  });
  // cork board
  withAlpha("board", () => {
    const b = OBJ.board;
    px(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, "#7a4a1a"); px(ctx, b.x, b.y, b.w, b.h, "#c9a16a");
    for (let i = 0; i < 40; i++) px(ctx, b.x + ((i * 17) % b.w), b.y + ((i * 23) % b.h), 1, 1, "#b58b5a");
    st.cards.forEach((c, i) => {
      const col = i % 6, row = Math.floor(i / 6) % 3;
      const x = b.x + 5 + col * 15 + (row % 2) * 2, y = b.y + 6 + row * 20 + (col % 2);
      const age = Date.now() - c.ts; const drop = age < 350 ? Math.round((1 - age / 350) * -6) : 0;
      px(ctx, x, y + drop, 12, 15, "#fff6d5"); px(ctx, x + 1, y + 3 + drop, 10, 1, "#d9c9a8"); px(ctx, x + 1, y + 6 + drop, 8, 1, "#d9c9a8"); px(ctx, x + 1, y + 9 + drop, 9, 1, "#d9c9a8");
      const hot = c.tactics.includes("PAYMENT_STEERING") || c.tactics.includes("ISOLATION");
      px(ctx, x + 5, y - 1 + drop, 2, 2, hot ? "#e4572e" : "#3b6fd1");
    });
  });
  // CRT
  withAlpha("crt", () => {
    const c = OBJ.crt;
    px(ctx, c.x - 4, c.y - 4, c.w + 8, c.h + 8, "#3a4a3a"); px(ctx, c.x, c.y, c.w, c.h, "#0f2a16");
    for (let y = c.y; y < c.y + c.h; y += 2) px(ctx, c.x, y, c.w, 1, "#0c2312");
    px(ctx, c.x + c.w / 2 - 8, c.y + c.h + 4, 16, 6, "#2a3a2a"); px(ctx, c.x + c.w / 2 - 14, c.y + c.h + 10, 28, 2, "#2a3a2a");
    if (!st.crt.length) { const blink = Math.floor(t / 500) % 2; if (blink) px(ctx, c.x + 4, c.y + 4, 3, 5, "#7fd08a"); }
  });
  // lever
  withAlpha("lever", () => {
    const l = OBJ.lever; px(ctx, l.x - 2, l.y - 2, l.w + 4, l.h + 4, "#2b2b2b"); px(ctx, l.x, l.y, l.w, l.h, "#555"); px(ctx, l.x + l.w / 2 - 2, l.y + 6, 4, l.h - 12, "#111");
    const knobY = sim.leverDown ? l.y + l.h - 12 : l.y + 6;
    px(ctx, l.x + l.w / 2 - 4, knobY, 8, 6, "#e4572e"); px(ctx, l.x + l.w / 2 - 3, knobY + 1, 6, 2, "#ff8a65");
    px(ctx, l.x + 3, l.y + l.h - 5, 4, 3, sim.leverDown ? "#e4572e" : "#1db954");
    if (sim.leverDown && Math.floor(t / 250) % 2 === 0) px(ctx, l.x + l.w - 7, l.y + l.h - 5, 4, 3, "#e4572e");
  });
  // filing cabinet
  withAlpha("cabinet", () => {
    const c = OBJ.cabinet; px(ctx, c.x, c.y, c.w, c.h, "#b58b5a"); px(ctx, c.x, c.y, c.w, 2, "#7a4a1a");
    for (let i = 0; i < 4; i++) { const y = c.y + 4 + i * 16; const open = st.drawerOpen && Date.now() < st.cabinetUntil && i === 1 ? 6 : 0; px(ctx, c.x + 3 - open, y, c.w - 6 + open, 12, "#a67c4a"); px(ctx, c.x + c.w / 2 - 3 - open, y + 5, 6, 2, "#3b2a1a"); }
  });
  // phone booth
  withAlpha("booth", () => {
    const b = OBJ.booth; px(ctx, b.x, b.y, b.w, b.h, "#7a4a1a"); px(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, "#5b3a1a"); px(ctx, b.x + 6, b.y + 6, b.w - 12, 34, "#9fc5e8"); px(ctx, b.x + 8, b.y + 8, 6, 30, "#c6e0f5");
    px(ctx, b.x + b.w / 2 - 5, b.y + 48, 10, 14, "#1a1a1a"); if (st.familyOnLine) { px(ctx, b.x + b.w / 2 + 6, b.y + 44, 3, 12, "#1a1a1a"); px(ctx, b.x + b.w / 2 - 2, b.y + 46, 2, 2, "#1db954"); } else px(ctx, b.x + b.w / 2 - 3, b.y + 46, 6, 3, "#1a1a1a");
  });
  // listener desk with reel recorder
  withAlpha("listenerDesk", () => {
    const d = OBJ.listenerDesk; px(ctx, d.x, d.y, d.w, d.h, "#7a4a1a"); px(ctx, d.x + 2, d.y + 2, d.w - 4, 4, "#8f5a26");
    px(ctx, d.x + 8, d.y - 12, 30, 12, "#3b2f25"); const spin = Math.floor(t / 120) % 4;
    for (const rx of [d.x + 14, d.x + 32]) { px(ctx, rx - 4, d.y - 10, 8, 8, "#8a7a62"); px(ctx, rx - 1 + (spin % 2), d.y - 7 + Math.floor(spin / 2), 2, 2, "#3b2f25"); }
    px(ctx, d.x + 20, d.y - 14, 6, 3, "#8a7a62");
    px(ctx, d.x + 44, d.y - 6, 5, 6, "#fff"); px(ctx, d.x + 46, d.y - 8, 2, 2, "#fff");
  });
  // printer
  withAlpha("printer", () => {
    const p = OBJ.printer; px(ctx, p.x, p.y + 6, p.w, p.h, "#7a4a1a"); px(ctx, p.x + 6, p.y - 8, 30, 14, "#cfcfcf"); px(ctx, p.x + 8, p.y - 6, 26, 3, "#9a9a9a");
    const pct = st.packetPercent; if (pct > 0) { const h = Math.round((pct / 100) * 10); px(ctx, p.x + 12, p.y - 8 - h, 18, h, "#fff6d5"); }
    if (pct > 0 && pct < 100 && Math.floor(t / 200) % 2) px(ctx, p.x + 32, p.y - 5, 2, 2, "#1db954");
  });
  // plant
  withAlpha("plant", () => { const p = OBJ.plant; px(ctx, p.x + 4, p.y + 18, 8, 10, "#b5573a"); px(ctx, p.x + 2, p.y + 6, 12, 12, "#2e8b57"); px(ctx, p.x, p.y + 2, 6, 8, "#3cb371"); px(ctx, p.x + 10, p.y, 6, 8, "#3cb371"); });
  // agents
  for (const name of ORDER) {
    const a = sim.agents[name];
    ctx.globalAlpha = dimOthers && hover !== name ? 0.35 : 1;
    const walkFrame = a.pose === "walk" ? (Math.floor(a.frame / 140) % 2 === 0 ? "walk" : "idle") : a.pose;
    const bob = a.pose === "walk" ? (Math.floor(a.frame / 140) % 2) : (Math.floor(t / 600) % 2 === 0 ? 0 : 0);
    drawSprite(ctx, PALETTES[name], Math.round(a.x), a.y, walkFrame, a.facing, bob, name);
    ctx.globalAlpha = 1;
    px(ctx, Math.round(a.x) - 5, a.y, 10, 1, "#00000033");
  }
  // victim desk (foreground)
  withAlpha("desk", () => {
    const d = OBJ.desk; px(ctx, d.x, d.y, d.w, d.h, "#8f5a26"); px(ctx, d.x + 2, d.y + 2, d.w - 4, 5, "#a66e3a"); px(ctx, d.x + 4, d.y + d.h, 4, 6, "#6e4a2a"); px(ctx, d.x + d.w - 8, d.y + d.h, 4, 6, "#6e4a2a");
    px(ctx, d.x + 54, d.y + 4, 12, 8, "#fff6d5"); px(ctx, d.x + 56, d.y + 6, 8, 1, "#d9c9a8");
    if (!st.phoneLifted) {
      const p = OBJ.phone;
      if (st.device === "laptop") { px(ctx, p.x - 6, p.y - 2, 22, 14, "#2a2a2a"); px(ctx, p.x - 4, p.y, 18, 10, "#1e88e5"); px(ctx, p.x - 8, p.y + 12, 26, 2, "#3a3a3a"); }
      else { px(ctx, p.x, p.y, p.w, p.h, "#111"); px(ctx, p.x + 1, p.y + 1, p.w - 2, p.h - 3, st.phoneRinging ? "#e8f5e9" : "#2d6cdf"); }
      if (st.phoneRinging) { const k = Math.floor(t / 180) % 3; ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 10 + k * 4, 0, Math.PI * 2); ctx.stroke(); }
    } else { ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 1; ctx.strokeRect(OBJ.phone.x - 0.5, OBJ.phone.y - 0.5, OBJ.phone.w + 1, OBJ.phone.h + 1); }
  });
  if (exploded && hover) { const key = hover; const box = (OBJ as Record<string, { x: number; y: number; w: number; h: number }>)[key]; if (box) { ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 2; ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8); } }
}
