import type { LadderState } from "~/shared/types";
import { ontology } from "./corpus";
import { cfg } from "./config";

export class Ladder {
  state: LadderState = "armed";
  readonly thresholds = { ...ontology.thresholds, trip: cfg.tripThresholdOverride ?? ontology.thresholds.trip };

  /** Returns the ladder steps crossed by this index, in order. */
  advance(index: number): { from: LadderState; to: LadderState }[] {
    const steps: { from: LadderState; to: LadderState }[] = [];
    const order: LadderState[] = ["armed", "warn", "nudge", "tripped"];
    const target: LadderState = index >= this.thresholds.trip ? "tripped" : index >= this.thresholds.nudge ? "nudge" : index >= this.thresholds.warn ? "warn" : "armed";
    if (this.state === "tripped" || this.state === "ended") return steps;
    let cur = order.indexOf(this.state);
    const dst = order.indexOf(target);
    while (cur < dst) {
      steps.push({ from: order[cur], to: order[cur + 1] });
      cur++;
    }
    if (steps.length) this.state = order[cur];
    return steps;
  }
  isTripped() { return this.state === "tripped"; }
  end() { if (this.state !== "tripped") this.state = "ended"; }
}
