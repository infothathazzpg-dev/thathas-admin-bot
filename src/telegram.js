export class TgError extends Error {
  constructor(method, code, description) {
    super(`${method}: ${code} ${description}`);
    this.code = code;
    this.description = description;
  }
}

export class Telegram {
  constructor(token, base = "https://api.telegram.org") {
    this.url = `${base}/bot${token}`;
  }

  async call(method, params = {}, timeoutMs = 15000) {
    let res;
    try {
      res = await fetch(`${this.url}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new TgError(method, 0, e.message);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok || !json || !json.ok) {
      throw new TgError(method, (json && json.error_code) || res.status, (json && json.description) || "request failed");
    }
    return json.result;
  }

  send(chatId, text, markup) {
    const p = { chat_id: chatId, text: String(text).slice(0, 3900), disable_web_page_preview: true };
    if (markup) p.reply_markup = markup;
    return this.call("sendMessage", p);
  }

  /** Edit a message; "message is not modified" is not an error for us. */
  async edit(chatId, messageId, text, markup) {
    const p = {
      chat_id: chatId,
      message_id: messageId,
      text: String(text).slice(0, 3900),
      disable_web_page_preview: true,
      reply_markup: markup || { inline_keyboard: [] },
    };
    try {
      return await this.call("editMessageText", p);
    } catch (e) {
      if (e instanceof TgError && /not modified/i.test(e.description)) return true;
      throw e;
    }
  }

  answer(id, text = "", alert = false) {
    return this.call("answerCallbackQuery", { callback_query_id: id, text: String(text).slice(0, 190), show_alert: alert });
  }
}
