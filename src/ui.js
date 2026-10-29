// Button + message helpers. Telegram button colours: style = "primary" (blue), "success" (green), "danger" (red).
export const btn = (text, data, style) => (style ? { text, callback_data: data, style } : { text, callback_data: data });
export const urlBtn = (text, url) => ({ text, url });
export const kb = (rows) => ({ inline_keyboard: rows.filter((r) => r && r.length) });

export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
export const clip = (s, n) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
export const when = (iso) =>
  new Date(iso || Date.now()).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
export const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
export const monthStartIST = () => todayIST().slice(0, 7) + "-01";
export const monthLabel = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
export const waDigits = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};
export const waLink = (phone, text) =>
  `https://wa.me/${waDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

// ── Enquiries ──────────────────────────────────────────────
export const ENQ = {
  c: { status: "contacted", label: "✅ Contacted", style: "primary" },
  v: { status: "converted", label: "🏠 Converted", style: "success" },
  x: { status: "closed", label: "❌ Rejected", style: "danger" },
  n: { status: "new", label: "🆕 New" },
};
const ENQ_BY_STATUS = Object.fromEntries(Object.entries(ENQ).map(([code, v]) => [v.status, { code, ...v }]));

export function enquiryCard(e) {
  const cur = e.status || "new";
  const info = ENQ_BY_STATUS[cur] || ENQ_BY_STATUS.new;
  const text = [
    cur === "new" ? "🔔 New enquiry — Thathas Stay" : "📋 Enquiry — Thathas Stay",
    `👤 ${e.name}`,
    `📞 ${e.phone}`,
    `📍 ${e.location || "-"}`,
    `🛏 ${e.room_type || "-"}`,
    `💬 ${e.message || "-"}`,
    `🌐 ${e.source || "website"} · ${when(e.created_at)}`,
    `📌 Status: ${info.label}`,
  ].join("\n");

  // new → all three coloured; otherwise only the chosen one stays coloured
  const mk = (code) => {
    const a = ENQ[code];
    const active = cur === a.status;
    return btn(active ? `● ${a.label}` : a.label, `e:${e.id}:${code}`, cur === "new" || active ? a.style : undefined);
  };
  const row2 = [urlBtn("💬 WhatsApp", waLink(e.phone))];
  if (cur !== "new") row2.push(btn("↩ Reset", `e:${e.id}:n`));
  return { text, markup: kb([[mk("c"), mk("v"), mk("x")], row2]) };
}

// ── Reviews ────────────────────────────────────────────────
export function reviewCard(t, { deleted = false } = {}) {
  const head = deleted ? "🗑 Review rejected" : t.approved ? "⭐ Review (live on website)" : "⭐ Review waiting for approval";
  const text = [head, `👤 ${t.name}${t.designation ? " · " + t.designation : ""} — ${t.rating || 5}/5`, `“${clip(t.review, 600)}”`].join("\n");
  let rows;
  if (deleted) rows = [[btn("🗑 Rejected", "noop", "danger")]];
  else if (t.approved) rows = [[btn("● ✅ Approved", `r:${t.id}:a`, "success"), btn("↩ Hide", `r:${t.id}:h`)]];
  else rows = [[btn("✅ Approve", `r:${t.id}:a`, "success"), btn("🗑 Reject", `r:${t.id}:d`, "danger")]];
  return { text, markup: kb(rows) };
}

// ── Rooms ──────────────────────────────────────────────────
export const ROOM = {
  a: { status: "available", label: "Available", emoji: "🟢", style: "success" },
  o: { status: "occupied", label: "Occupied", emoji: "🔴", style: "danger" },
  r: { status: "reserved", label: "Reserved", emoji: "🟡", style: "primary" },
  m: { status: "maintenance", label: "Maintenance", emoji: "⚫" },
  c: { status: "cleaning", label: "Cleaning", emoji: "🔵" },
};
export const ROOM_EMOJI = Object.fromEntries(Object.values(ROOM).map((r) => [r.status, r.emoji]));

export function roomCard(r) {
  const text = [
    `🏠 Room ${r.room_number}`,
    `Type: ${r.room_type || "-"} · Floor: ${r.floor || "-"}`,
    `Price: ${inr(r.price_per_bed)} / bed`,
    `Beds free: ${r.beds_left ?? 0} of ${r.occupancy ?? 0}`,
    `Status: ${ROOM_EMOJI[r.status] || ""} ${r.status}`,
  ].join("\n");
  const mk = (code) => {
    const a = ROOM[code];
    const active = r.status === a.status;
    return btn(active ? `● ${a.emoji} ${a.label}` : `${a.emoji} ${a.label}`, `s:${r.id}:${code}`, active ? a.style : undefined);
  };
  return {
    text,
    markup: kb([
      [mk("a"), mk("o"), mk("r")],
      [mk("m"), mk("c")],
      [btn("➖ Bed", `b:${r.id}:-`), btn(`🛏 ${r.beds_left ?? 0}/${r.occupancy ?? 0}`, "noop"), btn("➕ Bed", `b:${r.id}:+`)],
      [btn("‹ Rooms", "rl:0"), btn("🏠 Menu", "m:main")],
    ]),
  };
}
