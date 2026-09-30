import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRecovery } from "../recovery.mjs";

function fixture(connect) {
  const timers = new Map();
  const delays = [];
  const errors = [];
  let sequence = 0;
  const recovery = createRecovery({ connect, onError: (e) => errors.push(e), onSchedule: ({ delayMs }) => delays.push(delayMs),
    setTimer: (fn) => { const id = sequence++; timers.set(id, fn); return id; }, clearTimer: (id) => timers.delete(id) });
  return { recovery, timers, delays, errors, async tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); await new Promise((done) => setImmediate(done)); } };
}

test("failed startup retries once at a time with bounded backoff", async () => {
  const f = fixture(async () => { throw new Error("offline"); });
  await f.recovery.start();
  f.recovery.schedule();
  assert.equal(f.timers.size, 1);
  for (let i = 0; i < 5; i++) await f.tick();
  assert.deepEqual(f.delays, [5000, 10000, 20000, 40000, 60000, 60000]);
  f.recovery.stop();
  assert.equal(f.timers.size, 0);
});

test("close during startup is not lost; reset cancels retry and terminal stop stays stopped", async () => {
  let release;
  const f = fixture(() => new Promise((done) => { release = done; }));
  const first = f.recovery.start();
  await f.recovery.start();
  f.recovery.schedule();
  assert.equal(f.timers.size, 0);
  release(); await first;
  assert.equal(f.timers.size, 1);
  f.recovery.reset();
  assert.equal(f.timers.size, 0);
  f.recovery.schedule();
  assert.equal(f.delays.at(-1), 5000);
  f.recovery.stop(); f.recovery.schedule(); await f.recovery.start();
  assert.equal(f.timers.size, 0);
});

test("worker schedules reconnect before an unreliable heartbeat, and preserves ERROR status", () => {
  const source = readFileSync(new URL("../index.mjs", import.meta.url), "utf8");
  const close = source.slice(source.indexOf('if (connection === "close")'), source.indexOf('if (qr)'));
  assert.ok(close.indexOf("recovery.schedule()") < close.indexOf("await heartbeat("));
  assert.ok(close.includes("if (terminal) recovery.stop()"));
  assert.ok(source.includes("await heartbeat(connectionStatus, { error: connectionError })"));
  assert.ok(!source.includes("setTimeout(connect"));
});
