// Public (non-admin) experience: friendly menu + step-by-step enquiry, all in ONE message that edits itself.
import { btn, urlBtn, kb, inr, clip, waLink } from "./ui.js";

const ROOM_LABEL = { single: "Single room", double: "Double sharing", triple: "Three sharing", quad: "Four sharing" };
const ROOM_CHOICES = [
  ["single", "🛏 Single"],
  ["double", "🛏🛏 Double"],
  ["triple", "Three sharing"],
  ["quad", "Four sharing"],
  ["any", "🤔 Not sure"],
];
const FALLBACK_FACILITIES = [
  "📶 Free high-speed WiFi", "🧺 Washing machine", "👕 Iron box (on request)", "🍳 Shared gas kitchen",
  "🧹 Regular housekeeping", "📚 Quiet study area", "💡 Electricity included*", "🔐 Secure gated entry & CCTV",
];
const RULES = [
  "🚪 Entry for residents only — no visitors inside the premises",
  "🤫 Silence & discipline; quiet hours after 10 PM",
  "🚭 No alcohol, smoking or drugs",
  "🕚 Be inside before 11:00 PM",
  "🧼 Keep rooms clean; damage to property is charged",
  "🔁 Room changes only with management permission",
  "🧾 Rent paid is non-refundable",
];
const STATE_TTL = 30 * 60 * 1000;

export function createPublic({ tg, db, cfg, log = console, openView, showView, notifyNewEnquiry }) {
  const states = new Map(); // userId -> { step, data, chatId, msgId, ts }
  const recent = new Map(); // userId -> [timestamps] (anti-spam)

  const wa = (text) => waLink(cfg.waNumber, text);

  // ── views ──────────────────────────────────────────────────
  const menuView = () => ({
    text: [
      `🌿 Welcome to ${cfg.siteName}`,
      "Safe, comfortable PG in Malaparamba, Calicut.",
      "",
      "✨ Free WiFi · Housekeeping · Study area · Secure entry",
      `📞 ${cfg.phone}`,
      "",
      "How can we help you today?",
    ].join("\n"),
    markup: kb([
      [btn("📝 Enquire / Book a room", "u:enq", "primary")],
      [btn("🏠 Rooms & prices", "u:rooms"), btn("✨ Facilities", "u:fac")],
      [btn("📍 Location", "u:loc"), btn("📜 Rules", "u:rules")],
      [btn("❓ FAQs", "u:faq"), urlBtn("💬 WhatsApp", wa(`Hi ${cfg.siteName}! I'd like to know more about rooms.`))],
    ]),
  });
  const back = (extra) => [...(extra ? [extra] : []), btn("🏠 Menu", "u:menu")];

  async function roomsView() {
    let rooms = [];
    try {
      rooms = await db.select("rooms", { columns: "room_type,price_per_bed,status,beds_left,available" });
    } catch (e) {
      log.warn?.("public rooms:", e.message);
    }
    rooms = rooms.filter((r) => r.available !== false);
    const groups = Object.keys(ROOM_LABEL)
      .map((t) => {
        const rs = rooms.filter((r) => r.room_type === t);
        if (!rs.length) return null;
        const prices = rs.map((r) => Number(r.price_per_bed) || 0).filter(Boolean);
        const open = rs.filter((r) => r.status === "available").reduce((s, r) => s + (r.beds_left || 0), 0);
        return `• ${ROOM_LABEL[t]} — ${prices.length ? "from " + inr(Math.min(...prices)) + "/bed" : "ask for price"} — ${open > 0 ? `🟢 ${open} bed${open > 1 ? "s" : ""} free` : "🔴 full right now"}`;
      })
      .filter(Boolean);
    const text = groups.length
      ? `🏠 Rooms & prices (per bed / month)\n\n${groups.join("\n")}\n\nWiFi, housekeeping and electricity are included*.\nTap Enquire and we'll confirm availability.`
      : "🏠 Rooms & prices\n\nSingle, double, three and four sharing rooms available.\nTap Enquire for today's availability and prices.";
    return { text, markup: kb([[btn("📝 Enquire now", "u:enq", "primary")], back()]) };
  }

  async function facilitiesView() {
    let list = FALLBACK_FACILITIES;
    try {
      const rows = await db.select("facilities", { columns: "name,description", filters: [["active", "eq", "true"]], order: "created_at.asc" });
      if (rows.length) list = rows.map((f) => `• ${f.name}${f.description ? " — " + f.description : ""}`);
    } catch {
      /* fallback */
    }
    return { text: `✨ Facilities included\n\n${list.join("\n")}\n\n*Electricity included, subject to T&C.`, markup: kb([[btn("📝 Enquire now", "u:enq", "primary")], back()]) };
  }

  async function locationView() {
    let address = cfg.address, name = "Malaparamba", maps = cfg.mapsUrl;
    try {
      const rows = await db.select("locations", { columns: "name,address,latitude,longitude", filters: [["active", "eq", "true"]], order: "created_at.asc", limit: 1 });
      if (rows[0]) {
        name = rows[0].name || name;
        address = rows[0].address || address;
        if (rows[0].latitude && rows[0].longitude) maps = `https://www.google.com/maps/search/?api=1&query=${rows[0].latitude},${rows[0].longitude}`;
      }
    } catch {
      /* fallback */
    }
    return {
      text: `📍 ${cfg.siteName} — ${name}\n${address}\n\n🏥 3 min walk to IQRAA Hospital\n🎓 5 min to Providence Women's College`,
      markup: kb([[urlBtn("🗺 Open in Maps", maps)], [urlBtn("💬 WhatsApp", wa("Hi! I'd like directions / a visit to " + cfg.siteName))], back()]),
    };
  }

  const rulesView = () => ({
    text: `📜 House rules\n\n${RULES.join("\n")}\n\nFull details: ${cfg.siteUrl}/rules`,
    markup: kb([[btn("📝 Enquire now", "u:enq", "primary")], back()]),
  });

  async function faqView(i) {
    let faqs = [];
    try {
      faqs = await db.select("faqs", { columns: "question,answer", order: "order.asc", limit: 10 });
    } catch {
      /* none */
    }
    if (!faqs.length) return { text: "❓ FAQs\n\nAsk us anything on WhatsApp — we reply within minutes.", markup: kb([[urlBtn("💬 WhatsApp", wa("Hi! I have a question."))], back()]) };
    if (i === undefined || i === null || !faqs[i]) {
      return { text: "❓ Frequently asked questions — tap one:", markup: kb([...faqs.map((f, n) => [btn(clip(f.question, 50), `u:fq:${n}`)]), back()]) };
    }
    return { text: `❓ ${faqs[i].question}\n\n${faqs[i].answer}`, markup: kb([[btn("‹ All FAQs", "u:faq")], back()]) };
  }

  // ── enquiry flow ───────────────────────────────────────────
  const cancelRow = [btn("✖ Cancel", "u:cancel", "danger")];
  const getState = (uid) => {
    const s = states.get(uid);
    if (s && Date.now() - s.ts > STATE_TTL) {
      states.delete(uid);
      return null;
    }
    return s || null;
  };

  function stepView(st) {
    const d = st.data;
    switch (st.step) {
      case "name":
        return { text: "📝 Enquiry — step 1/4\n\nWhat's your name?\n(type it below)", markup: kb([cancelRow]) };
      case "phone":
        return { text: `📝 Enquiry — step 2/4\n\nThanks ${d.name}! What's your mobile number?\n(10 digits, e.g. 9746012345)`, markup: kb([cancelRow]) };
      case "room":
        return {
          text: "📝 Enquiry — step 3/4\n\nWhich room type do you prefer?",
          markup: kb([ROOM_CHOICES.slice(0, 2).map(([c, l]) => btn(l, `u:rt:${c}`)), ROOM_CHOICES.slice(2, 4).map(([c, l]) => btn(l, `u:rt:${c}`)), [btn(ROOM_CHOICES[4][1], "u:rt:any")], cancelRow]),
        };
      case "msg":
        return { text: "📝 Enquiry — step 4/4\n\nAnything you'd like to add? (move-in date, college/office, questions)\nType it below, or tap Skip.", markup: kb([[btn("Skip ›", "u:skip", "primary")], cancelRow]) };
      case "confirm":
        return {
          text: ["✅ Please confirm", "", `👤 ${d.name}`, `📞 ${d.phone}`, `🛏 ${d.room_label}`, `📍 ${d.location}`, `💬 ${d.message || "-"}`, "", "We'll contact you shortly on this number."].join("\n"),
          markup: kb([[btn("✅ Submit enquiry", "u:submit", "success")], [btn("✏️ Start over", "u:enq"), ...cancelRow]]),
        };
      default:
        return menuView();
    }
  }

  async function renderStep(st) {
    const view = stepView(st);
    await showView({ chat: { id: st.chatId }, message_id: st.msgId }, st.chatId, view, (newId) => {
      st.msgId = newId;
    });
  }

  async function startEnquiry(cq) {
    const chatId = cq.message?.chat?.id ?? cq.from.id;
    const st = { step: "name", data: {}, chatId, msgId: cq.message?.message_id, ts: Date.now() };
    states.set(cq.from.id, st);
    await tg.answer(cq.id);
    await renderStep(st);
  }

  const normalizePhone = (raw) => {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  };

  async function pickLocation(st) {
    try {
      const rows = await db.select("locations", { columns: "name", filters: [["active", "eq", "true"]], order: "created_at.asc", limit: 1 });
      st.data.location = rows[0]?.name || "Malaparamba";
    } catch {
      st.data.location = "Malaparamba";
    }
  }

  async function submit(cq) {
    const uid = cq.from.id;
    const st = getState(uid);
    if (!st || st.step !== "confirm") {
      await tg.answer(cq.id, "This enquiry expired — please start again.", true);
      return showView(cq.message, cq.from.id, menuView());
    }
    const now = Date.now();
    const hits = (recent.get(uid) || []).filter((t) => now - t < 3600_000);
    if (hits.length >= 3) {
      await tg.answer(cq.id, "You've sent a few enquiries already — we'll contact you soon. You can also WhatsApp us.", true);
      return;
    }
    const d = st.data;
    const who = cq.from.username ? `@${cq.from.username}` : `id ${uid}`;
    const note = `${d.message ? d.message + " " : ""}[via Telegram ${who}]`;
    let row;
    try {
      const rows = await db.insert("enquiries", [{ name: d.name, phone: d.phone, room_type: d.room_type, location: d.location, message: note, source: "telegram", status: "new" }]);
      row = rows[0];
    } catch (e) {
      log.error?.("public enquiry insert failed:", e.message);
      await tg.answer(cq.id, "Sorry, something went wrong. Please WhatsApp us instead.", true);
      return;
    }
    hits.push(now);
    recent.set(uid, hits);
    states.delete(uid);
    await tg.answer(cq.id, "✅ Sent!");
    await showView(cq.message, cq.from.id, {
      text: `🎉 Thank you, ${d.name}!\n\nYour enquiry is with our team. We'll call or WhatsApp you on ${d.phone} shortly.\n\nIn a hurry? Message us directly:`,
      markup: kb([[urlBtn("💬 Chat on WhatsApp", wa(`Hi ${cfg.siteName}! I'm ${d.name}. I just sent an enquiry on Telegram.`))], back()]),
    });
    if (row) await notifyNewEnquiry(row).catch((e) => log.error?.("notify failed:", e.message));
  }

  // ── entry points ───────────────────────────────────────────
  async function onCallback(cq) {
    const msg = cq.message;
    const chatId = msg?.chat?.id ?? cq.from.id;
    const [, a, b] = String(cq.data || "").split(":");
    try {
      if (a === "enq") return await startEnquiry(cq);
      if (a === "submit") return await submit(cq);
      if (a === "cancel") {
        states.delete(cq.from.id);
        await tg.answer(cq.id, "Cancelled");
        return await showView(msg, chatId, menuView());
      }
      const st = getState(cq.from.id);
      if (a === "rt" || a === "skip") {
        if (!st || (a === "rt" && st.step !== "room") || (a === "skip" && st.step !== "msg")) {
          await tg.answer(cq.id, "That step expired — let's start again.");
          return await showView(msg, chatId, menuView());
        }
        await tg.answer(cq.id);
        if (a === "rt") {
          st.data.room_type = b === "any" ? null : b;
          st.data.room_label = b === "any" ? "Not sure yet" : ROOM_LABEL[b] || b;
          await pickLocation(st);
          st.step = "msg";
        } else {
          st.data.message = "";
          st.step = "confirm";
        }
        st.ts = Date.now();
        st.msgId = msg?.message_id ?? st.msgId;
        return await renderStep(st);
      }

      await tg.answer(cq.id);
      if (a === "menu") {
        states.delete(cq.from.id);
        return await showView(msg, chatId, menuView());
      }
      if (a === "rooms") return await showView(msg, chatId, await roomsView());
      if (a === "fac") return await showView(msg, chatId, await facilitiesView());
      if (a === "loc") return await showView(msg, chatId, await locationView());
      if (a === "rules") return await showView(msg, chatId, rulesView());
      if (a === "faq") return await showView(msg, chatId, await faqView());
      if (a === "fq") return await showView(msg, chatId, await faqView(Number(b)));
    } catch (e) {
      log.error?.("public callback error:", e.message);
      await tg.answer(cq.id, "Something went wrong. Please try again.", true).catch(() => {});
    }
  }

  /** Non-admin message in a private chat. */
  async function onMessage(m) {
    const uid = m.from?.id;
    const chatId = m.chat.id;
    const text = (m.text || "").trim();
    const st = getState(uid);
    const del = () => tg.call("deleteMessage", { chat_id: chatId, message_id: m.message_id }).catch(() => {});

    try {
      if (st && !text.startsWith("/") && (st.step === "name" || st.step === "phone" || st.step === "msg")) {
        await del();
        st.ts = Date.now();
        if (st.step === "name") {
          const name = clip(text.replace(/\s+/g, " "), 60);
          if (name.length < 2) return;
          st.data.name = name;
          st.step = "phone";
        } else if (st.step === "phone") {
          const phone = normalizePhone(text);
          if (!phone) {
            const v = stepView(st);
            return await showView({ chat: { id: st.chatId }, message_id: st.msgId }, chatId, { text: "⚠️ That doesn't look like a valid 10-digit mobile number.\n\n" + v.text, markup: v.markup }, (id) => (st.msgId = id));
          }
          st.data.phone = phone;
          st.step = "room";
        } else {
          st.data.message = clip(text, 500);
          st.step = "confirm";
        }
        return await renderStep(st);
      }
      // anything else (/start, /menu, random text) → fresh welcome panel
      states.delete(uid);
      await openView(chatId, menuView(), m.message_id);
    } catch (e) {
      log.error?.("public message error:", e.message);
    }
  }

  return { onCallback, onMessage, menuView };
}
