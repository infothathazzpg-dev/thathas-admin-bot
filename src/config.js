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
