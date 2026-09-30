const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/issue-sound.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const sandbox = { exports: {} }; vm.runInNewContext(compiled, sandbox);
const { IssueAlarmTracker, playIssueAlarm } = sandbox.exports;
const alerts = (tracker, signals, time) => Array.from(tracker.pendingAlerts(signals, time));
const tracker = new IssueAlarmTracker();
assert.deepEqual(alerts(tracker, [{ id: 'first' }], 0), ['first']);
assert.deepEqual(alerts(tracker, [{ id: 'first' }], 1), ['first'], 'Only playing audio acknowledges an issue');
tracker.acknowledge(['first']);
assert.deepEqual(alerts(tracker, [{ id: 'first' }], 2), []);
assert.deepEqual(alerts(new IssueAlarmTracker(['first']), [{ id: 'first' }], 3), [], 'Reload must not repeat an acknowledged alarm');
assert.deepEqual(alerts(tracker, [{ id: 'replacement' }], 4), ['replacement'], 'New ID must alert even if total count is unchanged');
tracker.acknowledge(['replacement']);
alerts(tracker, [], 5);
assert.deepEqual(alerts(tracker, [{ id: 'replacement' }], 6), ['replacement'], 'A resolved issue may recur');
const delayed = new IssueAlarmTracker();
assert.deepEqual(alerts(delayed, [{ id: 'connector', delayed: true }], 1000), []);
assert.deepEqual(alerts(delayed, [{ id: 'connector', delayed: true }], 60999), []);
assert.deepEqual(alerts(delayed, [{ id: 'connector', delayed: true }], 61000), ['connector']);
alerts(delayed, [], 62000);
assert.deepEqual(alerts(delayed, [{ id: 'connector', delayed: true }], 63000), [], 'Recovery must reset the debounce');
const notes = [];
playIssueAlarm({ currentTime: 10, destination: {}, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), createOscillator: () => {
  const note = {}; notes.push(note);
  return { frequency: { setValueAtTime(value) { note.frequency = value; } }, connect() {}, start(time) { note.start = time; }, stop(time) { note.stop = time; } };
} });
assert.deepEqual(notes.map(n => n.frequency), [880, 660, 880]);
assert.ok(notes.every(n => n.stop - n.start < 0.23));
assert.ok(notes.at(-1).stop < 10.71, 'Alarm must be short and finite');
console.log('PASS issue alarm: deduplication, persistence, resolution, debounce and finite three-note audio.');
