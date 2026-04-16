import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCode = require("../whatsapp-web-helper/node_modules/qrcode");

const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_BOT_TYPE = "3";
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_LOGIN_TIMEOUT_MS = 8 * 60_000;
const MAX_QR_REFRESH_COUNT = 3;
const ILINK_APP_ID = "bot";
const ILINK_APP_CLIENT_VERSION = String(((2 & 0xff) << 16) | ((1 & 0xff) << 8) | (7 & 0xff));
const SESSION_EXPIRED_ERRCODE = -14;

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

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function appendLog(file, message, payload) {
  const line = `[${new Date().toISOString()}] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}\n`;
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, line, "utf8");
}

async function updateState(stateFile, patch) {
  const current = (await readJson(stateFile)) ?? {};
  const next = { ...current, ...patch };
  await writeJson(stateFile, next);
}

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf8").toString("base64");
}

function buildCommonHeaders() {
  return {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION,
  };
}

function buildGetHeaders() {
  return buildCommonHeaders();
}

function buildPostHeaders(token, body) {
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "Content-Length": String(Buffer.byteLength(body, "utf8")),
    "X-WECHAT-UIN": randomWechatUin(),
    ...buildCommonHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function apiGet({ baseUrl, endpoint, timeoutMs = DEFAULT_API_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(endpoint, ensureTrailingSlash(baseUrl)).toString(), {
      method: "GET",
      headers: buildGetHeaders(),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${endpoint} failed with HTTP ${response.status}: ${text}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function apiPost({ baseUrl, endpoint, token, payload, timeoutMs = DEFAULT_API_TIMEOUT_MS }) {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(endpoint, ensureTrailingSlash(baseUrl)).toString(), {
      method: "POST",
      headers: buildPostHeaders(token, body),
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`POST ${endpoint} failed with HTTP ${response.status}: ${text}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchQrCode() {
  return JSON.parse(await apiGet({
    baseUrl: FIXED_BASE_URL,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_BOT_TYPE)}`,
  }));
}

async function qrPageUrlToDataUrl(qrPageUrl) {
  return QRCode.toDataURL(qrPageUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}

async function pollQrStatus(baseUrl, qrcode) {
  try {
    return JSON.parse(await apiGet({
      baseUrl,
      endpoint: `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      timeoutMs: DEFAULT_LONG_POLL_TIMEOUT_MS,
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "wait" };
    }
    throw error;
  }
}

async function getUpdates(baseUrl, token, getUpdatesBuf) {
  try {
    return JSON.parse(await apiPost({
      baseUrl,
      endpoint: "ilink/bot/getupdates",
      token,
      timeoutMs: DEFAULT_LONG_POLL_TIMEOUT_MS,
      payload: {
        get_updates_buf: getUpdatesBuf ?? "",
        base_info: {},
      },
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf ?? "" };
    }
    throw error;
  }
}

async function sendTextMessage(baseUrl, token, to, text, contextToken) {
  const clientId = crypto.randomUUID();
  await apiPost({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    token,
    payload: {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: text ? [{ type: 1, text_item: { text } }] : undefined,
        context_token: contextToken || undefined,
      },
      base_info: {},
    },
  });
  return clientId;
}

function resolveCredentialsFile(authDir) {
  return path.join(authDir, "credentials.json");
}

function resolveSyncBufFile(authDir) {
  return path.join(authDir, "get-updates-buf.txt");
}

async function saveCredentials(authDir, credentials) {
  await writeJson(resolveCredentialsFile(authDir), {
    ...credentials,
    savedAt: new Date().toISOString(),
  });
}

async function clearCredentials(authDir) {
  await fs.rm(resolveCredentialsFile(authDir), { force: true });
  await fs.rm(resolveSyncBufFile(authDir), { force: true });
}

async function loadSyncBuf(authDir) {
  try {
    return (await fs.readFile(resolveSyncBufFile(authDir), "utf8")).trim();
  } catch {
    return "";
  }
}

async function saveSyncBuf(authDir, value) {
  await ensureDir(authDir);
  await fs.writeFile(resolveSyncBufFile(authDir), value ?? "", "utf8");
}

function buildInboundText(message) {
  if (!Array.isArray(message?.item_list)) {
    return "";
  }
  for (const item of message.item_list) {
    if (item?.type === 1 && item?.text_item?.text) {
      return String(item.text_item.text);
    }
    if (item?.type === 3 && item?.voice_item?.text) {
      return String(item.voice_item.text);
    }
  }
  return "";
}

async function writeInboxMessage(inboxDir, externalMessageId, payload) {
  await ensureDir(inboxDir);
  const safeId = String(externalMessageId).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const file = path.join(inboxDir, `${Date.now()}-${safeId}.json`);
  await writeJson(file, payload);
}

async function moveFile(source, targetDir, suffix) {
  await ensureDir(targetDir);
  const target = path.join(targetDir, source.name.replace(/\.json$/i, `-${suffix}.json`));
  await fs.rename(source.fullPath, target);
}

async function waitForQrLogin({ stateFile, logFile, abortSignal }) {
  let qrData = await fetchQrCode();
  let refreshCount = 1;
  let currentBaseUrl = FIXED_BASE_URL;
  let qrMessage = "Use WeChat to scan the QR code and authorize the channel.";
  let qrCodeDataUrl = await qrPageUrlToDataUrl(qrData.qrcode_img_content);

  await appendLog(logFile, "wechat.qr.created", { refreshCount, currentBaseUrl });
  await updateState(stateFile, {
    status: "pending",
    message: qrMessage,
    qrCodeDataUrl,
    lastError: "",
  });

  const deadline = Date.now() + DEFAULT_LOGIN_TIMEOUT_MS;
  while (!abortSignal.aborted && Date.now() < deadline) {
    const status = await pollQrStatus(currentBaseUrl, qrData.qrcode);
    if (status.status === "wait") {
      continue;
    }
    if (status.status === "scaned") {
      qrMessage = "QR scanned. Confirm the authorization in WeChat.";
      await updateState(stateFile, { status: "pending", message: qrMessage });
      continue;
    }
    if (status.status === "scaned_but_redirect" && status.redirect_host) {
      currentBaseUrl = `https://${status.redirect_host}`;
      await appendLog(logFile, "wechat.qr.redirect", { currentBaseUrl });
      continue;
    }
    if (status.status === "expired") {
      refreshCount += 1;
      if (refreshCount > MAX_QR_REFRESH_COUNT) {
        throw new Error("QR code expired too many times. Start login again.");
      }
      qrData = await fetchQrCode();
      currentBaseUrl = FIXED_BASE_URL;
      qrMessage = "QR expired. Scan the refreshed code in WeChat.";
      qrCodeDataUrl = await qrPageUrlToDataUrl(qrData.qrcode_img_content);
      await appendLog(logFile, "wechat.qr.refreshed", { refreshCount });
      await updateState(stateFile, {
        status: "pending",
        message: qrMessage,
        qrCodeDataUrl,
        lastError: "",
      });
      continue;
    }
    if (status.status === "confirmed" && status.bot_token && status.ilink_bot_id) {
      return {
        token: status.bot_token,
        botAccountId: status.ilink_bot_id,
        userId: status.ilink_user_id ?? "",
        baseUrl: status.baseurl || currentBaseUrl || FIXED_BASE_URL,
      };
    }
  }
  throw new Error("Timed out waiting for WeChat QR confirmation.");
}

async function processOutbox({ token, baseUrl, outboxPendingDir, outboxSentDir, outboxErrorDir, stateFile, logFile }) {
  let entries = [];
  try {
    entries = await fs.readdir(outboxPendingDir);
  } catch {
    return;
  }
  const files = entries.filter((name) => name.endsWith(".json")).sort();
  for (const name of files) {
    const fullPath = path.join(outboxPendingDir, name);
    try {
      const payload = JSON.parse(await fs.readFile(fullPath, "utf8"));
      if (!payload?.to || !payload?.text) {
        throw new Error("Outbox payload missing 'to' or 'text'");
      }
      await sendTextMessage(baseUrl, token, String(payload.to), String(payload.text), String(payload.contextToken || ""));
      await updateState(stateFile, {
        lastConnectedAt: (await readJson(stateFile))?.lastConnectedAt ?? "",
        lastError: "",
      });
      await appendLog(logFile, "wechat.outbox.sent", { to: payload.to });
      await moveFile({ name, fullPath }, outboxSentDir, "sent");
    } catch (error) {
      await appendLog(logFile, "wechat.outbox.error", { file: name, error: String(error) });
      await moveFile({ name, fullPath }, outboxErrorDir, "error");
    }
  }
}

async function monitorMessages({ authDir, stateFile, logFile, inboxDir, outboxPendingDir, outboxSentDir, outboxErrorDir, token, baseUrl, abortSignal }) {
  let getUpdatesBuf = await loadSyncBuf(authDir);
  let stopped = false;

  const outboxTimer = setInterval(() => {
    void processOutbox({ token, baseUrl, outboxPendingDir, outboxSentDir, outboxErrorDir, stateFile, logFile });
  }, 1500);

  abortSignal.addEventListener("abort", () => {
    stopped = true;
    clearInterval(outboxTimer);
  }, { once: true });

  while (!stopped) {
    try {
      const response = await getUpdates(baseUrl, token, getUpdatesBuf);
      if ((response.errcode ?? response.ret) === SESSION_EXPIRED_ERRCODE) {
        await clearCredentials(authDir);
        await updateState(stateFile, {
          status: "disconnected",
          message: "WeChat session expired. Scan the QR code again.",
          qrCodeDataUrl: null,
          lastDisconnectedAt: new Date().toISOString(),
          lastError: "",
        });
        await appendLog(logFile, "wechat.session.expired");
        break;
      }
      if ((response.ret ?? 0) !== 0 || (response.errcode ?? 0) !== 0) {
        const message = `WeChat getUpdates failed: ${response.errmsg || response.errcode || response.ret}`;
        await updateState(stateFile, {
          status: "error",
          message,
          qrCodeDataUrl: null,
          lastError: message,
        });
        await appendLog(logFile, "wechat.getupdates.error", {
          ret: response.ret,
          errcode: response.errcode,
          errmsg: response.errmsg,
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (typeof response.get_updates_buf === "string" && response.get_updates_buf.length > 0) {
        getUpdatesBuf = response.get_updates_buf;
        await saveSyncBuf(authDir, getUpdatesBuf);
      }

      for (const message of response.msgs ?? []) {
        const peerId = String(message?.from_user_id || "").trim();
        const text = buildInboundText(message).trim();
        if (!peerId || !text) {
          continue;
        }
        const externalMessageId = String(message?.message_id ?? `${message?.seq ?? Date.now()}`);
        await writeInboxMessage(inboxDir, externalMessageId, {
          messageId: externalMessageId,
          peerId,
          conversationId: peerId,
          text,
          contextToken: String(message?.context_token || ""),
          receivedAt: new Date().toISOString(),
        });
        await appendLog(logFile, "wechat.inbox.received", { peerId, externalMessageId });
      }
    } catch (error) {
      if (stopped) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      await appendLog(logFile, "wechat.monitor.error", { error: message });
      await updateState(stateFile, {
        status: "error",
        message: `WeChat runtime error: ${message}`,
        qrCodeDataUrl: null,
        lastError: message,
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
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
  const logFile = args["log-file"] ?? path.join(path.dirname(stateFile), "login.log");

  if (!stateFile || !pidFile || !authDir || !inboxDir || !outboxPendingDir || !outboxSentDir || !outboxErrorDir) {
    throw new Error("Missing required arguments for wechat helper.");
  }

  await ensureDir(authDir);
  await ensureDir(inboxDir);
  await ensureDir(outboxPendingDir);
  await ensureDir(outboxSentDir);
  await ensureDir(outboxErrorDir);
  await writeJson(pidFile, { pid: process.pid, startedAt: new Date().toISOString(), channelId });
  await updateState(stateFile, {
    channelId,
    status: "pending",
    message: "Preparing WeChat QR login...",
    authStateDir: authDir,
    selfPhone: "",
    wechatId: "",
    displayName: "",
    lastConnectedAt: "",
    lastDisconnectedAt: "",
    lastError: "",
    qrCodeDataUrl: null,
  });

  const abortController = new AbortController();
  const shutdown = async () => {
    abortController.abort();
    try {
      await fs.rm(pidFile, { force: true });
    } catch {
      // ignore
    }
  };

  process.on("SIGTERM", () => { void shutdown(); });
  process.on("SIGINT", () => { void shutdown(); });

  try {
    const credentials = await waitForQrLogin({
      stateFile,
      logFile,
      abortSignal: abortController.signal,
    });

    await saveCredentials(authDir, credentials);
    await updateState(stateFile, {
      status: "connected",
      message: "WeChat connected.",
      qrCodeDataUrl: null,
      wechatId: credentials.userId || "",
      displayName: credentials.userId || "",
      lastConnectedAt: new Date().toISOString(),
      lastError: "",
    });
    await appendLog(logFile, "wechat.connected", {
      channelId,
      botAccountId: credentials.botAccountId,
      userId: credentials.userId,
      baseUrl: credentials.baseUrl,
    });

    await monitorMessages({
      authDir,
      stateFile,
      logFile,
      inboxDir,
      outboxPendingDir,
      outboxSentDir,
      outboxErrorDir,
      token: credentials.token,
      baseUrl: credentials.baseUrl,
      abortSignal: abortController.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendLog(logFile, "wechat.login.error", { error: message });
    await updateState(stateFile, {
      status: "error",
      message,
      qrCodeDataUrl: null,
      lastDisconnectedAt: new Date().toISOString(),
      lastError: message,
    });
    throw error;
  } finally {
    await shutdown();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const command = args.command ?? "login";
  if (command !== "login") {
    throw new Error(`Unsupported command '${command}'`);
  }
  await runLogin(args);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
