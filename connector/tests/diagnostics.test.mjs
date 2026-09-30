import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiagnostics, errorDetails } from "../diagnostics.mjs";
import { bootstrapCategory, runLauncher } from "../launcher.mjs";

test("diagnostics redact payloads, credentials, phones, QR and library objects", () => {
  const directory = mkdtempSync(join(tmpdir(), "xpace-logs-test-"));
  try {
    const logs = createDiagnostics({ directory });
    logs.record("START", { nodeVersion: "v24.0.0", token: "secret", body: "private", phone: "5547999999999", qr: "private" });
    logs.record("ERROR", { stage: "https://example.test/secret", reason: "secret@lid" });
    logs.report(Object.assign(new Error("fetch failed secret token phone 5547999999999"), { cause: { code: "ECONNRESET" } }), "BOOTSTRAP");
    logs.libraryStream.write(JSON.stringify({ level: 50, msg: "bad mac secret", jid: "5547999999999@lid", err: { message: "bad mac secret", stack: "private" } }));
    const content = readFileSync(logs.file, "utf8");
    for (const forbidden of ["secret", "private", "5547999999999", "https://", "@lid"]) assert.ok(!content.includes(forbidden));
    const events = content.trim().split("\n").map(JSON.parse);
    assert.equal(events[2].category, "NETWORK_ERROR");
    assert.equal(events[3].category, "SESSION_ERROR");
    assert.match(events[0].at, /Z$/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("rotation keeps only three archives and current file", () => {
  const directory = mkdtempSync(join(tmpdir(), "xpace-rotation-test-"));
  try {
    const logs = createDiagnostics({ directory, maxBytes: 100 });
    for (let attempt = 0; attempt < 30; attempt++) logs.record("CONNECT_ATTEMPT", { attempt });
    assert.deepEqual(readdirSync(directory).sort(), ["connector.log", "connector.log.1", "connector.log.2", "connector.log.3"]);
    assert.equal(readFileSync(logs.file, "utf8").trim().split("\n").map(JSON.parse).at(-1).attempt, 29);
    for (const file of readdirSync(directory)) assert.ok(readFileSync(join(directory, file)).length < 250);
  } finally { rmSync(directory, { recursive: true }); }
});

test("bootstrap classifies errors without returning their sensitive text", () => {
  assert.equal(errorDetails({ code: "ERR_MODULE_NOT_FOUND" }).category, "MODULE_LOAD_ERROR");
  assert.equal(bootstrapCategory("ERR_MODULE_NOT_FOUND secret"), "MODULE_LOAD_ERROR");
  assert.equal(bootstrapCategory("SyntaxError secret"), "SYNTAX_ERROR");
  assert.equal(bootstrapCategory("Configure XPACEBOX_URL secret"), "INVALID_CONFIGURATION");
  assert.equal(bootstrapCategory("arbitrary secret"), "PROCESS_ERROR");
  assert.equal(errorDetails({ stack: "Error: secret\n    at connect (C:/private/location/index.mjs:18:4)" }).frame, "index.mjs:18:4");
});

test("missing env is logged before any worker is started", async () => {
  const directory = mkdtempSync(join(tmpdir(), "xpace-bootstrap-test-"));
  try {
    const logs = createDiagnostics({ directory, fileName: "launcher.log" });
    assert.equal(await runLauncher({ directory, diagnostics: logs }), 1);
    const content = readFileSync(logs.file, "utf8");
    assert.ok(content.includes("BOOTSTRAP_FILES"));
    assert.ok(content.includes("ENOENT"));
    assert.ok(!content.includes("CHILD_EXIT"));
  } finally { rmSync(directory, { recursive: true }); }
});

test("launcher resolves cwd/env and captures pre-worker dependency failures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "xpace-launch-test-"));
  try {
    const logs = createDiagnostics({ directory, fileName: "launcher.log" });
    writeFileSync(join(directory, ".env"), "XPACE_FIXTURE_ENV=yes\n");
    writeFileSync(join(directory, "index.mjs"), `if (process.env.XPACE_FIXTURE_ENV !== 'yes' || process.cwd() !== ${JSON.stringify(directory)}) throw new SyntaxError('private');`);
    assert.equal(await runLauncher({ directory, diagnostics: logs }), 0);
    writeFileSync(join(directory, "index.mjs"), "import 'xpace-test-nonexistent-package';");
    assert.equal(await runLauncher({ directory, diagnostics: logs }), 1);
    const content = readFileSync(logs.file, "utf8");
    assert.ok(content.includes("MODULE_LOAD_ERROR"));
    assert.ok(!content.includes("private"));
    assert.ok(!content.includes("xpace-test-nonexistent-package"));
  } finally { rmSync(directory, { recursive: true }); }
});
