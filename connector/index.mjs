import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { createDiagnostics } from "./diagnostics.mjs";
import { createRecovery } from "./recovery.mjs";

const diagnostics = createDiagnostics();
const reportError = (error) => diagnostics.report(error);
diagnostics.record("START", { nodeVersion: process.version });
process.on("uncaughtExceptionMonitor", (error, origin) => diagnostics.report(error, origin === "unhandledRejection" ? "UNHANDLED_REJECTION" : "UNCAUGHT_EXCEPTION"));
process.on("exit", (exitCode) => diagnostics.record("EXIT", { exitCode }));
console.log(`Diagnóstico do conector: ${diagnostics.file}`);

const baseUrl = process.env.XPACEBOX_URL?.replace(/\/$/, "");
const token = process.env.XPACEBOX_CONNECTOR_TOKEN?.trim();
if (!baseUrl?.startsWith("https://") || !/^[A-Za-z0-9_-]{40,100}$/.test(token ?? "")) {
  diagnostics.record("INVALID_CONFIGURATION");
  throw new Error("Configure XPACEBOX_URL (HTTPS) e XPACEBOX_CONNECTOR_TOKEN no arquivo .env.");
}
const endpoint = `${baseUrl}/api/xpace/message-connector/worker`;
const authPath = join(process.env.LOCALAPPDATA || join(homedir(), ".xpacebox"), "XpaceBox", "message-connector");
await mkdir(authPath, { recursive: true });
const logger = pino({ level: "warn" }, diagnostics.libraryStream);
let socket;
let connected = false;
let shuttingDown = false;
let lastQr = "";
let phone = "";
let connectionStatus = "OFFLINE";
let connectionError = "";
let healthyHeartbeatAt = 0;
const pauseSends = process.env.XPACEBOX_PAUSE_SEND === "1";
const sendLimit = Math.max(0, Number.parseInt(process.env.XPACEBOX_SEND_LIMIT || "0", 10) || 0);
let sendAttempts = 0;
const trackedMessages = new Map();
const earlyReceipts = new Map();
const acceptanceWaiters = new Map();
const receiptLabels = { 0: "ERRO", 2: "ACEITA PELO SERVIDOR", 3: "ENTREGUE", 4: "LIDA" };

function logReceipt(messageId, status, code) {
  const label = receiptLabels[status];
  if (!label) return;
  const suffix = status === 0 && typeof code === "string" && /^\d{3}$/.test(code) ? ` (código ${code})` : "";
  diagnostics.record("MESSAGE_RECEIPT", { messageId, receiptStatus: String(status), ...(suffix ? { statusCode: Number(code) } : {}) });
  console.log(`WhatsApp: envio monitorado ${messageId}: ${label}${suffix}.`);
}

async function destinationJid(destinationPhone) {
  if (!/^55\d{10,11}$/.test(destinationPhone ?? "")) throw new Error("DESTINO INVÁLIDO.");
  const contacts = await socket.onWhatsApp(`${destinationPhone}@s.whatsapp.net`);
  const match = contacts?.length === 1 ? contacts[0] : null;
  if (!match?.exists) throw new Error("DESTINO NÃO LOCALIZADO NO WHATSAPP.");
  if (typeof match.lid !== "string" || !/^\d+@lid$/.test(match.lid)) throw new Error("IDENTIFICADOR DO DESTINO INDISPONÍVEL.");
  return match.lid;
}

function waitForServerAcceptance(providerMessageId) {
  const previous = earlyReceipts.get(providerMessageId);
  if (previous?.status === 0) return Promise.reject(new Error("WHATSAPP REJEITOU O ENVIO."));
  if (previous?.status >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      acceptanceWaiters.delete(providerMessageId);
      reject(new Error("SEM CONFIRMAÇÃO DO SERVIDOR EM 30 SEGUNDOS."));
    }, 30_000);
    acceptanceWaiters.set(providerMessageId, { resolve, reject, timer });
  });
}

async function api(body) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const error = new Error("Falha na comunicação com o servidor do conector.");
    error.httpStatus = response.status;
    diagnostics.record("API_ERROR", { action: body.action, statusCode: response.status });
    throw error;
  }
  return payload;
}

async function heartbeat(status, extra = {}) {
  const result = await api({ action: "HEARTBEAT", status, phone, ...extra });
  if (result.disconnectRequested && socket) {
    shuttingDown = true;
    connected = false;
    recovery.stop();
    diagnostics.record("DISCONNECT_REQUESTED");
    try {
      await socket.logout();
      await api({ action: "HEARTBEAT", status: "OFFLINE" });
      console.log("WhatsApp desconectado por solicitação da Loja. Reinicie para conectar novamente.");
      process.exit(0);
    } catch (error) {
      diagnostics.report(error, "REQUESTED_LOGOUT");
      await api({ action: "HEARTBEAT", status: "ERROR", error: "Desconexão não confirmada. Remova o dispositivo no celular." }).catch(reportError);
      process.exit(1);
    }
  }
}

async function connect() {
  if (shuttingDown) return;
  diagnostics.record("CONNECT_ATTEMPT");
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version, error: versionError } = await fetchLatestBaileysVersion({ timeout: 15_000 });
  if (versionError) diagnostics.report(versionError, "VERSION_FALLBACK");
  if (shuttingDown) return;
  const currentSocket = makeWASocket({ auth: state, version, logger, printQRInTerminal: false, browser: ["XPACEBOX", "Desktop", "1.0.0"], markOnlineOnConnect: false, syncFullHistory: false });
  socket = currentSocket;
  currentSocket.ev.on("creds.update", () => { void saveCreds().catch((error) => diagnostics.report(error, "SAVE_SESSION")); });
  currentSocket.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (!key?.fromMe || !key.id || typeof update.status !== "number" || !receiptLabels[update.status]) continue;
      const code = update.messageStubParameters?.[0];
      const messageId = trackedMessages.get(key.id);
      if (messageId) logReceipt(messageId, update.status, code);
      const previous = earlyReceipts.get(key.id);
      if (!previous || update.status > previous.status) earlyReceipts.set(key.id, { status: update.status, code });
      if (earlyReceipts.size > 200) earlyReceipts.delete(earlyReceipts.keys().next().value);
      if (update.status >= 3) {
        void api({ action: "RECEIPT", providerMessageId: key.id, receiptStatus: update.status >= 4 ? "READ" : "DELIVERED" }).catch(reportError);
      }
      const waiter = acceptanceWaiters.get(key.id);
      if (waiter && (update.status === 0 || update.status >= 2)) {
        clearTimeout(waiter.timer);
        acceptanceWaiters.delete(key.id);
        if (update.status === 0) waiter.reject(new Error("WHATSAPP REJEITOU O ENVIO."));
        else waiter.resolve();
      }
    }
  });
  currentSocket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    if (socket !== currentSocket || shuttingDown) return;
    try {
      if (connection === "close") {
        connected = false;
        lastQr = "";
        const code = lastDisconnect?.error?.output?.statusCode;
        const terminal = [DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.badSession, DisconnectReason.multideviceMismatch, DisconnectReason.connectionReplaced].includes(code);
        connectionStatus = terminal ? "ERROR" : "OFFLINE";
        connectionError = code === DisconnectReason.loggedOut ? "Sessão desconectada. É preciso parear novamente."
          : terminal ? "Sessão interrompida. Confira o diagnóstico local antes de iniciar outra instância." : "";
        diagnostics.record("CONNECTION_CLOSED", { ...(Number.isInteger(code) ? { statusCode: code } : {}), reason: terminal ? "MANUAL_REVIEW_REQUIRED" : "RETRY_SCHEDULED" });
        if (lastDisconnect?.error) diagnostics.report(lastDisconnect.error, "WHATSAPP_CLOSE");
        // Schedule before reporting to the site: an API outage must not cancel reconnection.
        if (terminal) recovery.stop();
        else recovery.schedule();
        await heartbeat(connectionStatus, { error: connectionError });
        return;
      }
      if (qr) {
        connected = false;
        connectionStatus = "WAITING_QR";
        connectionError = "";
        lastQr = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
        diagnostics.record("QR_READY");
        await heartbeat("WAITING_QR", { qrDataUrl: lastQr });
        console.log("QR pronto. Abra Loja > Integrador de mensagens no XPACEBOX.");
      }
      if (connection === "open") {
        connected = true;
        connectionStatus = "CONNECTED";
        connectionError = "";
        recovery.reset();
        lastQr = "";
        phone = currentSocket.user?.id?.split(":")[0]?.split("@")[0] || "";
        diagnostics.record("CONNECTED");
        await heartbeat("CONNECTED");
        console.log("WhatsApp conectado; sessão preservada.");
      }
    } catch (error) { reportError(error); }
  });
}

const recovery = createRecovery({ connect, onError: (error) => {
  diagnostics.report(error, "CONNECT");
  connectionStatus = "ERROR";
  connectionError = "Falha ao iniciar a conexão. Confira connector.log no computador da escola.";
  if (error?.name === "SyntaxError" || ["EACCES", "EPERM", "ENOSPC"].includes(error?.code)) recovery.stop();
  void heartbeat(connectionStatus, { error: connectionError }).catch(reportError);
}, onSchedule: (details) => diagnostics.record("RECONNECT_SCHEDULED", details) });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  shuttingDown = true;
  recovery.stop();
  diagnostics.record("STOP_REQUESTED", { reason: signal });
  // Stopping the worker is not a WhatsApp logout; saved credentials remain untouched.
  process.exit(0);
});
await recovery.start();

let processing = false;
setInterval(async () => {
  if (processing) return;
  processing = true;
  try {
    await heartbeat(connectionStatus, { error: connectionError });
    if (Date.now() - healthyHeartbeatAt >= 5 * 60_000) {
      healthyHeartbeatAt = Date.now();
      diagnostics.record("HEARTBEAT_OK", { state: connectionStatus });
    }
    if (connected && socket && !shuttingDown && !pauseSends && (!sendLimit || sendAttempts < sendLimit)) {
      const { message } = await api({ action: "CLAIM" });
      if (message) {
        sendAttempts += 1;
        let providerMessageId;
        try {
          const jid = await destinationJid(message.destination_phone);
          const content = message.mediaUrl
            ? { video: { url: message.mediaUrl }, caption: message.body }
            : { text: message.body };
          diagnostics.record("MESSAGE_ATTEMPT", { messageId: message.id });
          const result = await socket.sendMessage(jid, content);
          if (!result?.key?.id) throw new Error("WhatsApp não confirmou o envio.");
          providerMessageId = result.key.id;
          trackedMessages.set(result.key.id, message.id);
          if (trackedMessages.size > 200) trackedMessages.delete(trackedMessages.keys().next().value);
          await waitForServerAcceptance(result.key.id);
          await api({ action: "RESULT", messageId: message.id, success: true, providerMessageId: result.key.id });
          diagnostics.record("MESSAGE_ACCEPTED", { messageId: message.id });
          const receipt = earlyReceipts.get(result.key.id);
          if (receipt?.status >= 3) {
            await api({ action: "RECEIPT", providerMessageId: result.key.id, receiptStatus: receipt.status >= 4 ? "READ" : "DELIVERED" }).catch(reportError);
          }
          console.log(`Mensagem ${message.id}: aceita pelo servidor; aguarde confirmação de entrega.`);
        } catch (error) {
          diagnostics.record("MESSAGE_UNCONFIRMED", { messageId: message.id });
          await api({ action: "RESULT", messageId: message.id, success: false, providerMessageId, error: "Envio não confirmado. Verifique no WhatsApp e no diagnóstico local antes de reenviar." }).catch(reportError);
          reportError(error);
        }
      }
    }
  } catch (error) { reportError(error); }
  finally { processing = false; }
}, 15_000);
