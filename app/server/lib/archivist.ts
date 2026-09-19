import type { Family } from "./corpus";

export interface Match { family: string; phase: string; score: number; next: string }

/** In-process playbook matching: keyword overlap between recent scammer lines and each phase's openers, biased to the phase the runner is in. */
export function match(family: Family, recentScammerLines: string[], currentPhaseIdx: number): Match {
  const text = recentScammerLines.slice(-3).join(" ").toLowerCase();
  const words = new Set(text.split(/[^a-z0-9₹]+/).filter((w) => w.length > 3));
  let best = { idx: currentPhaseIdx, score: 0 };
  family.phases.forEach((p, idx) => {
    const pw = new Set([...p.openers, ...p.resist].join(" ").toLowerCase().split(/[^a-z0-9₹]+/).filter((w) => w.length > 3));
    let hits = 0;
    for (const w of words) if (pw.has(w)) hits++;
    const score = pw.size ? hits / Math.min(pw.size, Math.max(words.size, 1)) : 0;
    const biased = score + (idx === currentPhaseIdx ? 0.15 : 0);
    if (biased > best.score) best = { idx, score: biased };
  });
  const phase = family.phases[best.idx];
  const next = family.phases[best.idx + 1];
  return {
    family: family.label,
    phase: phase.id,
    score: Math.min(0.89, Math.round((0.55 + best.score * 0.5) * 100) / 100),
    next: next ? next.goal : "extraction complete or line dropped",
  };
}
