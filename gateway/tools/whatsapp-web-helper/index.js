import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import P from "pino";
import QRCode from "qrcode";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const LOGGED_OUT_STATUS = DisconnectReason?.loggedOut ?? 401;
const RESTART_REQUIRED_STATUS = 515;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendLog(file, message, payload) {
  const line = `[${new Date().toISOString()}] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}\n`;
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, line, "utf8");
}

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeWhatsAppE164(jid) {
  if (!jid || typeof jid !== "string") return "";
  const user = jid.split("@")[0] ?? "";
  const digits = user.replace(/:\d+$/, "");
  return digits ? `+${digits}` : "";
}

function isLidJid(jid) {
  return typeof jid === "string" && jid.endsWith("@lid");
}

async function updateState(stateFile, patch) {
  const current = (await readJson(stateFile)) ?? {};
  const next = { ...current, ...patch };
  await writeJson(stateFile, next);
}

function statusCodeFromDisconnect(error) {
  const code = error?.output?.statusCode;
  return typeof code === "number" ? code : undefined;
}

async function runLogin(args) {
  const channelId = args["channel-id"] ?? "unknown";
  const stateFile = args["state-file"];
  const pidFile = args["pid-file"];
  const authDir = args["auth-dir"];
  const inboxDir = args["inbox-dir"];
  const outboxPendingDir = args["outbox-pending-dir"];
  const outboxSentDir = args["outbox-sent-dir"];
  const outboxErrorDir = args["outbox-error-dir"];
  const debugLogFile = path.join(path.dirname(stateFile), "whatsapp-debug.log");
  const selfPhone = args["self-phone"] ?? "";

  if (!stateFile || !pidFile || !authDir || !inboxDir || !outboxPendingDir || !outboxSentDir || !outboxErrorDir) {
    throw new Error(
      "Missing required arguments: --state-file --pid-file --auth-dir --inbox-dir --outbox-pending-dir --outbox-sent-dir --outbox-error-dir",
    );
  }

  await ensureDir(authDir);
  await ensureDir(inboxDir);
  await ensureDir(outboxPendingDir);
  await ensureDir(outboxSentDir);
  await ensureDir(outboxErrorDir);
  await writeJson(pidFile, { pid: process.pid, startedAt: new Date().toISOString() });
  await appendLog(debugLogFile, "login-helper.start", { channelId, authDir, inboxDir, outboxPendingDir });
  await updateState(stateFile, {
    channelId,
    status: "pending",
    message: "Initializing WhatsApp Web login...",
    authStateDir: authDir,
    selfPhone,
    lastConnectedAt: "",
    lastDisconnectedAt: "",
    lastError: "",
    qrCodeDataUrl: null,
  });

  const logger = P({ level: "silent" });
  let sock = null;
  let saveCredsRef = null;
  let connectedSelfPhone = selfPhone;
  const sentMessageIds = new Set();
  let isSendingOutbox = false;
  let restartInProgress = false;
  const outboxTimer = setInterval(async () => {
    if (isSendingOutbox || !sock) {
      return;
    }
    isSendingOutbox = true;
    try {
      await processOutbox(sock, outboxPendingDir, outboxSentDir, outboxErrorDir, sentMessageIds);
    } finally {
      isSendingOutbox = false;
    }
  }, 1500);

  async function createSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    saveCredsRef = saveCreds;
    const { version } = await fetchLatestBaileysVersion();
    const nextSock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      version,
      logger,
      printQRInTerminal: false,
      browser: ["OpsFactory", "web", "1.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    nextSock.ev.on("creds.update", saveCreds);
    return nextSock;
  }

  async function restartAfterPairing() {
    restartInProgress = true;
    await appendLog(debugLogFile, "connection.update.restart_after_pairing", { channelId });
    if (saveCredsRef) {
      try {
        await Promise.resolve(saveCredsRef());
      } catch {
        // ignore flush error
      }
    }
    await updateState(stateFile, {
      status: "pending",
      message: "WhatsApp requested a restart after pairing. Reconnecting...",
      qrCodeDataUrl: null,
      lastError: "",
    });
    try {
      sock?.ws?.close?.();
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    sock = await createSocket();
    attachSocketHandlers(sock);
  }

  function attachSocketHandlers(activeSock) {
    activeSock.ev.on("connection.update", async (update) => {
      if (update.qr) {
        await appendLog(debugLogFile, "connection.update.qr", { hasQr: true });
        const qrCodeDataUrl = await QRCode.toDataURL(update.qr);
        await updateState(stateFile, {
          status: "pending",
          message: "Scan the QR code in WhatsApp -> Linked Devices.",
          qrCodeDataUrl,
          lastError: "",
        });
      }

      if (update.connection === "open") {
        const resolvedSelfPhone = normalizeWhatsAppE164(activeSock.user?.id) || selfPhone;
        await appendLog(debugLogFile, "connection.update.open", {
          userId: activeSock.user?.id ?? null,
          resolvedSelfPhone,
        });
        restartInProgress = false;
        connectedSelfPhone = resolvedSelfPhone || connectedSelfPhone;
        await updateState(stateFile, {
          status: "connected",
          message: "WhatsApp Web connected.",
          selfPhone: resolvedSelfPhone,
          qrCodeDataUrl: null,
          lastConnectedAt: new Date().toISOString(),
          lastError: "",
        });
      }

      if (update.connection === "close") {
        const code = statusCodeFromDisconnect(update.lastDisconnect?.error);
        await appendLog(debugLogFile, "connection.update.close", { code });
        if (code === RESTART_REQUIRED_STATUS) {
          await restartAfterPairing();
          return;
        }

        if (restartInProgress && (code === 408 || code === undefined)) {
          await appendLog(debugLogFile, "connection.update.close.ignored_during_restart", { code });
          return;
        }

        const message =
          code === LOGGED_OUT_STATUS
            ? "WhatsApp Web session logged out. Start login again."
            : `WhatsApp Web disconnected${code ? ` (code ${code})` : ""}.`;

        await updateState(stateFile, {
          status: code === LOGGED_OUT_STATUS ? "disconnected" : "error",
          message,
          qrCodeDataUrl: null,
          lastDisconnectedAt: new Date().toISOString(),
          lastError: code === LOGGED_OUT_STATUS ? "" : message,
        });
        restartInProgress = false;
      }
    });

    activeSock.ev.on("messages.upsert", async (upsert) => {
      await appendLog(debugLogFile, "messages.upsert.received", {
        type: upsert.type,
        count: Array.isArray(upsert.messages) ? upsert.messages.length : 0,
      });
      if (upsert.type !== "notify" || !Array.isArray(upsert.messages)) {
        return;
      }
      for (const message of upsert.messages) {
        if (!message?.key) {
          continue;
        }
        const messageId = message.key.id;
        const remoteJid = message.key.remoteJid;
        const normalizedRemotePhone = normalizeWhatsAppE164(remoteJid);
        const normalizedPeerId =
          connectedSelfPhone && (normalizedRemotePhone === connectedSelfPhone || isLidJid(remoteJid))
            ? connectedSelfPhone
            : normalizedRemotePhone;
        const isSelfChatInbound =
          Boolean(message.key.fromMe) &&
          Boolean(connectedSelfPhone) &&
          (normalizedRemotePhone === connectedSelfPhone || isLidJid(remoteJid)) &&
          !sentMessageIds.has(messageId);

        await appendLog(debugLogFile, "messages.upsert.message", {
          messageId,
          fromMe: Boolean(message.key.fromMe),
          remoteJid,
          normalizedRemotePhone,
          normalizedPeerId,
          connectedSelfPhone,
          isSelfChatInbound,
          hasConversation: Boolean(message.message?.conversation),
          hasExtendedText: Boolean(message.message?.extendedTextMessage?.text),
        });

        if (message.key.fromMe && !isSelfChatInbound) {
          continue;
        }
        const text =
          message.message?.conversation ??
          message.message?.extendedTextMessage?.text ??
          "";

        if (!messageId || !remoteJid || !text) {
          continue;
        }
        const payload = {
          messageId,
          peerId: normalizedPeerId,
          conversationId: normalizedPeerId,
          text,
          receivedAt: new Date().toISOString(),
        };
        await appendLog(debugLogFile, "messages.upsert.accepted", payload);
        await writeInboxMessage(inboxDir, messageId, payload);
      }
    });
  }

  sock = await createSocket();
  attachSocketHandlers(sock);

  const shutdown = async () => {
    try {
      clearInterval(outboxTimer);
      await updateState(stateFile, {
        status: "disconnected",
        message: "WhatsApp Web helper stopped.",
        qrCodeDataUrl: null,
        lastDisconnectedAt: new Date().toISOString(),
      });
    } finally {
      try {
        await fs.rm(pidFile, { force: true });
      } catch {
        // ignore
      }
      try {
        sock.ws?.close?.();
      } catch {
        // ignore
      }
      process.exit(0);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise(() => {});
}

async function writeInboxMessage(inboxDir, messageId, payload) {
  const file = path.join(inboxDir, `${messageId}.json`);
  try {
    await fs.access(file);
    return;
  } catch {
    // new file
  }
  await writeJson(file, payload);
}

function normalizeOutboundJid(peerId) {
  const digits = String(peerId ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${digits}@s.whatsapp.net`;
}

async function processOutbox(sock, pendingDir, sentDir, errorDir, sentMessageIds) {
  const entries = await fs.readdir(pendingDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const file = path.join(pendingDir, entry.name);
    const command = await readJson(file);
    if (!command) {
      continue;
    }
    const jid = normalizeOutboundJid(command.to);
    if (!jid || !command.text) {
      await fs.rename(file, path.join(errorDir, entry.name));
      continue;
    }
    try {
      const result = await sock.sendMessage(jid, { text: command.text });
      const waMessageId = result?.key?.id;
      if (waMessageId) {
        sentMessageIds.add(waMessageId);
        setTimeout(() => sentMessageIds.delete(waMessageId), 5 * 60 * 1000);
      }
      command.sentAt = new Date().toISOString();
      if (waMessageId) {
        command.waMessageId = waMessageId;
      }
      await writeJson(path.join(sentDir, entry.name), command);
      await fs.rm(file, { force: true });
    } catch (error) {
      command.error = error instanceof Error ? error.message : String(error);
      command.failedAt = new Date().toISOString();
      await writeJson(path.join(errorDir, entry.name), command);
      await fs.rm(file, { force: true });
    }
  }
}

const args = parseArgs(process.argv);
const command = args.command ?? "login";

if (command !== "login") {
  console.error(`Unsupported command: ${command}`);
  process.exit(1);
}

runLogin(args).catch(async (error) => {
  if (args["state-file"]) {
    await updateState(args["state-file"], {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      qrCodeDataUrl: null,
      lastDisconnectedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
  process.exit(1);
});
