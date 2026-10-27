import { type ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ARTICLE_MAX_CHARS, buildArticleText } from "@/entities/message";

import { askText, Button, Dialog, Icon, type IconName } from "@/shared/ui";

import { type Edit, linkSelection, toggleLinePrefix, wrapSelection } from "../lib/text-format";

import styles from "./article-editor.module.css";

/** Обложка — картинка до 10 МБ (как articleEditor.js). */
export const ARTICLE_COVER_MAX_BYTES = 10 * 1024 * 1024;

export type ArticleDraft = { title: string; body: string; cover: File | null };

type Props = {
  /** Начальные заголовок, тело и обложка: правка своей статьи или возврат после неудачной отправки. */
  initial?: ArticleDraft | null;
  /** Правка: «Редактировать статью» и «Сохранить»; обложку не меняют — только текст. */
  editing?: boolean;
  /**
   * Опубликовать или сохранить; text — «# Заголовок\n\n…». Вернёт текст ошибки — окно
   * остаётся открытым с ней, иначе закрывается.
   */
  onSubmit: (draft: { text: string; title: string; body: string; cover: File | null }) => Promise<string | null> | string | null;
  onClose: () => void;
};

type Tool = { label: string; icon?: IconName; text?: string } & ({ wrap: string } | { line: string } | { link: true });

const TOOLS: Tool[] = [
  { label: "Жирный", text: "Ж", wrap: "**" },
  { label: "Курсив", text: "К", wrap: "*" },
  { label: "Код", icon: "Code", wrap: "`" },
  { label: "Заголовок", text: "H", line: "## " },
  { label: "Список", text: "•", line: "- " },
  { label: "Цитата", text: "❝", line: "> " },
  { label: "Ссылка", icon: "Link", link: true },
];

/** «Создать статью» / «Редактировать статью» — окно из articleEditor.js (ветка main2). */
export function ArticleEditor({ initial, editing = false, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  // Обложка и её адрес для превью; адреса освобождаем, когда окно закрылось (как use-uploads).
  const urls = useRef<string[]>([]);
  const withUrl = (file: File | null) => {
    if (!file) return null;
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { file, url };
  };
  const [coverState, setCoverState] = useState(() => (initial?.cover ? { file: initial.cover, url: URL.createObjectURL(initial.cover) } : null));
  const firstUrl = useRef(coverState?.url);
  const setCover = (file: File | null) => setCoverState(withUrl(file));
  const cover = coverState?.file ?? null;
  const coverUrl = coverState?.url ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const caret = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const list = urls.current;
    const first = firstUrl.current;
    return () => [...list, ...(first ? [first] : [])].forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // После кнопки панели — выделение там, где его оставила правка.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el || !caret.current) return;
    el.setSelectionRange(caret.current.start, caret.current.end);
    caret.current = null;
  }, [body]);

  const apply = (edit: Edit | null) => {
    if (!edit) return;
    caret.current = { start: edit.start, end: edit.end };
    setBody(edit.text);
    setError(null);
    textarea.current?.focus();
  };

  const runTool = async (tool: Tool) => {
    const el = textarea.current;
    const a = el?.selectionStart ?? body.length;
    const b = el?.selectionEnd ?? body.length;
    if ("wrap" in tool) return apply(wrapSelection(body, a, b, tool.wrap));
    if ("line" in tool) return apply(toggleLinePrefix(body, a, tool.line));
    const address = await askText("Адрес ссылки", { initial: "https://" });
    if (!address?.trim()) return el?.focus();
    if (a !== b && body.slice(a, b).trim()) return apply(linkSelection(body, a, b, address));
    const url = /^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`;
    const link = `[текст](${url.replace(/[\s)]/g, "")})`;
    // Без выделения — «[текст](адрес)» с выделенным «текст», чтобы сразу переписать.
    apply({ text: body.slice(0, a) + link + body.slice(b), start: a + 1, end: a + 1 + "текст".length });
  };

  const pickCover = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Обложка — только картинка");
    if (file.size > ARTICLE_COVER_MAX_BYTES) return setError("Файл слишком большой (макс. 10 МБ)");
    setError(null);
    setCover(file);
  };

  const text = buildArticleText(title, body);
  const tooLong = text.length > ARTICLE_MAX_CHARS;
  const submit = async () => {
    if (!title.trim() || busy) return;
    if (tooLong) return setError(`Статья слишком длинная — не больше ${ARTICLE_MAX_CHARS.toLocaleString("ru-RU")} знаков`);
    setBusy(true);
    setError(null);
    let failure: string | null;
    try {
      failure = await onSubmit({ text, title: title.trim(), body: body.trim(), cover: editing ? null : cover });
    } catch (err) {
      failure = err instanceof Error ? err.message : "Не удалось опубликовать";
    }
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  const idle = editing ? "Сохранить" : "Опубликовать";
  return (
    <Dialog title={editing ? "Редактировать статью" : "Создать статью"} onClose={busy ? () => {} : onClose} className={styles.dialog}>
      {editing ? null : coverUrl ? (
        <div className={styles.coverPreview}>
          <img src={coverUrl} alt="Обложка" />
          <button type="button" className={styles.coverRemove} title="Убрать обложку" aria-label="Убрать обложку" disabled={busy} onClick={() => setCover(null)}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ) : (
        <button type="button" className={styles.coverAdd} disabled={busy} onClick={() => coverInput.current?.click()}>
          <Icon name="Image" size={24} />
          <span>Добавить обложку</span>
        </button>
      )}
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} data-testid="article-cover" />
      <input
        className={styles.title}
        type="text"
        placeholder="Заголовок статьи"
        aria-label="Заголовок статьи"
        maxLength={200}
        autoFocus
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
      />
      <div className={styles.toolbar} role="toolbar" aria-label="Форматирование статьи">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            className={styles.tool}
            title={tool.label}
            aria-label={tool.label}
            // mousedown + preventDefault — чтобы поле не теряло выделение.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void runTool(tool)}
          >
            {tool.icon ? <Icon name={tool.icon} size={16} /> : tool.text}
          </button>
        ))}
      </div>
      <textarea
        ref={textarea}
        className={styles.body}
        placeholder="Напишите вашу статью…"
        aria-label="Текст статьи"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
      />
      {tooLong ? <p className={styles.counter}>{`${text.length.toLocaleString("ru-RU")} / ${ARTICLE_MAX_CHARS.toLocaleString("ru-RU")}`}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.footer}>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? "Публикация…" : idle}
        </Button>
      </div>
    </Dialog>
  );
}
