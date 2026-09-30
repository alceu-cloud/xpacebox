export type IssueSignal = { id: string; delayed?: boolean };

// Audio acknowledgement is separate from resolving a business issue.
export class IssueAlarmTracker {
  heard: Set<string>;
  private pending = new Map<string, number>();
  constructor(heard: string[] = []) { this.heard = new Set(heard); }
  pendingAlerts(signals: IssueSignal[], now: number) {
    const active = new Set(signals.map((signal) => signal.id));
    for (const id of this.heard) if (!active.has(id)) this.heard.delete(id);
    for (const id of this.pending.keys()) if (!active.has(id)) this.pending.delete(id);
    const ready: string[] = [];
    for (const signal of signals) {
      if (this.heard.has(signal.id)) continue;
      if (!this.pending.has(signal.id)) this.pending.set(signal.id, now);
      if (now - this.pending.get(signal.id)! >= (signal.delayed ? 60_000 : 0)) ready.push(signal.id);
    }
    return ready;
  }
  acknowledge(ids: string[]) { for (const id of ids) this.heard.add(id); }
}

export function playIssueAlarm(context: AudioContext) {
  // A short three-note alarm, never a looping siren.
  for (const [index, frequency] of [880, 660, 880].entries()) {
    const start = context.currentTime + index * 0.24;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + 0.22);
  }
}
