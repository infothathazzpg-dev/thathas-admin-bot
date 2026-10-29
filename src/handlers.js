import {
  btn, urlBtn, kb, inr, clip, todayIST, monthStartIST, monthLabel, waLink,
  ENQ, ROOM, ROOM_EMOJI, enquiryCard, reviewCard, roomCard,
} from "./ui.js";

const HELP = [
  "🤖 Thathas Stay admin bot",
  "",
  "Tap /menu for the button panel, or type:",
  "/stats – dashboard",
  "/enquiries – new enquiries (with buttons)",
  "/rooms – rooms by status",
  "/due – rent pending this month",
  "/paid <name or room> – mark rent paid",
  "/room <number> <status> – e.g. /room 101 occupied",
  "/find <name or phone> – search enquiries & tenants",
].join("\n");

const PAGE = 24;

export function createHandlers({ tg, db, cfg, log = console }) {
  const isAdmin = (id) => cfg.admins.includes(String(id));

  // ── views: each returns { text, markup } ───────────────────
  const mainView = () => ({
    text: `🛠 ${cfg.siteName} admin panel\nChoose an option:`,
    markup: kb([
      [btn("📊 Dashboard", "m:stats", "primary")],
      [btn("🔔 Enquiries", "m:enq"), btn("⭐ Reviews", "m:rev")],
      [btn("🏠 Rooms", "m:rooms"), btn("💰 Rent", "m:rent")],
      [btn("🔍 Search", "m:find"), btn("❓ Help", "m:help")],
    ]),
  });

  const backRow = (extra) => [...(extra ? [extra] : []), btn("🏠 Menu", "m:main")];

  async function statsView() {
    const ms = monthStartIST();
    const [rooms, tenants, enq, paid, revs] = await Promise.all([
      db.select("rooms", { columns: "status,occupancy,beds_left" }),
      db.select("tenants", { columns: "id,rent,status" }),
      db.select("enquiries", { columns: "status,created_at" }),
      db.select("rent_payments", { columns: "amount", filters: [["month", "eq", ms], ["status", "eq", "paid"]] }).catch(() => null),
      db.select("testimonials", { columns: "approved" }),
    ]);
    const active = tenants.filter((t) => t.status === "active");
    const totalBeds = rooms.reduce((s, r) => s + (r.occupancy || 0), 0);
    const freeBeds = rooms.reduce((s, r) => s + (r.beds_left || 0), 0);
    const cnt = (st) => rooms.filter((r) => r.status === st).length;
    const today = todayIST();
    const todayEnq = enq.filter((e) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(e.created_at)) === today).length;
    const expected = active.reduce((s, t) => s + (t.rent || 0), 0);
    const collected = paid ? paid.reduce((s, p) => s + (p.amount || 0), 0) : null;
    const text = [
      "📊 Dashboard",
      `🏠 Rooms ${rooms.length}: 🟢 ${cnt("available")} · 🔴 ${cnt("occupied")} · 🟡 ${cnt("reserved")} · ⚫ ${cnt("maintenance")} · 🔵 ${cnt("cleaning")}`,
      `🛏 Beds: ${totalBeds - freeBeds}/${totalBeds} occupied`,
      `🧑 Active tenants: ${active.length}`,
      `🔔 Enquiries: ${enq.filter((e) => e.status === "new").length} new · ${todayEnq} today`,
      `⭐ Reviews pending: ${revs.filter((r) => !r.approved).length}`,
      collected === null ? "💰 Rent: table not created yet" : `💰 Rent ${monthLabel(ms)}: ${inr(collected)} of ${inr(expected)}`,
    ].join("\n");
    return { text, markup: kb([[btn("🔄 Refresh", "m:stats", "primary"), btn("🏠 Menu", "m:main")]]) };
  }

  async function enquiryMenuView() {
    const all = await db.select("enquiries", { columns: "status" });
    const n = (s) => all.filter((e) => e.status === s).length;
    return {
      text: "🔔 Enquiries — choose a list (latest 5 are shown with action buttons):",
      markup: kb([
        [btn(`🆕 New (${n("new")})`, "q:n", "primary")],
        [btn(`✅ Contacted (${n("contacted")})`, "q:c"), btn(`🏠 Converted (${n("converted")})`, "q:v")],
        [btn(`❌ Rejected (${n("closed")})`, "q:x")],
        backRow(),
      ]),
    };
  }

  async function roomsView(page = 0) {
    const rooms = await db.select("rooms", { columns: "id,room_number,status", order: "room_number.asc" });
    if (!rooms.length) return { text: "No rooms found.", markup: kb([backRow()]) };
    rooms.sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
    const pages = Math.max(1, Math.ceil(rooms.length / PAGE));
    const p = Math.min(Math.max(0, page), pages - 1);
    const slice = rooms.slice(p * PAGE, p * PAGE + PAGE);
    const rows = [];
    for (let i = 0; i < slice.length; i += 3) {
      rows.push(slice.slice(i, i + 3).map((r) => btn(`${ROOM_EMOJI[r.status] || "▫️"} ${r.room_number}`, `ro:${r.id}`)));
    }
    const nav = [];
    if (p > 0) nav.push(btn("‹ Prev", `rl:${p - 1}`));
    if (p < pages - 1) nav.push(btn("Next ›", `rl:${p + 1}`));
    rows.push(nav, backRow());
    const cnt = (st) => rooms.filter((r) => r.status === st).length;
    return {
      text: `🏠 Rooms (${rooms.length})\n🟢 ${cnt("available")} available · 🔴 ${cnt("occupied")} occupied · 🟡 ${cnt("reserved")} reserved · ⚫ ${cnt("maintenance")} · 🔵 ${cnt("cleaning")}\nTap a room to change its status or beds.`,
      markup: kb(rows),
    };
  }

  async function getRoom(id) {
    const rows = await db.select("rooms", { filters: [["id", "eq", id]] });
    return rows[0] || null;
  }

  async function rentView(mode = "p") {
    const ms = monthStartIST();
    let tenants, pays;
    try {
      [tenants, pays] = await Promise.all([
        db.select("tenants", { columns: "id,name,room,rent,phone,whatsapp", filters: [["status", "eq", "active"]], order: "name.asc" }),
        db.select("rent_payments", { filters: [["month", "eq", ms]] }),
      ]);
    } catch (e) {
      return { text: "💰 Rent tracker isn't ready.\nRun the rent_payments SQL in Supabase first.\n(" + clip(e.message, 120) + ")", markup: kb([backRow()]) };
    }
    const paidMap = new Map(pays.filter((p) => p.status === "paid").map((p) => [p.tenant_id, p]));
    const pending = tenants.filter((t) => !paidMap.has(t.id));
    const paid = tenants.filter((t) => paidMap.has(t.id));
    const due = pending.reduce((s, t) => s + (t.rent || 0), 0);
    const got = paid.reduce((s, t) => s + (paidMap.get(t.id).amount || 0), 0);
    const list = (mode === "d" ? paid : pending).slice(0, 12);
    const rows = [[btn(`⏳ Pending (${pending.length})`, "rt:p", mode === "p" ? "danger" : undefined), btn(`✅ Paid (${paid.length})`, "rt:d", mode === "d" ? "success" : undefined)]];
    for (const t of list) {
      const label = `${clip(t.name, 16)}${t.room ? " R" + t.room : ""} · ${inr(mode === "d" ? paidMap.get(t.id).amount : t.rent)}`;
      if (mode === "d") rows.push([btn(`↩ ${label}`, `p:${t.id}:u`, "danger")]);
      else {
        const msg = `Hi ${t.name}, gentle reminder from ${cfg.siteName}: your rent of ${inr(t.rent)} for ${monthLabel(ms)} is pending. Thank you!`;
        rows.push([urlBtn("💬", waLink(t.whatsapp || t.phone, msg)), btn(`✅ ${label}`, `p:${t.id}:p`, "success")]);
      }
    }
    const more = (mode === "d" ? paid : pending).length - list.length;
    rows.push([btn("🔄 Refresh", `rt:${mode}`), btn("🏠 Menu", "m:main")]);
    return {
      text: `💰 Rent — ${monthLabel(ms)}\nCollected ${inr(got)} · Pending ${inr(due)}\n${mode === "d" ? "Tap a name to undo a payment." : "Tap ✅ to mark paid, 💬 to remind on WhatsApp."}${more > 0 ? `\n(+${more} more not shown)` : ""}${list.length ? "" : "\n\nNothing here 🎉"}`,
      markup: kb(rows),
    };
  }

  // ── sending helpers ────────────────────────────────────────
  async function sendView(chatId, view) {
    return tg.send(chatId, view.text, view.markup);
  }

  async function showView(msg, fallbackChatId, view) {
    if (msg && msg.chat && msg.message_id) {
      try {
        await tg.edit(msg.chat.id, msg.message_id, view.text, view.markup);
        return;
      } catch (e) {
        log.warn?.("edit failed, sending new message:", e.message);
      }
    }
    await tg.send(msg?.chat?.id ?? fallbackChatId, view.text, view.markup);
  }

  async function sendEnquiryCards(chatId, code = "n") {
    const a = ENQ[code] || ENQ.n;
    const rows = await db.select("enquiries", { filters: [["status", "eq", a.status]], order: "created_at.desc", limit: 5 });
    if (!rows.length) return tg.send(chatId, `No ${a.status === "closed" ? "rejected" : a.status} enquiries 🎉`);
    for (const e of rows.reverse()) {
      const c = enquiryCard(e);
      await tg.send(chatId, c.text, c.markup);
    }
  }

  async function sendReviewCards(chatId) {
    const rows = await db.select("testimonials", { filters: [["approved", "eq", "false"]], order: "created_at.desc", limit: 5 });
    if (!rows.length) return tg.send(chatId, "No reviews waiting for approval 🎉");
    for (const t of rows.reverse()) {
      const c = reviewCard(t);
      await tg.send(chatId, c.text, c.markup);
    }
  }

  // ── actions ────────────────────────────────────────────────
  async function setRoomStatus(id, code) {
    const a = ROOM[code];
    if (!a) return null;
    const rows = await db.update("rooms", [["id", "eq", id]], { status: a.status });
    if (!rows[0]) return null;
    await db.insert("room_status_history", [{ room_id: id, new_status: a.status, changed_by: "telegram-bot" }]).catch(() => {});
    return rows[0];
  }

  async function setRent(tenantId, paid) {
    const ts = await db.select("tenants", { columns: "id,name,rent", filters: [["id", "eq", tenantId]] });
    const t = ts[0];
    if (!t) return null;
    const ms = monthStartIST();
    const existing = await db.select("rent_payments", { filters: [["tenant_id", "eq", tenantId], ["month", "eq", ms]] });
    const amount = existing[0]?.amount || t.rent || 0;
    await db.upsert(
      "rent_payments",
      [{ tenant_id: tenantId, month: ms, amount, status: paid ? "paid" : "pending", paid_on: paid ? todayIST() : null }],
      "tenant_id,month",
    );
    return { tenant: t, amount };
  }

  // ── callbacks (button taps) ────────────────────────────────
  async function onCallback(cq) {
    if (!isAdmin(cq.from?.id)) {
      await tg.answer(cq.id, "⛔ You are not an admin of this bot.", true).catch(() => {});
      return;
    }
    const msg = cq.message;
    const chatId = msg?.chat?.id ?? cq.from.id;
    const [kind, a, b] = String(cq.data || "").split(":");

    try {
      switch (kind) {
        case "noop":
          return await tg.answer(cq.id);

        case "m": {
          await tg.answer(cq.id);
          if (a === "main") return await showView(msg, chatId, mainView());
          if (a === "stats") return await showView(msg, chatId, await statsView());
          if (a === "enq") return await showView(msg, chatId, await enquiryMenuView());
          if (a === "rooms") return await showView(msg, chatId, await roomsView(0));
          if (a === "rent") return await showView(msg, chatId, await rentView("p"));
          if (a === "rev") return await sendReviewCards(chatId);
          if (a === "find") return await tg.send(chatId, "🔍 Send:  /find <name or phone>\nExample: /find fathima");
          if (a === "help") return await tg.send(chatId, HELP);
          return;
        }

        case "q":
          await tg.answer(cq.id);
          return await sendEnquiryCards(chatId, a);

        case "e": {
          const info = ENQ[b];
          if (!info) return await tg.answer(cq.id, "Unknown action");
          const rows = await db.update("enquiries", [["id", "eq", a]], { status: info.status });
          if (!rows[0]) return await tg.answer(cq.id, "Enquiry not found (deleted?)", true);
          await tg.answer(cq.id, info.label);
          const c = enquiryCard(rows[0]);
          return await showView(msg, chatId, c);
        }

        case "r": {
          if (b === "d") {
            const rows = await db.delete("testimonials", [["id", "eq", a]]);
            await tg.answer(cq.id, "🗑 Rejected");
            return await showView(msg, chatId, reviewCard(rows[0] || { id: a, name: "(deleted)", review: "" }, { deleted: true }));
          }
          const approved = b === "a";
          const rows = await db.update("testimonials", [["id", "eq", a]], { approved });
          if (!rows[0]) return await tg.answer(cq.id, "Review not found", true);
          await tg.answer(cq.id, approved ? "✅ Approved — now live" : "↩ Hidden from website");
          return await showView(msg, chatId, reviewCard(rows[0]));
        }

        case "rl":
          await tg.answer(cq.id);
          return await showView(msg, chatId, await roomsView(Number(a) || 0));

        case "ro": {
          const r = await getRoom(a);
          if (!r) return await tg.answer(cq.id, "Room not found", true);
          await tg.answer(cq.id);
          return await showView(msg, chatId, roomCard(r));
        }

        case "s": {
          const r = await setRoomStatus(a, b);
          if (!r) return await tg.answer(cq.id, "Could not update room", true);
          await tg.answer(cq.id, `Room ${r.room_number} → ${r.status}`);
          return await showView(msg, chatId, roomCard(r));
        }

        case "b": {
          const r = await getRoom(a);
          if (!r) return await tg.answer(cq.id, "Room not found", true);
          const max = r.occupancy ?? 0;
          const next = Math.min(max, Math.max(0, (r.beds_left ?? 0) + (b === "+" ? 1 : -1)));
          const rows = await db.update("rooms", [["id", "eq", a]], { beds_left: next });
          await tg.answer(cq.id, `Beds free: ${next}/${max}`);
          return await showView(msg, chatId, roomCard(rows[0] || { ...r, beds_left: next }));
        }

        case "rt":
          await tg.answer(cq.id);
          return await showView(msg, chatId, await rentView(a === "d" ? "d" : "p"));

        case "p": {
          const res = await setRent(a, b === "p");
          if (!res) return await tg.answer(cq.id, "Tenant not found", true);
          await tg.answer(cq.id, b === "p" ? `✅ ${res.tenant.name}: ${inr(res.amount)} paid` : `↩ ${res.tenant.name}: marked pending`);
          return await showView(msg, chatId, await rentView(b === "p" ? "p" : "d"));
        }

        default:
          return await tg.answer(cq.id, "Unknown action");
      }
    } catch (e) {
      log.error?.("callback error:", e.message);
      await tg.answer(cq.id, "❌ " + clip(e.message, 150), true).catch(() => {});
    }
  }

  // ── typed commands ─────────────────────────────────────────
  async function onMessage(m) {
    const text = (m.text || "").trim();
    const chatId = m.chat.id;
    if (!isAdmin(m.from?.id)) {
      if (text.startsWith("/")) await tg.send(chatId, `⛔ Not authorised.\nYour Telegram user id is ${m.from?.id}.\nAsk the owner to add it to ADMIN_IDS.`).catch(() => {});
      return;
    }
    if (!text.startsWith("/")) {
      if (m.chat.type === "private") await sendView(chatId, mainView());
      return;
    }
    const parts = text.split(/\s+/);
    const cmd = parts[0].split("@")[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case "/start":
        case "/menu":
          return void (await sendView(chatId, mainView()));
        case "/help":
          return void (await tg.send(chatId, HELP));
        case "/stats":
          return void (await sendView(chatId, await statsView()));
        case "/enquiries":
          return void (await sendEnquiryCards(chatId, "n"));
        case "/reviews":
          return void (await sendReviewCards(chatId));
        case "/rooms":
          return void (await sendView(chatId, await roomsView(0)));
        case "/due":
        case "/rent":
          return void (await sendView(chatId, await rentView("p")));

        case "/paid": {
          const q = args.join(" ").trim().toLowerCase();
          if (!q) return void (await tg.send(chatId, "Usage: /paid <tenant name or room>"));
          const ts = await db.select("tenants", { columns: "id,name,room", filters: [["status", "eq", "active"]] });
          const hits = ts.filter((t) => (t.name || "").toLowerCase().includes(q) || String(t.room || "").toLowerCase() === q.replace(/^r/, ""));
          if (!hits.length) return void (await tg.send(chatId, `No active tenant matches "${q}".`));
          if (hits.length > 1) return void (await tg.send(chatId, "Be more specific:\n" + hits.slice(0, 8).map((t) => `• ${t.name}${t.room ? " (R" + t.room + ")" : ""}`).join("\n")));
          const res = await setRent(hits[0].id, true);
          return void (await tg.send(chatId, `✅ ${res.tenant.name}: ${inr(res.amount)} marked paid`));
        }

        case "/room": {
          const num = (args[0] || "").toLowerCase().replace(/^r/, "");
          const code = Object.keys(ROOM).find((c) => ROOM[c].status === (args[1] || "").toLowerCase());
          if (!num || !code) return void (await tg.send(chatId, "Usage: /room <number> <status>\nstatus: " + Object.values(ROOM).map((r) => r.status).join(", ")));
          const rooms = await db.select("rooms", { columns: "id,room_number" });
          const hits = rooms.filter((r) => String(r.room_number).toLowerCase().replace(/^r/, "") === num);
          if (!hits.length) return void (await tg.send(chatId, `Room "${args[0]}" not found.`));
          if (hits.length > 1) return void (await tg.send(chatId, "That room number exists in more than one branch — use /rooms."));
          const r = await setRoomStatus(hits[0].id, code);
          return void (await tg.send(chatId, r ? `✅ Room ${r.room_number} → ${r.status}` : "❌ Update failed."));
        }

        case "/find": {
          const q = args.join(" ").trim().toLowerCase();
          if (q.length < 3) return void (await tg.send(chatId, "Usage: /find <at least 3 letters or digits>"));
          const digits = q.replace(/\D/g, "");
          const match = (x) => (x.name || "").toLowerCase().includes(q) || (digits.length >= 4 && String(x.phone || "").replace(/\D/g, "").includes(digits));
          const [enq, ten] = await Promise.all([
            db.select("enquiries", { columns: "name,phone,status,location,created_at", order: "created_at.desc", limit: 500 }),
            db.select("tenants", { columns: "name,phone,room,status,rent", limit: 500 }),
          ]);
          const he = enq.filter(match);
          const ht = ten.filter(match);
          if (!he.length && !ht.length) return void (await tg.send(chatId, `Nothing found for "${q}".`));
          const out = [];
          if (ht.length) out.push("🧑 Tenants", ...ht.slice(0, 6).map((x) => `• ${x.name}${x.room ? " (R" + x.room + ")" : ""} — ${x.phone} — ${x.status}`));
          if (he.length) out.push("🔔 Enquiries", ...he.slice(0, 6).map((x) => `• ${x.name} — ${x.phone} — ${x.status} — ${x.location || "-"}`));
          return void (await tg.send(chatId, out.join("\n")));
        }

        default:
          return void (await tg.send(chatId, "Unknown command. Send /menu or /help"));
      }
    } catch (e) {
      log.error?.("command error:", e.message);
      await tg.send(chatId, "❌ " + clip(e.message, 150)).catch(() => {});
    }
  }

  async function handleUpdate(u) {
    if (u.callback_query) return onCallback(u.callback_query);
    if (u.message && u.message.text) return onMessage(u.message);
  }

  return { handleUpdate, isAdmin };
}
