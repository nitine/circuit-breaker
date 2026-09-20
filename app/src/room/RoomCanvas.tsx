import { useEffect, useRef } from "react";
import type { AgentName } from "~/shared/types";
import { SCENE, type ObjKey } from "./scene";
import { sim, useRoom, IDLE_BUBBLES, enqueue, type Pt } from "./roomStore";

const ORDER: AgentName[] = ["listener", "analyst", "archivist", "guardian", "reporter"];
const W = SCENE.w, H = SCENE.h;

const imgs: { bg?: HTMLImageElement; sprites: Partial<Record<AgentName, HTMLImageElement>>; loaded: boolean } = { sprites: {}, loaded: false };
function load(src: string) { return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function ensureAssets() {
  if (imgs.loaded) return;
  imgs.bg = await load("/room/room.png").catch(() => undefined);
  await Promise.all(ORDER.map(async (a) => { imgs.sprites[a] = await load(`/room/sprites/${a}.png`).catch(() => undefined); }));
  imgs.loaded = true;
}

export function RoomCanvas({ interactiveHover, onHover }: { interactiveHover?: boolean; onHover?: (obj: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let raf = 0, last = performance.now(), idleTimer = 0, idleIdx = 0;
    void ensureAssets();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now; sim.t += dt;
      step(dt);
      const st = useRoom.getState();
      if (st.mode === "live" || st.mode === "tripped") {
        idleTimer += dt;
        if (idleTimer > 7000) {
          idleTimer = 0;
          const pick: [AgentName, Pt, number][] = [["archivist", SCENE.spots.cabinet, 700], ["analyst", SCENE.spots.board, 500], ["reporter", SCENE.spots.printer, 500], ["guardian", SCENE.spots.lever, 600]];
          const [a, to, ms] = pick[Math.floor(Math.random() * pick.length)];
          if (!sim.agents[a].queue.length && Math.random() < 0.75) enqueue(a, { kind: "go", to }, { kind: "act", ms }, { kind: "home" });
        }
      }
      if (st.mode === "attract") {
        idleTimer += dt;
        if (idleTimer > 4500) {
          idleTimer = 0;
          const [a, text] = IDLE_BUBBLES[idleIdx++ % IDLE_BUBBLES.length];
          st.bubble(a, text, false, 3500);
          if (Math.random() < 0.7 && !sim.agents[a].queue.length) {
            const f = SCENE.floor; const to = { x: f.x0 + Math.random() * (f.x1 - f.x0), y: f.y0 + Math.random() * (f.y1 - f.y0) };
            enqueue(a, { kind: "go", to }, { kind: "act", ms: 700 }, { kind: "home" });
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
      const hit = hitTest(((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H);
      if (hit !== hoverRef.current) { hoverRef.current = hit; onHover?.(hit); }
    };
    const onLeave = () => { hoverRef.current = null; onHover?.(null); };
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("mouseleave", onLeave);
    return () => { canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); };
  }, [interactiveHover, onHover]);

  return <canvas ref={ref} className="room-canvas" width={W} height={H} style={{ cursor: interactiveHover ? "pointer" : "default" }} />;
}

export function hitTest(x: number, y: number): string | null {
  for (const a of ORDER) { const ag = sim.agents[a]; const h = SCENE.spriteHeight; if (Math.abs(x - ag.x) <= h * 0.28 && y >= ag.y - h && y <= ag.y) return a; }
  for (const [k, b] of Object.entries(SCENE.objects)) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  return null;
}

function step(dt: number) {
  const now = Date.now(); const speed = 0.16 * dt; // px per ms
  for (const name of ORDER) {
    const a = sim.agents[name];
    if (a.actUntil > now && a.pose !== "walk") a.pose = "act"; else if (a.pose === "act" && a.actUntil <= now) a.pose = "idle";
    const task = a.queue[0];
    if (!task) continue;
    if (task.kind === "go" || task.kind === "home") {
      const to: Pt = task.kind === "home" ? SCENE.home[name] : task.to;
      const dx = to.x - a.x, dy = to.y - a.y; const d = Math.hypot(dx, dy);
      if (d <= speed) { a.x = to.x; a.y = to.y; a.queue.shift(); a.pose = "idle"; }
      else { a.x += (dx / d) * speed; a.y += (dy / d) * speed; if (Math.abs(dx) > 2) a.facing = dx > 0 ? 1 : -1; a.pose = "walk"; a.frame += dt; }
    } else {
      if (!task.started) { task.started = now; a.actUntil = now + task.ms; a.pose = "act"; }
      if (now - task.started >= task.ms) { a.queue.shift(); a.pose = "idle"; }
    }
  }
  sim.needle += (useRoom.getState().index + sim.kick - sim.needle) * Math.min(1, dt / 400);
  sim.kick *= Math.max(0, 1 - dt / 350); // needle overshoots on a hit, then settles
  const cutoff = Date.now() - 1600; sim.pops = sim.pops.filter((p) => p.ts > cutoff);
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function sample(ctx: CanvasRenderingContext2D, x: number, y: number) { const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; }

function draw(ctx: CanvasRenderingContext2D, hover: string | null) {
  const st = useRoom.getState(); const O = SCENE.objects; const t = sim.t;
  const exploded = st.mode === "exploded"; const dimOthers = exploded && hover;
  if (imgs.bg) ctx.drawImage(imgs.bg, 0, 0, W, H); else { px(ctx, 0, 0, W, H, "#2a1d10"); ctx.fillStyle = "#e8e2d6"; ctx.font = "28px monospace"; ctx.fillText("room assets loading…", 40, 60); }

  const alpha = (key: string) => (dimOthers && hover !== key ? 0.35 : 1);
  const withAlpha = (key: string, fn: () => void) => { ctx.globalAlpha = alpha(key); fn(); ctx.globalAlpha = 1; };

  // Gauge: translucent dial over the painted one, with our needle.
  withAlpha("gauge", () => {
    const g = O.gauge; const cx = g.x + g.w / 2, cy = g.y + g.h / 2, r = g.w / 2 - 8;
    ctx.fillStyle = "#f4ecd8cc"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    const a0 = Math.PI * 7 / 6, span = Math.PI * 4 / 3; const ang = (v: number) => a0 + span * (v / 100);
    const seg = (f: number, to: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(cx, cy, r - 9, ang(f), ang(to)); ctx.stroke(); };
    seg(0, 40, "#8fbf8f"); seg(40, 70, "#f0b27a"); seg(70, 100, "#e4572e");
    const na = ang(Math.max(0, Math.min(100, sim.needle)));
    ctx.strokeStyle = "#1a1410"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (r - 16), cy + Math.sin(na) * (r - 16)); ctx.stroke();
    ctx.fillStyle = "#e4572e"; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1410"; ctx.font = "bold 20px monospace"; ctx.textAlign = "center"; ctx.fillText(String(Math.round(sim.needle)), cx, cy + r - 14); ctx.textAlign = "left";
    if (sim.kick > 1) { ctx.strokeStyle = `rgba(228,87,46,${Math.min(0.8, sim.kick / 12)})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke(); }
    if ((st.ladder === "warn" || st.ladder === "nudge") && Math.floor(t / 300) % 2 === 0) { ctx.fillStyle = st.ladder === "nudge" ? "#e4572e" : "#f0b27a"; ctx.beginPath(); ctx.arc(g.x + g.w - 8, g.y + 10, 7, 0, Math.PI * 2); ctx.fill(); }
  });
  // Board: pinned cards on the painted cork.
  withAlpha("board", () => {
    const b = O.board; const cols = 5;
    st.cards.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols) % 3;
      const cw = (b.w - 30) / cols - 6, ch = 40;
      const x = b.x + 18 + col * (cw + 6) + (row % 2) * 3, y = b.y + 26 + row * (ch + 14) + (col % 2) * 2;
      const age = Date.now() - c.ts; const drop = age < 0 ? -40 : age < 350 ? Math.round((1 - age / 350) * -14) : 0;
      if (age < 0) return;
      ctx.save(); ctx.translate(x + cw / 2, y + ch / 2 + drop); ctx.rotate(((i % 3) - 1) * 0.06); ctx.translate(-cw / 2, -ch / 2);
      px(ctx, 2, 3, cw, ch, "#00000033"); px(ctx, 0, 0, cw, ch, "#fff6d5");
      px(ctx, 5, 12, cw - 10, 2, "#d9c9a8"); px(ctx, 5, 20, cw - 16, 2, "#d9c9a8"); px(ctx, 5, 28, cw - 12, 2, "#d9c9a8");
      ctx.fillStyle = "#6b5636"; ctx.font = "bold 9px monospace"; ctx.fillText(c.tactics[0]?.slice(0, 9) ?? "", 5, 9);
      const hot = c.tactics.includes("PAYMENT_STEERING") || c.tactics.includes("ISOLATION");
      ctx.fillStyle = hot ? "#e4572e" : "#3b6fd1"; ctx.beginPath(); ctx.arc(cw / 2, -1, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  });
  // Lever: patch over the painted handle, then draw ours in the right position.
  withAlpha("lever", () => {
    const l = O.lever;
    // The painted plate: inner slot region is drawn fresh so the knob can move.
    const ix = l.x + l.w * 0.27, iw = l.w * 0.46, iy = l.y + l.h * 0.12, ih = l.h * 0.76;
    px(ctx, ix, iy, iw, ih, "#4a4a4a"); px(ctx, ix + iw * 0.35, iy + 6, iw * 0.3, ih - 12, "#151515");
    const knobH = 18; const knobY = sim.leverDown ? iy + ih - knobH - 6 : iy + 6;
    px(ctx, ix + 2, knobY, iw - 4, knobH, "#e4572e"); px(ctx, ix + 4, knobY + 3, iw - 8, 5, "#ff8a65"); px(ctx, ix + 2, knobY + knobH - 3, iw - 4, 3, "#a83a1e");
    if (st.ladder === "nudge" && !sim.leverDown) { ctx.strokeStyle = `rgba(255,138,101,${0.4 + 0.4 * Math.abs(Math.sin(t / 250))})`; ctx.lineWidth = 5; ctx.strokeRect(ix - 6, iy - 6, iw + 12, ih + 12); }
    ctx.fillStyle = sim.leverDown ? "#e4572e" : "#1db954"; ctx.beginPath(); ctx.arc(l.x + l.w * 0.15, l.y + l.h - 10, 4, 0, Math.PI * 2); ctx.fill();
    if (sim.leverDown && Math.floor(t / 250) % 2 === 0) { ctx.fillStyle = "#e4572e"; ctx.beginPath(); ctx.arc(l.x + l.w * 0.85, l.y + l.h - 10, 4, 0, Math.PI * 2); ctx.fill(); }
  });
  // Cabinet: a drawer slides out while the Archivist works.
  withAlpha("cabinet", () => { if (st.drawerOpen && Date.now() < st.cabinetUntil) { const c = O.cabinet; px(ctx, c.x + 18, c.y + c.h * 0.42, c.w - 36, 26, "#a67c4a"); px(ctx, c.x + 18, c.y + c.h * 0.42, c.w - 36, 4, "#7a4a1a"); px(ctx, c.x + c.w / 2 - 20, c.y + c.h * 0.42 + 8, 40, 14, "#fff6d5"); } });
  // Booth: phone off the hook when family is on the line.
  withAlpha("booth", () => { if (st.familyOnLine) { const b = O.booth; ctx.fillStyle = "#1db954"; ctx.beginPath(); ctx.arc(b.x + b.w - 14, b.y + 20, 7, 0, Math.PI * 2); ctx.fill(); } });
  // Printer: pages rising.
  withAlpha("printer", () => { const p = O.printer; const pct = st.packetPercent; if (pct > 0) { const h = Math.round((pct / 100) * 36); px(ctx, p.x + p.w * 0.35, p.y + 24 - h, p.w * 0.3, h, "#fff6d5"); px(ctx, p.x + p.w * 0.35, p.y + 24 - h, p.w * 0.3, 2, "#d9c9a8"); } if (pct > 0 && pct < 100 && Math.floor(t / 200) % 2) { ctx.fillStyle = "#1db954"; ctx.beginPath(); ctx.arc(p.x + p.w - 16, p.y + 40, 5, 0, Math.PI * 2); ctx.fill(); } });
  // Phone on the desk: glow while ringing, patch when lifted.
  withAlpha("desk", () => {
    const p = O.phone;
    if (st.phoneLifted && imgs.bg) { const c = sample(ctx, p.x - 12, p.y + p.h + 8); px(ctx, p.x - 6, p.y - 6, p.w + 12, p.h + 12, c); ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(p.x - 2, p.y - 2, p.w + 4, p.h + 4); ctx.setLineDash([]); }
    if (st.phoneRinging && !st.phoneLifted) { const k = Math.floor(t / 180) % 3; ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 30 + k * 12, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#ffffffaa"; ctx.fillRect(p.x, p.y, p.w, p.h); }
  });
  // Pulse ring on the object a signal came from (your desk, the listening desk).
  if (st.pulse && Date.now() < st.pulse.until) {
    const b = (SCENE.objects as Record<string, { x: number; y: number; w: number; h: number }>)[st.pulse.key];
    if (b) { const k = ((st.pulse.until - Date.now()) % 700) / 700; ctx.strokeStyle = `rgba(240,178,122,${0.9 - k * 0.8})`; ctx.lineWidth = 4; ctx.strokeRect(b.x - 6 - k * 14, b.y - 6 - k * 14, b.w + 12 + k * 28, b.h + 12 + k * 28); }
  }
  // Agents, sorted by feet y so nearer ones draw on top.
  const sorted = [...ORDER].sort((a, b) => sim.agents[a].y - sim.agents[b].y);
  for (const name of sorted) {
    const a = sim.agents[name]; const img = imgs.sprites[name]; const h = SCENE.spriteHeight * SCENE.depth(a.y);
    ctx.globalAlpha = dimOthers && hover !== name ? 0.35 : 1;
    ctx.fillStyle = "#00000044"; ctx.beginPath(); ctx.ellipse(a.x, a.y - 2, h * 0.22, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    const bob = a.pose === "walk" ? Math.abs(Math.sin(a.frame / 110)) * 6 : a.pose === "act" ? Math.abs(Math.sin(t / 160)) * 3 : Math.sin(t / 700) * 1.5;
    const tilt = a.pose === "walk" ? Math.sin(a.frame / 110) * 0.06 : a.pose === "act" ? Math.sin(t / 160) * 0.05 : 0;
    if (img) {
      const w = (img.width / img.height) * h;
      ctx.save(); ctx.translate(a.x, a.y - bob); ctx.rotate(tilt); ctx.scale(a.facing, 1); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
    } else { px(ctx, a.x - 16, a.y - h - bob, 32, h, "#c0392b"); }
    ctx.globalAlpha = 1;
  }
  // Floating deltas rising off the gauge and the lever.
  for (const p of sim.pops) {
    const age = (Date.now() - p.ts) / 1600; const y = p.y - age * 70;
    ctx.globalAlpha = 1 - age; ctx.font = "bold 30px monospace"; ctx.textAlign = "center";
    ctx.lineWidth = 5; ctx.strokeStyle = "#1a1410"; ctx.strokeText(p.text, p.x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, y);
    ctx.textAlign = "left"; ctx.globalAlpha = 1;
  }
  if (typeof location !== "undefined" && location.search.includes("roomdebug")) {
    ctx.lineWidth = 2; ctx.font = "14px monospace";
    for (const [k, b] of Object.entries(SCENE.objects)) { ctx.strokeStyle = "#00e5ff"; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.fillStyle = "#00e5ff"; ctx.fillText(k, b.x + 4, b.y + 16); }
    for (const [k, p] of Object.entries(SCENE.spots)) { ctx.fillStyle = "#ff00aa"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillText("spot:" + k, p.x + 8, p.y + 4); }
    for (const [k, p] of Object.entries(SCENE.home)) { ctx.fillStyle = "#ffea00"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillText("home:" + k, p.x + 8, p.y - 6); }
    const f = SCENE.floor; ctx.strokeStyle = "#ffea00"; ctx.strokeRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
  }
  if (exploded && hover && (SCENE.objects as Record<string, { x: number; y: number; w: number; h: number }>)[hover]) { const b = SCENE.objects[hover as ObjKey]; ctx.strokeStyle = "#f0b27a"; ctx.lineWidth = 4; ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); }
}
