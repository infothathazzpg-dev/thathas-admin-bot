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

export function enquiryCard(e, nav) {
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
    return btn(active ? `● ${a.label}` : a.label, `e:${e.id}:${code}${nav ? ":" + nav.ctx : ""}`, cur === "new" || active ? a.style : undefined);
  };
  const row2 = [urlBtn("💬 WhatsApp", waLink(e.phone))];
  if (cur !== "new") row2.push(btn("↩ Reset", `e:${e.id}:n${nav ? ":" + nav.ctx : ""}`));
  return { text, markup: kb([[mk("c"), mk("v"), mk("x")], row2, ...(nav ? nav.rows : [])]) };
}

// ── Reviews ────────────────────────────────────────────────
export function reviewCard(t, { deleted = false, nav } = {}) {
  const head = deleted ? "🗑 Review rejected" : t.approved ? "⭐ Review (live on website)" : "⭐ Review waiting for approval";
  const text = [head, `👤 ${t.name}${t.designation ? " · " + t.designation : ""} — ${t.rating || 5}/5`, `“${clip(t.review, 600)}”`].join("\n");
  const c = nav ? ":" + nav.ctx : "";
  let rows;
  if (deleted) rows = [[btn("🗑 Rejected", "noop", "danger")]];
  else if (t.approved) rows = [[btn("● ✅ Approved", `r:${t.id}:a${c}`, "success"), btn("↩ Hide", `r:${t.id}:h${c}`)]];
  else rows = [[btn("✅ Approve", `r:${t.id}:a${c}`, "success"), btn("🗑 Reject", `r:${t.id}:d${c}`, "danger")]];
  return { text, markup: kb([...rows, ...(nav ? nav.rows : [])]) };
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

// ── Panel versions (one message that you page through) ─────
export const ENQ_FILTERS = [
  ["n", "🆕"],
  ["c", "✅"],
  ["v", "🏠"],
  ["x", "❌"],
  ["a", "All"],
];

/** counts: { n, c, v, x, a } */
export function enquiryPanelCard(e, { f, i, total, counts, moved = false }) {
  const base = enquiryCard(e);
  const cur = e.status || "new";
  const mk = (code) => {
    const a = ENQ[code];
    const active = cur === a.status;
    return btn(active ? `● ${a.label}` : a.label, `E:${e.id}:${code}:${f}:${i}`, cur === "new" || active ? a.style : undefined);
  };
  const tabs = ENQ_FILTERS.map(([code, label]) => btn(`${f === code ? "● " : ""}${label} ${counts[code] ?? 0}`, `q:${code}:0`, f === code ? "primary" : undefined));
  const row2 = [urlBtn("💬 WhatsApp", waLink(e.phone))];
  if (cur !== "new") row2.push(btn("↩ Reset", `E:${e.id}:n:${f}:${i}`));
  return { text: base.text, markup: kb([tabs, [mk("c"), mk("v"), mk("x")], row2, pager(`q:${f}`, i, total, moved), [btn("🏠 Menu", "m:main")]]) };
}

export function pager(prefix, i, total, moved) {
  const prev = Math.min(i - 1, total - 1);
  const next = moved ? i : i + 1;
  const row = [];
  if (prev >= 0) row.push(btn("‹ Prev", `${prefix}:${prev}`));
  row.push(btn(moved ? "✓ updated" : `${i + 1}/${total}`, "noop"));
  if (next < total) row.push(btn("Next ›", `${prefix}:${next}`));
  return row;
}

export function reviewPanelCard(t, { i, total, moved = false, deleted = false }) {
  const base = reviewCard(t, { deleted });
  let actions;
  if (deleted) actions = [btn("🗑 Rejected", "noop", "danger")];
  else if (t.approved) actions = [btn("● ✅ Approved", `R:${t.id}:a:${i}`, "success"), btn("↩ Hide", `R:${t.id}:h:${i}`)];
  else actions = [btn("✅ Approve", `R:${t.id}:a:${i}`, "success"), btn("🗑 Reject", `R:${t.id}:d:${i}`, "danger")];
  return { text: base.text, markup: kb([actions, pager("rv", i, total, moved), [btn("🏠 Menu", "m:main")]]) };
}

// ── Pager (one item per message, edited in place) ──────────
/**
 * list: current items, id: item being shown, i: index it was shown at,
 * go(idx) → callback_data to open item idx, back: [{text,data}] extra buttons for the last row.
 * If the item left the list (e.g. enquiry moved to "contacted"), prev/next still point at its neighbours.
 */
export function pagerRows(list, id, i, go, back, ctxPrefix = "") {
  const pos = list.findIndex((x) => x.id === id);
  let prev = null, next = null, label;
  if (pos >= 0) {
    prev = pos > 0 ? pos - 1 : null;
    next = pos < list.length - 1 ? pos + 1 : null;
    label = `${pos + 1}/${list.length}`;
  } else {
    prev = list.length && i > 0 ? Math.min(i - 1, list.length - 1) : null;
    next = i < list.length ? i : null;
    label = `${list.length} left`;
  }
  const row = [];
  if (prev !== null) row.push(btn("‹ Prev", go(prev)));
  row.push(btn(label, "noop"));
  if (next !== null) row.push(btn("Next ›", go(next)));
  return { ctx: `${ctxPrefix}${pos >= 0 ? pos : i}`, rows: [row, back.map((b) => btn(b.text, b.data))] };
}
