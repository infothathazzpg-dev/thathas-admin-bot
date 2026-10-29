import http from "node:http";

const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fake Telegram ───────────────────────────────────────────
export async function mockTelegram() {
  const st = { calls: [], updates: [], nextUpdateId: 1, nextMsgId: 100, lastEdit: new Map(), failEditNotModified: true };
  const server = http.createServer(async (req, res) => {
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)/);
    const body = JSON.parse((await readBody(req)) || "{}");
    const reply = (obj, code = 200) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (!m) return reply({ ok: false }, 404);
    const method = m[2];
    st.calls.push({ method, params: body });
    if (method === "getUpdates") {
      const until = Date.now() + (body.timeout || 1) * 1000;
      while (Date.now() < until) {
        const out = st.updates.filter((u) => u.update_id >= (body.offset || 0));
        if (out.length) return reply({ ok: true, result: out });
        await sleep(15);
      }
      return reply({ ok: true, result: [] });
    }
    if (method === "getMe") return reply({ ok: true, result: { id: 1, username: "test_bot" } });
    if (method === "sendMessage") return reply({ ok: true, result: { message_id: st.nextMsgId++, chat: { id: body.chat_id } } });
    if (method === "editMessageText") {
      const key = `${body.chat_id}:${body.message_id}`;
      const sig = JSON.stringify([body.text, body.reply_markup]);
      if (st.failEditNotModified && st.lastEdit.get(key) === sig) {
        return reply({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }, 400);
      }
      st.lastEdit.set(key, sig);
      return reply({ ok: true, result: true });
    }
    return reply({ ok: true, result: true });
  });
  await new Promise((r) => server.listen(0, r));
  return {
    st,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
    push(update) {
      update.update_id = st.nextUpdateId++;
      st.updates.push(update);
    },
    of: (method) => st.calls.filter((c) => c.method === method).map((c) => c.params),
  };
}

// ── Fake Supabase (PostgREST subset) ────────────────────────
export async function mockSupabase(tables) {
  const st = { tables, log: [], seq: 1 };
  const matches = (row, [col, op, val]) => {
    const v = row[col];
    switch (op) {
      case "eq": return String(v) === val;
      case "neq": return String(v) !== val;
      case "lt": return String(v) < val;
      case "gt": return String(v) > val;
      case "in": return val.replace(/^\(|\)$/g, "").split(",").includes(String(v));
      default: throw new Error("mock: unsupported op " + op);
    }
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/);
    const text = await readBody(req);
    const reply = (obj, code = 200) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    if (!m) return reply({ message: "bad path" }, 404);
    if (!req.headers.apikey || !String(req.headers.authorization).startsWith("Bearer ")) return reply({ message: "no key" }, 401);
    const table = m[1];
    if (!st.tables[table]) return reply({ message: `relation "public.${table}" does not exist` }, 404);
    st.log.push(`${req.method} ${table}${u.search}`);
    const rows = st.tables[table];
    const reserved = new Set(["select", "order", "limit", "on_conflict"]);
    const filters = [];
    for (const [k, v] of u.searchParams) {
      if (reserved.has(k)) continue;
      const i = v.indexOf(".");
      filters.push([k, v.slice(0, i), v.slice(i + 1)]);
    }
    const hit = (r) => filters.every((f) => matches(r, f));
    const body = text ? JSON.parse(text) : undefined;

    if (req.method === "GET") {
      let out = rows.filter(hit);
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(u.searchParams.get("limit"));
      if (limit) out = out.slice(0, limit);
      return reply(out);
    }
    if (req.method === "PATCH") {
      const out = rows.filter(hit);
      out.forEach((r) => Object.assign(r, body));
      return reply(out);
    }
    if (req.method === "DELETE") {
      const out = rows.filter(hit);
      st.tables[table] = rows.filter((r) => !hit(r));
      return reply(out);
    }
    if (req.method === "POST") {
      const arr = Array.isArray(body) ? body : [body];
      const conflict = u.searchParams.get("on_conflict");
      const out = [];
      for (const item of arr) {
        if (conflict) {
          const cols = conflict.split(",");
          const ex = rows.find((r) => cols.every((c) => String(r[c]) === String(item[c])));
          if (ex) { Object.assign(ex, item); out.push(ex); continue; }
        }
        const row = { id: `gen-${st.seq++}`, created_at: new Date().toISOString(), ...item };
        rows.push(row);
        out.push(row);
      }
      return reply(out, 201);
    }
    return reply({ message: "unsupported" }, 405);
  });
  await new Promise((r) => server.listen(0, r));
  return { st, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
