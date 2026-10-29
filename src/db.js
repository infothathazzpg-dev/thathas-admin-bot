/** Minimal Supabase (PostgREST) client using fetch — no dependencies. */
export class Supabase {
  constructor(url, serviceKey) {
    this.base = `${url}/rest/v1`;
    this.headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  }

  async req(method, table, { params, body, prefer } = {}) {
    const qs = params && params.toString() ? `?${params.toString()}` : "";
    const headers = { ...this.headers };
    if (prefer) headers.prefer = prefer;
    let res;
    try {
      res = await fetch(`${this.base}/${table}${qs}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch (e) {
      throw new Error(`Database unreachable (${e.message})`);
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text).message || text;
      } catch {
        /* keep raw */
      }
      const err = new Error(`${table}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : [];
  }

  static filterParams(params, filters = []) {
    for (const [col, op, val] of filters) {
      params.append(col, `${op}.${Array.isArray(val) ? `(${val.join(",")})` : val}`);
    }
  }

  select(table, { columns = "*", filters = [], order, limit } = {}) {
    const p = new URLSearchParams();
    p.set("select", columns);
    Supabase.filterParams(p, filters);
    if (order) p.set("order", order);
    if (limit) p.set("limit", String(limit));
    return this.req("GET", table, { params: p });
  }

  update(table, filters, patch) {
    const p = new URLSearchParams();
    Supabase.filterParams(p, filters);
    return this.req("PATCH", table, { params: p, body: patch, prefer: "return=representation" });
  }

  delete(table, filters) {
    const p = new URLSearchParams();
    Supabase.filterParams(p, filters);
    return this.req("DELETE", table, { params: p, prefer: "return=representation" });
  }

  insert(table, rows) {
    return this.req("POST", table, { body: rows, prefer: "return=representation" });
  }

  upsert(table, rows, onConflict) {
    const p = new URLSearchParams();
    p.set("on_conflict", onConflict);
    return this.req("POST", table, { params: p, body: rows, prefer: "resolution=merge-duplicates,return=representation" });
  }
}
