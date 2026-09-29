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
    const labels = { 0: "ERRO", 2: "ACEITA PELO SERVIDOR", 3: "ENTREGUE", 4: "LIDA" };
    for (const { key, update } of updates) {
      if (!key?.fromMe || !key.id || typeof update.status !== "number" || !labels[update.status]) continue;
      const code = update.messageStubParameters?.[0];
      const errorCode = update.status === 0 && typeof code === "string" && /^\d{3}$/.test(code) ? ` (código ${code})` : "";
      console.log(`WhatsApp: mensagem ${key.id}: ${labels[update.status]}${errorCode}.`);
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
    if (connected && socket && !shuttingDown) {
      const { message } = await api({ action: "CLAIM" });
      if (message) {
        try {
          const result = await socket.sendMessage(`${message.destination_phone}@s.whatsapp.net`, { text: message.body });
          if (!result?.key?.id) throw new Error("WhatsApp não confirmou o envio.");
          await api({ action: "RESULT", messageId: message.id, success: true, providerMessageId: result.key.id });
          console.log(`Mensagem ${message.id}: processada pela biblioteca como ${result.key.id}; aguarde confirmação de entrega.`);
        } catch (error) {
          await api({ action: "RESULT", messageId: message.id, success: false, error: error instanceof Error ? error.message : "Envio não confirmado" }).catch(reportError);
          reportError(error);
        }
      }
    }
  } catch (error) { reportError(error); }
  finally { processing = false; }
}, 15_000);
