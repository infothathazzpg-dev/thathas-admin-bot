export function loadConfig(env = process.env) {
  const admins = (env.ADMIN_IDS || env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    token: env.TELEGRAM_BOT_TOKEN || "",
    tgBase: (env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, ""),
    supabaseUrl: (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    admins,
    port: env.PORT !== undefined && env.PORT !== "" ? Number(env.PORT) : 10000,
    selfUrl: (env.RENDER_EXTERNAL_URL || env.SELF_URL || "").replace(/\/$/, ""),
    pollTimeout: Number(env.POLL_TIMEOUT) || 25,
    notifyOnStart: env.NOTIFY_ON_START === "true",
    siteName: env.SITE_NAME || "Thathas Stay",
    siteUrl: (env.SITE_URL || "https://thathazzpg.in").replace(/\/$/, ""),
    phone: env.PG_PHONE || "+91 97462 54533",
    waNumber: (env.WA_NUMBER || "919746254533").replace(/\D/g, ""),
    address: env.PG_ADDRESS || "Majestic Building, Malaparamba, Calicut, Kerala 673009 (Opp. Cake Studio)",
    lat: env.PG_LAT || "11.2588",
    lng: env.PG_LNG || "75.7804",
    // where enquiries made through the bot are announced (same value as TELEGRAM_CHAT_ID on the website); falls back to admin DMs
    alertChatId: env.ALERT_CHAT_ID || env.TELEGRAM_CHAT_ID || "",
  };
}

export function missingConfig(cfg) {
  const m = [];
  if (!cfg.token) m.push("TELEGRAM_BOT_TOKEN");
  if (!cfg.supabaseUrl) m.push("SUPABASE_URL");
  if (!cfg.supabaseKey) m.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!cfg.admins.length) m.push("ADMIN_IDS");
  return m;
}
