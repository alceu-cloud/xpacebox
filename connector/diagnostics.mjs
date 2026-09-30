import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const knownCodes = new Set(["EACCES", "EPERM", "ENOENT", "ENOSPC", "EIO", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "ERR_MODULE_NOT_FOUND"]);
const knownNames = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError", "AssertionError"]);

// Never persist raw messages, stacks, HTTP bodies, QR data or Baileys objects.
export function errorDetails(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  const code = knownCodes.has(error?.code) ? error.code : knownCodes.has(error?.cause?.code) ? error.cause.code : undefined;
  const status = error?.httpStatus ?? error?.output?.statusCode;
  const frame = typeof error?.stack === "string" ? error.stack.split("\n").filter((line) => /^\s+at\s/.test(line)).map((line) => line.match(/(?:[/\\])([A-Za-z0-9_-]+\.(?:mjs|cjs|js):\d+:\d+)/)?.[1]).find(Boolean) : undefined;
  let category = "UNEXPECTED_ERROR";
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || /TIMEOUT/.test(code ?? "")) category = "TIMEOUT";
  else if (code === "ERR_MODULE_NOT_FOUND") category = "MODULE_LOAD_ERROR";
  else if (error?.name === "SyntaxError") category = "SYNTAX_ERROR";
  else if (code && ["EACCES", "EPERM", "ENOENT", "ENOSPC", "EIO"].includes(code)) category = "LOCAL_FILE_ERROR";
  else if (code || /fetch failed|network|connection closed|connection lost/i.test(message)) category = "NETWORK_ERROR";
  else if (status === 401 || status === 403) category = "AUTHORIZATION_ERROR";
  else if (Number.isInteger(status) && status >= 500) category = "SERVER_ERROR";
  else if (/DESTINO INVÁLIDO/.test(message)) category = "INVALID_DESTINATION";
  else if (/DESTINO NÃO LOCALIZADO/.test(message)) category = "DESTINATION_NOT_ON_WHATSAPP";
  else if (/IDENTIFICADOR DO DESTINO/.test(message)) category = "DESTINATION_ID_UNAVAILABLE";
  else if (/REJEITOU/.test(message)) category = "MESSAGE_REJECTED";
  else if (/SEM CONFIRMAÇÃO|não confirmou/.test(message)) category = "MESSAGE_ACCEPTANCE_UNCONFIRMED";
  else if (/bad mac|invalid.*key|bad session/i.test(message)) category = "SESSION_ERROR";
  return { category, ...(code ? { errorCode: code } : {}), ...(knownNames.has(error?.name) ? { errorName: error.name } : {}), ...(frame ? { frame } : {}), ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { statusCode: status } : {}) };
}

export function createDiagnostics({ directory = join(process.env.LOCALAPPDATA || join(homedir(), ".xpacebox"), "XpaceBox", "message-connector-logs"), maxBytes = 2 * 1024 * 1024, fileName = "connector.log" } = {}) {
  if (!["connector.log", "launcher.log"].includes(fileName)) throw new Error("Invalid diagnostic filename");
  const file = join(directory, fileName);
  let warned = false;
  const allowed = new Set(["category", "errorCode", "errorName", "frame", "statusCode", "exitCode", "delayMs", "attempt", "level", "messageId", "receiptStatus", "action", "stage", "state", "reason", "nodeVersion"]);
  function record(event, details = {}) {
    const safe = {};
    for (const [key, value] of Object.entries(details)) {
      if (!allowed.has(key)) continue;
      if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
      // Only fixed labels, version strings and internal UUIDs are accepted.
      if (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)) safe[key] = value;
    }
    const safeEvent = /^[A-Z0-9_]{1,60}$/.test(event) ? event : "INVALID_EVENT";
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      let size = 0;
      try { size = statSync(file).size; } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (size >= maxBytes) {
        // A maximum of the current file and three bounded-size archives.
        for (let i = 2; i >= 0; i--) {
          try { renameSync(i ? `${file}.${i}` : file, `${file}.${i + 1}`); }
          catch (error) { if (error.code !== "ENOENT") throw error; }
        }
      }
      appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event: safeEvent, ...safe })}\n`, { mode: 0o600 });
    } catch {
      if (!warned) { warned = true; console.error("Conector: não foi possível gravar o diagnóstico local. Confira permissões e espaço em disco."); }
    }
  }
  function report(error, stage = "WORKER") {
    const details = errorDetails(error);
    record("ERROR", { ...details, stage });
    console.error(`Conector: ${stage}: ${details.category}${details.errorCode ? ` (${details.errorCode})` : ""}${details.statusCode ? ` [${details.statusCode}]` : ""}.`);
  }
  const libraryStream = {
    write(chunk) {
      for (const line of String(chunk).split("\n").filter(Boolean)) {
        try {
          const data = JSON.parse(line);
          record("BAILEYS_DIAGNOSTIC", { level: data.level, ...errorDetails(data.err ?? { message: data.msg }) });
        } catch { record("BAILEYS_DIAGNOSTIC_UNPARSEABLE"); }
      }
    },
  };
  return { file, record, report, libraryStream };
}
