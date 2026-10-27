// Статья (Premium): сообщение с type "article", текст — markdown, первая строка «# Заголовок»,
// обложка — первое вложение-картинка (server: message-send.service.ts, hasArticleTitle).
import type { Attachment } from "../model/attachment";
import type { Message } from "../model/types";

/** Длиннее статьи сервер не примет (у обычного сообщения — 4096). */
export const ARTICLE_MAX_CHARS = 20_000;

/** Первая строка статьи — «# Заголовок» (как проверяет сервер). */
export const ARTICLE_TITLE_RE = /^# \S/;

export const isArticle = (m: Pick<Message, "type"> | null | undefined) => m?.type === "article";

/** Заголовок и тело статьи; без строки «# …» в начале заголовка нет (старые записи). */
export function splitArticle(text: string | null | undefined): { title: string; body: string } {
  const value = (text ?? "").replace(/\r\n/g, "\n");
  const nl = value.indexOf("\n");
  const first = nl < 0 ? value : value.slice(0, nl);
  if (!ARTICLE_TITLE_RE.test(first)) return { title: "", body: value.trim() };
  return { title: first.slice(2).trim(), body: nl < 0 ? "" : value.slice(nl + 1).replace(/^\s*\n/, "").trimEnd() };
}

/** Текст статьи для сервера: «# Заголовок», пустая строка, тело. */
export function buildArticleText(title: string, body: string) {
  const head = `# ${title.replace(/\s+/g, " ").trim()}`;
  const rest = body.replace(/\r\n/g, "\n").trim();
  return rest ? `${head}\n\n${rest}` : head;
}

/** Обложка — первое вложение-картинка. */
export function articleCover(m: Pick<Message, "attachments">): Attachment | null {
  const atts = (m.attachments ?? []) as Attachment[];
  return atts.find((a) => a.kind === "image" && (a.url || a.thumbUrl)) ?? null;
}
