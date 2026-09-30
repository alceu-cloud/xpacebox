// One pending retry and one connection attempt; independent of the web API.
export function createRecovery({ connect, onError, onSchedule, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  let running = false;
  let requested = false;
  let stopped = false;
  let attempt = 0;
  function schedule() {
    if (stopped || timer !== undefined) return;
    if (running) { requested = true; return; }
    const delayMs = Math.min(60_000, 5_000 * 2 ** Math.min(attempt++, 4));
    onSchedule?.({ attempt, delayMs });
    timer = setTimer(() => { timer = undefined; void run(); }, delayMs);
  }
  async function run() {
    if (stopped || running) return;
    running = true;
    try { await connect(); }
    catch (error) { onError(error); requested = true; }
    finally {
      running = false;
      if (requested) { requested = false; schedule(); }
    }
  }
  return {
    start: run,
    schedule,
    reset() { attempt = 0; requested = false; if (timer !== undefined) clearTimer(timer); timer = undefined; },
    stop() { stopped = true; requested = false; if (timer !== undefined) clearTimer(timer); timer = undefined; },
  };
}
