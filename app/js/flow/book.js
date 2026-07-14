// Order-book depth history tracker — keeps a short rolling window of depth
// snapshots (with timestamps) so signals.js can check wall persistence.
const MAX_HISTORY_MS = 15000;

export class DepthTracker {
  constructor() {
    this.history = []; // [{at, depth:{bids,asks}}]
  }

  push(depth) {
    const at = Date.now();
    this.history.push({ at, depth });
    const cutoff = at - MAX_HISTORY_MS;
    while (this.history.length > 1 && this.history[0].at < cutoff) this.history.shift();
  }

  latest() {
    return this.history.at(-1)?.depth ?? null;
  }
}
