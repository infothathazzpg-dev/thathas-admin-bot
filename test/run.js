import assert from "node:assert/strict";
import { mockTelegram, mockSupabase } from "./mocks.js";
import { startBot } from "../src/index.js";
import { loadConfig, missingConfig } from "../src/config.js";

const ADMIN = 777;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 3000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = fn();
    if (v) return v;
    await sleep(20);
  }
  throw new Error("timeout waiting for: " + what);
}

const monthStart = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).slice(0, 7) + "-01";
const seed = () => ({
  enquiries: [
    { id: "enq-1", name: "Fathima", phone: "9746000001", location: "Malaparamba", room_type: "double", message: "Need a room", source: "website", status: "new", created_at: "2026-10-28T10:00:00Z" },
  ],
  testimonials: [
    { id: "rev-1", name: "Anjali", review: "Great place", rating: 5, designation: "Student", approved: false, created_at: "2026-10-28T09:00:00Z" },
    { id: "rev-2", name: "Meera", review: "Nice", rating: 4, approved: true, created_at: "2026-10-27T09:00:00Z" },
  ],
  rooms: [
    { id: "room-1", room_number: "R101", room_type: "single", occupancy: 1, beds_left: 1, price_per_bed: 5500, status: "available", floor: "Ground" },
    { id: "room-2", room_number: "R102", room_type: "double", occupancy: 2, beds_left: 0, price_per_bed: 4200, status: "occupied", floor: "Ground" },
  ],
  tenants: [
    { id: "ten-1", name: "Divya Thomas", phone: "9746000002", whatsapp: null, room: "101", rent: 4000, status: "active" },
    { id: "ten-2", name: "Sana M", phone: "9746000003", whatsapp: "9746000099", room: "102", rent: 5000, status: "active" },
    { id: "ten-3", name: "Old Tenant", phone: "9746000004", room: "103", rent: 3000, status: "checked-out" },
  ],
  rent_payments: [],
  room_status_history: [],
});

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    console.log("  ✗", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    "));
    process.exitCode = 1;
  }
}

const tgm = await mockTelegram();
const sb = await mockSupabase(seed());
const cfg = {
  ...loadConfig({}),
  token: "TESTTOKEN",
  tgBase: tgm.url,
  supabaseUrl: sb.url,
  supabaseKey: "service-key",
  admins: [String(ADMIN)],
  port: 0,
  pollTimeout: 1,
};
const quiet = { log() {}, warn() {}, error: (...a) => console.log("   [bot error]", ...a) };

console.log("Config");
await test("missingConfig reports absent vars", () => {
  assert.deepEqual(missingConfig(loadConfig({})), ["TELEGRAM_BOT_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_IDS"]);
  assert.deepEqual(missingConfig(loadConfig({ TELEGRAM_BOT_TOKEN: "t", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", ADMIN_IDS: "1, 2" })), []);
});

const bot = await startBot(cfg, quiet);
const text = (chat, from, t) => tgm.push({ message: { message_id: 1, chat: { id: chat, type: "private" }, from: { id: from, first_name: "Tester" }, text: t } });
const tap = (from, data, msgId = 55, chat = ADMIN) =>
  tgm.push({ callback_query: { id: "cb" + Math.random(), from: { id: from, first_name: "Tester" }, message: { message_id: msgId, chat: { id: chat }, text: "x" }, data } });
const lastEdit = () => tgm.of("editMessageText").at(-1);
const flat = (markup) => markup.inline_keyboard.flat();
const find = (markup, label) => flat(markup).find((b) => b.text.includes(label));

console.log("Startup");
await test("getMe, deleteWebhook and setMyCommands are called", async () => {
  await waitFor(() => tgm.of("setMyCommands").length, "setMyCommands");
  assert.equal(tgm.of("deleteWebhook").length >= 1, true);
  assert.equal(tgm.of("setMyCommands")[0].commands.some((c) => c.command === "menu"), true);
});
await test("health endpoint answers 200", async () => {
  const r = await fetch(`http://127.0.0.1:${bot.port}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

console.log("Security");
await test("non-admin command is refused and shows their id", async () => {
  text(999, 999, "/stats");
  const m = await waitFor(() => tgm.of("sendMessage").find((p) => p.chat_id === 999), "refusal");
  assert.match(m.text, /Not authorised/);
  assert.match(m.text, /999/);
});
await test("non-admin button tap is refused and changes nothing", async () => {
  tap(999, "e:enq-1:x");
  const a = await waitFor(() => tgm.of("answerCallbackQuery").find((p) => /not an admin/.test(p.text)), "alert");
  assert.equal(a.show_alert, true);
  assert.equal(sb.st.tables.enquiries[0].status, "new");
});

console.log("Panel");
await test("/menu shows the admin panel with a blue primary button", async () => {
  text(ADMIN, ADMIN, "/menu");
  const m = await waitFor(() => tgm.of("sendMessage").find((p) => p.chat_id === ADMIN && /admin panel/.test(p.text)), "menu");
  assert.equal(find(m.reply_markup, "Dashboard").style, "primary");
  assert.ok(find(m.reply_markup, "Rooms") && find(m.reply_markup, "Rent") && find(m.reply_markup, "Enquiries") && find(m.reply_markup, "Reviews"));
});
await test("Dashboard button edits the menu into stats", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "m:stats");
  await waitFor(() => tgm.of("editMessageText").length > n, "stats edit");
  assert.match(lastEdit().text, /Dashboard/);
  assert.match(lastEdit().text, /Active tenants: 2/);
  assert.match(lastEdit().text, /Reviews pending: 1/);
});

console.log("Enquiry buttons (colours)");
await test("/enquiries sends a card: Contacted=blue, Converted=green, Reject=red", async () => {
  text(ADMIN, ADMIN, "/enquiries");
  const m = await waitFor(() => tgm.of("sendMessage").find((p) => /New enquiry/.test(p.text)), "card");
  assert.equal(find(m.reply_markup, "Contacted").style, "primary");
  assert.equal(find(m.reply_markup, "Converted").style, "success");
  assert.equal(find(m.reply_markup, "Reject").style, "danger");
  assert.ok(flat(m.reply_markup).some((b) => b.url === "https://wa.me/919746000001"));
});
await test("tap Contacted → DB updated, only Contacted stays blue", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "e:enq-1:c");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.enquiries[0].status, "contacted");
  const e = lastEdit();
  assert.match(e.text, /Status: ✅ Contacted/);
  assert.equal(find(e.reply_markup, "Contacted").style, "primary");
  assert.equal(find(e.reply_markup, "Converted").style, undefined);
  assert.equal(find(e.reply_markup, "Reject").style, undefined);
  assert.ok(find(e.reply_markup, "Reset"));
  assert.equal(tgm.of("answerCallbackQuery").at(-1).text, "✅ Contacted");
});
await test("tap Reject → status closed, Reject is the red button", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "e:enq-1:x");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.enquiries[0].status, "closed");
  assert.equal(find(lastEdit().reply_markup, "Rejected").style, "danger");
  assert.equal(find(lastEdit().reply_markup, "Contacted").style, undefined);
});
await test("tap Converted → green button", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "e:enq-1:v");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.enquiries[0].status, "converted");
  assert.equal(find(lastEdit().reply_markup, "Converted").style, "success");
});
await test("Reset → back to new with all three coloured", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "e:enq-1:n");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.enquiries[0].status, "new");
  const mk = lastEdit().reply_markup;
  assert.deepEqual([find(mk, "Contacted").style, find(mk, "Converted").style, find(mk, "Reject").style], ["primary", "success", "danger"]);
});
await test("tapping the same button twice ('message is not modified') does not break anything", async () => {
  tap(ADMIN, "e:enq-1:c");
  await waitFor(() => sb.st.tables.enquiries[0].status === "contacted", "contacted");
  const sends = tgm.of("sendMessage").length;
  tap(ADMIN, "e:enq-1:c");
  await waitFor(() => tgm.of("answerCallbackQuery").filter((a) => a.text === "✅ Contacted").length >= 2, "second answer");
  await sleep(300); // give a (buggy) fallback time to fire
  assert.equal(tgm.of("sendMessage").length, sends, "must not fall back to sending a new message");
});
await test("unknown enquiry id gives an alert, no crash", async () => {
  tap(ADMIN, "e:nope:c");
  await waitFor(() => tgm.of("answerCallbackQuery").some((a) => /not found/.test(a.text || "")), "not found alert");
});

console.log("Reviews");
await test("pending review card: Approve green, Reject red", async () => {
  tap(ADMIN, "m:rev");
  const m = await waitFor(() => tgm.of("sendMessage").find((p) => /waiting for approval/.test(p.text)), "review card");
  assert.equal(find(m.reply_markup, "Approve").style, "success");
  assert.equal(find(m.reply_markup, "Reject").style, "danger");
});
await test("Approve → approved=true, green ● Approved", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "r:rev-1:a");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.testimonials.find((t) => t.id === "rev-1").approved, true);
  assert.equal(find(lastEdit().reply_markup, "Approved").style, "success");
});
await test("Hide → approved=false again", async () => {
  tap(ADMIN, "r:rev-1:h");
  await waitFor(() => sb.st.tables.testimonials.find((t) => t.id === "rev-1").approved === false, "hidden");
});
await test("Reject → row deleted, red 'Rejected' button", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "r:rev-1:d");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.testimonials.some((t) => t.id === "rev-1"), false);
  assert.equal(find(lastEdit().reply_markup, "Rejected").style, "danger");
});

console.log("Rooms");
await test("Rooms list shows status emoji buttons", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "m:rooms");
  await waitFor(() => tgm.of("editMessageText").length > n, "rooms");
  const mk = lastEdit().reply_markup;
  assert.ok(find(mk, "🟢 R101"));
  assert.ok(find(mk, "🔴 R102"));
});
await test("open room → status buttons: active coloured", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "ro:room-1");
  await waitFor(() => tgm.of("editMessageText").length > n, "room");
  assert.equal(find(lastEdit().reply_markup, "Available").style, "success");
  assert.equal(find(lastEdit().reply_markup, "Occupied").style, undefined);
});
await test("set Occupied → DB + history, red button", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "s:room-1:o");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  assert.equal(sb.st.tables.rooms[0].status, "occupied");
  assert.equal(sb.st.tables.room_status_history.at(-1).new_status, "occupied");
  assert.equal(sb.st.tables.room_status_history.at(-1).changed_by, "telegram-bot");
  assert.equal(find(lastEdit().reply_markup, "Occupied").style, "danger");
});
await test("beds +/- stay within 0..occupancy", async () => {
  tap(ADMIN, "b:room-1:-");
  await waitFor(() => sb.st.tables.rooms[0].beds_left === 0, "0 beds");
  tap(ADMIN, "b:room-1:-");
  await sleep(150);
  assert.equal(sb.st.tables.rooms[0].beds_left, 0);
  tap(ADMIN, "b:room-1:+");
  await waitFor(() => sb.st.tables.rooms[0].beds_left === 1, "1 bed");
  tap(ADMIN, "b:room-1:+");
  await sleep(150);
  assert.equal(sb.st.tables.rooms[0].beds_left, 1);
});
await test("/room 102 available (typed command)", async () => {
  text(ADMIN, ADMIN, "/room 102 available");
  await waitFor(() => tgm.of("sendMessage").some((p) => /Room R102 → available/.test(p.text)), "reply");
  assert.equal(sb.st.tables.rooms[1].status, "available");
});

console.log("Rent");
await test("rent view lists only active tenants, Pay buttons are green", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "m:rent");
  await waitFor(() => tgm.of("editMessageText").length > n, "rent");
  const mk = lastEdit().reply_markup;
  assert.match(lastEdit().text, /Pending ₹9,000/);
  assert.ok(find(mk, "Divya") && find(mk, "Sana"));
  assert.equal(find(mk, "Old Tenant"), undefined);
  assert.equal(find(mk, "Divya").style, "success");
  assert.equal(find(mk, "Pending (2)").style, "danger");
  assert.ok(flat(mk).some((b) => b.url && b.url.startsWith("https://wa.me/919746000099"))); // uses whatsapp number when set
});
await test("Mark paid → rent_payments row, tenant leaves pending list", async () => {
  const n = tgm.of("editMessageText").length;
  tap(ADMIN, "p:ten-1:p");
  await waitFor(() => tgm.of("editMessageText").length > n, "edit");
  const row = sb.st.tables.rent_payments.find((r) => r.tenant_id === "ten-1");
  assert.equal(row.status, "paid");
  assert.equal(row.amount, 4000);
  assert.equal(row.month, monthStart);
  assert.equal(find(lastEdit().reply_markup, "Divya"), undefined);
  assert.match(lastEdit().text, /Collected ₹4,000 · Pending ₹5,000/);
});
await test("Paid tab + Undo → back to pending (no duplicate rows)", async () => {
  tap(ADMIN, "rt:d");
  await waitFor(() => find(lastEdit().reply_markup, "↩ Divya"), "paid tab");
  assert.equal(find(lastEdit().reply_markup, "↩ Divya").style, "danger");
  tap(ADMIN, "p:ten-1:u");
  await waitFor(() => sb.st.tables.rent_payments.find((r) => r.tenant_id === "ten-1").status === "pending", "undo");
  assert.equal(sb.st.tables.rent_payments.filter((r) => r.tenant_id === "ten-1").length, 1);
});
await test("/paid sana (typed) marks paid", async () => {
  text(ADMIN, ADMIN, "/paid sana");
  await waitFor(() => tgm.of("sendMessage").some((p) => /Sana M: ₹5,000 marked paid/.test(p.text)), "reply");
});

console.log("Search & misc");
await test("/find by name and by phone digits", async () => {
  text(ADMIN, ADMIN, "/find fathima");
  await waitFor(() => tgm.of("sendMessage").some((p) => /Fathima — 9746000001/.test(p.text)), "name hit");
  text(ADMIN, ADMIN, "/find 746000002");
  await waitFor(() => tgm.of("sendMessage").some((p) => /Divya Thomas \(R101\)/.test(p.text)), "phone hit");
});
await test("plain text in private chat opens the menu; unknown command is polite", async () => {
  const n = tgm.of("sendMessage").length;
  text(ADMIN, ADMIN, "hello");
  await waitFor(() => tgm.of("sendMessage").length > n, "menu");
  text(ADMIN, ADMIN, "/whatever");
  await waitFor(() => tgm.of("sendMessage").some((p) => /Unknown command/.test(p.text)), "unknown");
});
await test("callback data from the website's alert (same format) works", async () => {
  // website cards use e:<id>:c|v|x and r:<id>:a|d — already covered above; here: stale message without message object
  tgm.push({ callback_query: { id: "cbx", from: { id: ADMIN }, data: "e:enq-1:v" } });
  await waitFor(() => sb.st.tables.enquiries[0].status === "converted", "converted");
});

console.log("Resilience");
await test("database outage → friendly error alert, bot keeps polling", async () => {
  const saved = sb.st.tables.rooms;
  delete sb.st.tables.rooms; // simulates a missing table / DB error
  tap(ADMIN, "m:rooms");
  await waitFor(() => tgm.of("answerCallbackQuery").length && true, "answered");
  await sleep(200);
  sb.st.tables.rooms = saved;
  tap(ADMIN, "m:main");
  const n = tgm.of("editMessageText").length;
  await waitFor(() => tgm.of("editMessageText").length >= n, "still alive");
  text(ADMIN, ADMIN, "/menu");
  await sleep(200);
  assert.ok(bot.state.handled > 10);
});
await test("callback returns an alert when the DB is down", async () => {
  const saved = sb.st.tables.enquiries;
  delete sb.st.tables.enquiries;
  tap(ADMIN, "e:enq-1:c");
  await waitFor(() => tgm.of("answerCallbackQuery").some((a) => a.show_alert && /❌/.test(a.text)), "error alert");
  sb.st.tables.enquiries = saved;
});

await bot.stop();
await tgm.close();
await sb.close();
console.log(`\n${passed} checks passed${process.exitCode ? " — WITH FAILURES" : ""}`);
