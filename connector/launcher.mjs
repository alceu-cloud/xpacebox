import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDiagnostics, errorDetails } from "./diagnostics.mjs";

// Runs from this directory even when Task Scheduler starts in System32.
// Raw stderr may contain configuration or session details: classify, never save it.
export function bootstrapCategory(stderr) {
  if (/ERR_MODULE_NOT_FOUND|Cannot find (?:package|module)/i.test(stderr)) return "MODULE_LOAD_ERROR";
  if (/SyntaxError/.test(stderr)) return "SYNTAX_ERROR";
  if (/Configure XPACEBOX_URL/.test(stderr)) return "INVALID_CONFIGURATION";
  if (/ENOENT|EACCES|EPERM|ENOSPC/.test(stderr)) return "LOCAL_FILE_ERROR";
  return "PROCESS_ERROR";
}

export async function runLauncher({ directory = dirname(fileURLToPath(import.meta.url)), diagnostics = createDiagnostics({ fileName: "launcher.log" }), environment = process.env } = {}) {
  diagnostics.record("LAUNCHER_START", { nodeVersion: process.version });
  console.log(`Diagnóstico de inicialização: ${diagnostics.file}`);
  try { accessSync(join(directory, ".env"), constants.R_OK); accessSync(join(directory, "index.mjs"), constants.R_OK); }
  catch (error) { diagnostics.report(error, "BOOTSTRAP_FILES"); return 1; }
  let stopping = false;
  let child;
  const stop = (signal) => { stopping = true; child?.kill(signal); };
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    for (let attempt = 0; ; attempt++) {
      let stderr = "";
      let spawnFailed = false;
      const started = Date.now();
      const exitCode = await new Promise((done) => {
        child = spawn(process.execPath, [`--env-file=${join(directory, ".env")}`, join(directory, "index.mjs")], { cwd: directory, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.on("data", (chunk) => process.stdout.write(chunk));
        child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-16_384); });
        child.on("error", (error) => { spawnFailed = true; diagnostics.report(error, "SPAWN"); });
        child.on("close", (code, signal) => {
          diagnostics.record("CHILD_EXIT", { exitCode: code ?? 1, ...(signal ? { reason: signal } : {}) });
          done(code ?? (stopping ? 0 : 1));
        });
      });
      child = undefined;
      if (stopping || exitCode === 0) return 0;
      const category = bootstrapCategory(stderr);
      diagnostics.record("CHILD_FAILURE", { ...errorDetails({ stack: stderr }), category, exitCode });
      console.error(`Conector encerrado: ${category}. Confira connector.log e launcher.log; não gere outra chave.`);
      // Configuration/dependency errors need correction, not an endless restart loop.
      if (spawnFailed || category !== "PROCESS_ERROR" || attempt >= 2) return exitCode;
      if (Date.now() - started >= 5 * 60_000) attempt = -1;
      const delayMs = Math.min(60_000, 10_000 * 2 ** Math.max(attempt, 0));
      diagnostics.record("CHILD_RESTART_SCHEDULED", { attempt: attempt + 1, delayMs });
      await new Promise((done) => setTimeout(done, delayMs));
      if (stopping) return 0;
    }
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
    diagnostics.record("LAUNCHER_STOP");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runLauncher();
}
