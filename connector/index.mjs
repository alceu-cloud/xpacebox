import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const baseUrl = process.env.XPACEBOX_URL?.replace(/\/$/, "");
const token = process.env.XPACEBOX_CONNECTOR_TOKEN?.trim();
if (!baseUrl?.startsWith("https://") || !/^[A-Za-z0-9_-]{40,100}$/.test(token ?? "")) {
  throw new Error("Configure XPACEBOX_URL (HTTPS) e XPACEBOX_CONNECTOR_TOKEN no arquivo .env.");
}
const endpoint = `${baseUrl}/api/xpace/message-connector/worker`;
const authPath = join(process.env.LOCALAPPDATA || join(homedir(), ".xpacebox"), "XpaceBox", "message-connector");
await mkdir(authPath, { recursive: true });
const logger = pino({ level: "warn" });
let socket;
let connected = false;
let shuttingDown = false;
let lastQr = "";
let phone = "";
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
  if (!response.ok || !payload.success) throw new Error(payload.message || `Servidor retornou ${response.status}`);
  return payload;
}

async function heartbeat(status, extra = {}) {
  const result = await api({ action: "HEARTBEAT", status, phone, ...extra });
  if (result.disconnectRequested && socket) {
    shuttingDown = true;
    connected = false;
    try {
      await socket.logout();
      await api({ action: "HEARTBEAT", status: "OFFLINE" });
      console.log("WhatsApp desconectado por solicitação da Loja. Reinicie para conectar novamente.");
      process.exit(0);
    } catch (error) {
      console.error("Desconexão não confirmada. Remova o dispositivo no celular:", error instanceof Error ? error.message : error);
      await api({ action: "HEARTBEAT", status: "ERROR", error: "Desconexão não confirmada. Remova o dispositivo no celular." }).catch(reportError);
      process.exit(1);
    }
  }
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();
  socket = makeWASocket({ auth: state, version, logger, printQRInTerminal: false, browser: ["XPACEBOX", "Desktop", "1.0.0"], markOnlineOnConnect: false, syncFullHistory: false });
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.update", (updates) => {
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
  socket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    try {
      if (qr) {
        connected = false;
        lastQr = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
        await heartbeat("WAITING_QR", { qrDataUrl: lastQr });
        console.log("QR pronto. Abra Loja > Integrador de mensagens no XPACEBOX.");
      }
      if (connection === "open") {
        connected = true;
        lastQr = "";
        phone = socket.user?.id?.split(":")[0]?.split("@")[0] || "";
        await heartbeat("CONNECTED");
        console.log(`WhatsApp conectado: ${phone || "número não informado"}`);
      }
      if (connection === "close") {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        await heartbeat(code === DisconnectReason.loggedOut ? "ERROR" : "OFFLINE", { error: code === DisconnectReason.loggedOut ? "Sessão desconectada. É preciso parear novamente." : "" });
        if (!shuttingDown && code !== DisconnectReason.loggedOut) setTimeout(() => void connect().catch(reportError), 5_000);
      }
    } catch (error) { reportError(error); }
  });
}

function reportError(error) { console.error("Conector:", error instanceof Error ? error.message : error); }
await connect();

let processing = false;
setInterval(async () => {
  if (processing) return;
  processing = true;
  try {
    await heartbeat(connected ? "CONNECTED" : lastQr ? "WAITING_QR" : "OFFLINE");
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
          const result = await socket.sendMessage(jid, content);
          if (!result?.key?.id) throw new Error("WhatsApp não confirmou o envio.");
          providerMessageId = result.key.id;
          trackedMessages.set(result.key.id, message.id);
          if (trackedMessages.size > 200) trackedMessages.delete(trackedMessages.keys().next().value);
          await waitForServerAcceptance(result.key.id);
          await api({ action: "RESULT", messageId: message.id, success: true, providerMessageId: result.key.id });
          const receipt = earlyReceipts.get(result.key.id);
          if (receipt?.status >= 3) {
            await api({ action: "RECEIPT", providerMessageId: result.key.id, receiptStatus: receipt.status >= 4 ? "READ" : "DELIVERED" }).catch(reportError);
          }
          console.log(`Mensagem ${message.id}: aceita pelo servidor; aguarde confirmação de entrega.`);
        } catch (error) {
          await api({ action: "RESULT", messageId: message.id, success: false, providerMessageId, error: error instanceof Error ? error.message : "Envio não confirmado" }).catch(reportError);
          reportError(error);
        }
      }
    }
  } catch (error) { reportError(error); }
  finally { processing = false; }
}, 15_000);
