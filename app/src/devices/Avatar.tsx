import { useEffect, useRef } from "react";
import { level } from "~/drill/audio";

const LOOKS: Record<string, { skin: string; hair: string; shirt: string; bg: string; badge?: string; glasses?: boolean; beard?: boolean; tie?: boolean; lanyard?: boolean; female?: boolean }> = {
  officer: { skin: "#c68642", hair: "#111", shirt: "#3d4f3d", bg: "#232a2e", badge: "#d4af37", beard: true },
  support: { skin: "#e0ac69", hair: "#3b2a1a", shirt: "#1f6fbf", bg: "#1b2430", lanyard: true, glasses: true },
  hr: { skin: "#d9a06b", hair: "#1a1a1a", shirt: "#8e44ad", bg: "#2b2530", female: true, lanyard: true },
  agent: { skin: "#b5773f", hair: "#111", shirt: "#c0392b", bg: "#2a1f1f" },
  mentor: { skin: "#c68642", hair: "#111", shirt: "#111", bg: "#1a1a1a", tie: true },
  guardian: { skin: "#d9a06b", hair: "#2b1a12", shirt: "#e67e22", bg: "#2b2530", female: true },
};

/** Canvas "video" tile: portrait with amplitude-driven mouth, webcam vignette, occasional frame drops. */
export function Avatar({ look = "officer", speaking = false, size = 300, label }: { look?: string; speaking?: boolean; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const L = LOOKS[look] ?? LOOKS.officer;
    let raf = 0; let frozen = 0; let noiseT = 0;
    const draw = (t: number) => {
      if (frozen > t) { raf = requestAnimationFrame(draw); return; }
      if (Math.random() < 0.004) frozen = t + 260;
      const w = c.width, h = c.height;
      ctx.fillStyle = L.bg; ctx.fillRect(0, 0, w, h);
      // wall detail
      ctx.fillStyle = "#ffffff08"; for (let i = 0; i < 6; i++) ctx.fillRect(0, i * (h / 6), w, 1);
      const cx = w / 2, cy = h * 0.62; const sway = Math.sin(t / 900) * 2;
      // shoulders
      ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.ellipse(cx + sway, cy + h * 0.32, w * 0.42, h * 0.28, 0, Math.PI, Math.PI * 2); ctx.fill();
      if (L.tie) { ctx.fillStyle = "#8e1b1b"; ctx.fillRect(cx - 5, cy + h * 0.1, 10, h * 0.25); }
      if (L.lanyard) { ctx.strokeStyle = "#e4572e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 24, cy + h * 0.08); ctx.lineTo(cx - 6, cy + h * 0.3); ctx.moveTo(cx + 24, cy + h * 0.08); ctx.lineTo(cx + 6, cy + h * 0.3); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(cx - 12, cy + h * 0.28, 24, 16); }
      // neck + head
      ctx.fillStyle = L.skin; ctx.fillRect(cx - 14 + sway, cy - 4, 28, 28);
      ctx.beginPath(); ctx.ellipse(cx + sway, cy - h * 0.12, w * 0.19, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      // hair
      ctx.fillStyle = L.hair; ctx.beginPath(); ctx.ellipse(cx + sway, cy - h * 0.24, w * 0.2, h * 0.12, 0, Math.PI, Math.PI * 2); ctx.fill();
      if (L.female) { ctx.fillRect(cx - w * 0.2 + sway, cy - h * 0.24, w * 0.06, h * 0.32); ctx.fillRect(cx + w * 0.14 + sway, cy - h * 0.24, w * 0.06, h * 0.32); }
      // eyes
      const blink = Math.floor(t / 3000) % 10 === 0 && (t % 3000) < 120;
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(cx - 18 + sway, cy - h * 0.14, 8, blink ? 1 : 6); ctx.fillRect(cx + 10 + sway, cy - h * 0.14, 8, blink ? 1 : 6);
      if (L.glasses) { ctx.strokeStyle = "#222"; ctx.lineWidth = 2; ctx.strokeRect(cx - 22 + sway, cy - h * 0.16, 16, 12); ctx.strokeRect(cx + 6 + sway, cy - h * 0.16, 16, 12); }
      // mouth
      const open = speaking ? 2 + level() * 14 : 2;
      ctx.fillStyle = "#5a2a2a"; ctx.beginPath(); ctx.ellipse(cx + sway, cy - h * 0.02, 12, open, 0, 0, Math.PI * 2); ctx.fill();
      if (L.beard) { ctx.fillStyle = "#222c"; ctx.fillRect(cx - 20 + sway, cy - h * 0.06, 40, 4); ctx.fillRect(cx - 24 + sway, cy + h * 0.02, 48, 10); }
      // badge
      if (L.badge) { ctx.fillStyle = L.badge; ctx.beginPath(); ctx.moveTo(cx - 42, cy + h * 0.16); ctx.lineTo(cx - 30, cy + h * 0.14); ctx.lineTo(cx - 32, cy + h * 0.26); ctx.lineTo(cx - 44, cy + h * 0.24); ctx.fill(); }
      // vignette + noise
      const g = ctx.createRadialGradient(cx, cy, w * 0.2, cx, cy, w * 0.75); g.addColorStop(0, "#0000"); g.addColorStop(1, "#000a"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      noiseT += 1; if (noiseT % 3 === 0) { ctx.fillStyle = "#ffffff06"; for (let i = 0; i < 30; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [look, speaking]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
      <canvas ref={ref} width={size} height={Math.round(size * 1.3)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {label && <div style={{ position: "absolute", left: 8, bottom: 8, background: "#0009", color: "#fff", fontSize: 12, padding: "2px 6px", borderRadius: 4, fontFamily: "Roboto, Inter, sans-serif" }}>{label}</div>}
    </div>
  );
}
