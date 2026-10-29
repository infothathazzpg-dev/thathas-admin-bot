# Thathas Stay — Telegram Admin Bot

A separate, **zero-dependency** Node bot (Node 18+) that controls the website's Supabase data from Telegram:
enquiries, reviews, rooms, rent. Colour-coded buttons: 🟦 primary · 🟩 success (approve) · 🟥 danger (reject).

## What it does
| Area | Buttons |
|---|---|
| Enquiry cards (from the website alerts and `/enquiries`) | ✅ Contacted (blue) · 🏠 Converted (green) · ❌ Reject (red) · ↩ Reset · 💬 WhatsApp |
| Reviews | ✅ Approve (green, goes live) · 🗑 Reject (red, deletes) · ↩ Hide |
| Rooms | tap a room → Available (green) / Occupied (red) / Reserved (blue) / Maintenance / Cleaning, ➖➕ beds |
| Rent | pending list with ✅ Mark paid (green) + 💬 WhatsApp reminder; Paid tab with Undo (red) |
| Dashboard | rooms, beds, tenants, enquiries, reviews, rent collected |
| Search | `/find name-or-phone` |

Only Telegram user IDs in `ADMIN_IDS` can use it. Everyone else is refused (and told their ID).

## One message, edited in place
Every button tap **edits the same message** — nothing stacks up. Typing a command (e.g. `/stats`) removes your command and the old
panel and posts one fresh panel. Enquiries and reviews open as a pager (‹ Prev · 2/5 · Next ›) inside one message.

## Public visitors (non-admins)
Anyone who messages the bot gets a friendly menu instead of "not authorised": 📝 Enquire / Book a room · 🏠 Rooms & prices
(live from your database) · ✨ Facilities · 📍 Location (+ Maps) · 📜 Rules · ❓ FAQs · 💬 WhatsApp.
**Enquire** is a 4-step guided form (name → mobile → room type → note → confirm), all in one message that edits itself.
It saves to the same `enquiries` table (source `telegram`) and posts a card with 🟦/🟩/🟥 buttons to your alert channel
(set `TELEGRAM_CHAT_ID`, or it DMs the admins). Limits: 3 enquiries per visitor per hour. Visitors can never see admin data.
Optional env: `PG_PHONE`, `PG_WA_NUMBER`, `PG_ADDRESS`, `PG_MAPS_URL`, `SITE_URL_PUBLIC`.

## Deploy on Render (free)
1. Put this folder in a GitHub repo (or a sub-folder of one).
2. Render → **New + → Web Service** → pick the repo.
   - Runtime **Node**, Build Command `echo ok` (nothing to install), Start Command `node src/index.js`, Instance **Free**.
   - Health Check Path: `/health`
3. Environment variables: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_IDS`, and `TELEGRAM_CHAT_ID` (your alert channel, so public enquiries land there).
4. Deploy. Logs should say `Bot @yourbot is running (polling)`.
5. **Keep it awake (free plan):** Render sleeps free services after 15 min without web traffic. The bot pings itself
   every 10 min, but also add a free monitor at uptimerobot.com → HTTP(s) check on `https://YOUR-SERVICE.onrender.com/health`, every 5 min.
6. Open the bot in Telegram → `/start`.

**Use the same bot token as the website.** On start the bot removes any old webhook and uses polling, so the buttons on the
website's channel alerts are handled by this bot. Run **only one** instance (two instances = Telegram error 409).
If you used the website's own `/api/telegram` webhook before, nothing else to do — the bot switches it off.

## Run locally / test
```bash
cp .env.example .env   # fill it, then:
export $(grep -v '^#' .env | sed 's/ *#.*//' | xargs) && npm start
npm test               # 32 checks against simulated Telegram + Supabase servers
```
Requires the `rent_payments` table (see the website's `supabase-migration-security.sql`).
