import http from "node:http";
import { pathToFileURL } from "node:url";
import { loadConfig, missingConfig } from "./config.js";
import { Telegram } from "./telegram.js";
import { Supabase } from "./db.js";
import { createHandlers } from "./handlers.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startBot(cfg, log = console) {
  const tg = new Telegram(cfg.token, cfg.tgBase);
  const db = new Supabase(cfg.supabaseUrl, cfg.supabaseKey);
  const { handleUpdate } = createHandlers({ tg, db, cfg, log });

  const state = { running: true, offset: 0, lastPoll: Date.now(), started: Date.now(), handled: 0 };

  // Health endpoint (Render needs an HTTP port; also used to keep the free instance awake)
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, bot: "thathas-admin-bot", uptimeSec: Math.round((Date.now() - state.started) / 1000), lastPollSecAgo: Math.round((Date.now() - state.lastPoll) / 1000), handled: state.handled }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(cfg.port, resolve));
  const port = server.address().port;

  // Startup: identify, switch from webhook to polling, register command menu
  const me = await tg.call("getMe");
  await tg.call("deleteWebhook", { drop_pending_updates: false }).catch((e) => log.warn("deleteWebhook:", e.message));
  await tg
    .call("setMyCommands", {
      commands: [
        { command: "menu", description: "Open the admin panel" },
        { command: "stats", description: "Dashboard" },
        { command: "enquiries", description: "New enquiries" },
        { command: "rooms", description: "Rooms" },
        { command: "due", description: "Rent pending" },
        { command: "find", description: "Search by name or phone" },
        { command: "help", description: "All commands" },
      ],
    })
    .catch(() => {});
  log.log(`Bot @${me.username} is running (polling). Admins: ${cfg.admins.join(", ")}`);
  if (cfg.notifyOnStart) for (const id of cfg.admins) await tg.send(id, "🟢 Admin bot online. Send /menu").catch(() => {});

  async function loop() {
    let backoff = 1000;
    while (state.running) {
      try {
        const updates = await tg.call(
          "getUpdates",
          { offset: state.offset, timeout: cfg.pollTimeout, allowed_updates: ["message", "callback_query"] },
          (cfg.pollTimeout + 10) * 1000,
        );
        state.lastPoll = Date.now();
        backoff = 1000;
        for (const u of updates) state.offset = Math.max(state.offset, u.update_id + 1);
        await Promise.allSettled(
          updates.map((u) =>
            handleUpdate(u)
              .then(() => void state.handled++)
              .catch((e) => log.error("update error:", e.message)),
          ),
        );
      } catch (e) {
        if (!state.running) break;
        if (e.code === 409) {
          log.warn("409 conflict: another instance or a webhook is active. Retrying…");
          await tg.call("deleteWebhook", {}).catch(() => {});
          await sleep(5000);
        } else if (e.code === 401) {
          log.error("Telegram rejected the bot token (401). Check TELEGRAM_BOT_TOKEN.");
          await sleep(30000);
        } else {
          log.warn("poll error:", e.message);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      }
    }
  }
  const loopDone = loop();

  // Keep a free Render instance awake by calling ourselves
  let pinger = null;
  if (cfg.selfUrl) {
    pinger = setInterval(() => fetch(`${cfg.selfUrl}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {}), 10 * 60 * 1000);
    pinger.unref?.();
  }

  return {
    port,
    state,
    async stop() {
      state.running = false;
      if (pinger) clearInterval(pinger);
      await loopDone;
      await new Promise((r) => server.close(r));
    },
  };
}

async function main() {
  const cfg = loadConfig();
  const missing = missingConfig(cfg);
  if (missing.length) {
    console.error("Missing environment variables: " + missing.join(", "));
    process.exit(1);
  }
  const bot = await startBot(cfg);
  const shutdown = () => {
    console.log("Shutting down…");
    bot.stop().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
