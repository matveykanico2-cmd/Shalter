import { useQueryClient } from "@tanstack/react-query";
import { type ClipboardEvent, type KeyboardEvent, type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { chatCache } from "@/entities/chat";
import { type Message, messagePreview, stripCustomEmoji } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";
import { Icon } from "@/shared/ui";

import { type OutgoingAttachment, saveDraft, sendTyping } from "../api/send-message";
import { chunks, MAX_ATTACHMENTS_PER_MESSAGE } from "../lib/files";
import { useSendMessage } from "../model/use-send-message";
import { useUploads } from "../model/use-uploads";

import { AttachButton } from "./attach-button";
import { ChecklistDialog } from "./checklist-dialog";
import styles from "./composer.module.css";
import { PollDialog } from "./poll-dialog";
import { type MediaSendChoice, SendMediaDialog } from "./send-media-dialog";
import { UploadStrip } from "./upload-strip";

export type ComposerHandle = {
  /** Файлы, брошенные на чат, — в окно отправки. */
  attach: (files: File[]) => void;
};

// Как public/js/components/composer.js: «печатает» не чаще раза в 2,5 с, черновик на
// сервер — когда набор затих.
const TYPING_PING_MS = 2500;
const DRAFT_SAVE_MS = 600;
const MAX_ROWS_HEIGHT = 200;

type Props = {
  chatId: string;
  meId: string;
  channel: boolean;
  initialDraft: string;
  placeholder?: string;
  replyTo: Message | null;
  replyToName: string | null;
  onCancelReply: () => void;
  /** Своё сообщение отправлено — лента прокручивается вниз. */
  onSent?: () => void;
  /** Правка своего сообщения: в поле его текст, Enter — сохранить. */
  editing?: Message | null;
  onSaveEdit?: (m: Message, text: string) => void;
  onCancelEdit?: () => void;
  /** Стрелка вверх в пустом поле — править последнее своё сообщение. */
  onEditLast?: () => void;
  ref?: Ref<ComposerHandle>;
};

/** Поле ввода: текст, ответ на сообщение, Enter — отправить, Shift+Enter — новая строка. */
export function Composer(props: Props) {
  const { chatId, meId, channel, initialDraft, placeholder = "Сообщение", replyTo, replyToName, onCancelReply, onSent } = props;
  const { editing = null, onSaveEdit, onCancelEdit, onEditLast, ref } = props;
  const client = useQueryClient();
  const send = useSendMessage(chatId, meId, channel);
  const [text, setText] = useState(initialDraft);
  // Начали править — в поле текст сообщения, а набранное раньше ждёт конца правки.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [heldDraft, setHeldDraft] = useState("");
  if ((editing?.id ?? null) !== editingId) {
    if (editing && !editingId) setHeldDraft(text);
    setText(editing ? (editing.text ?? "") : heldDraft);
    setEditingId(editing?.id ?? null);
  }
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const uploads = useUploads(chatId);
  const [picked, setPicked] = useState<File[] | null>(null);
  const [creating, setCreating] = useState<"poll" | "checklist" | null>(null);
  // Подпись к файлам — то, что в поле, когда загрузка закончилась.
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);
  const lastTyping = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`;
  }, [text]);

  // Выбрали «Ответить» или «Изменить» — сразу печатаем.
  useEffect(() => {
    if (replyTo || editing) textarea.current?.focus();
  }, [replyTo, editing]);

  useEffect(() => () => clearTimeout(draftTimer.current), []);

  const attach = (files: File[]) => {
    if (!editing && files.length) setPicked(files);
  };
  useImperativeHandle(ref, () => ({ attach }));

  const scheduleDraft = (value: string) => {
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      chatCache.setDraft(client, chatId, value);
      saveDraft(chatId, value).catch(() => {});
    }, DRAFT_SAVE_MS);
  };

  const onChange = (value: string) => {
    setText(value);
    setError(null);
    if (editing) return;
    if (value.trim() && Date.now() - lastTyping.current > TYPING_PING_MS) {
      lastTyping.current = Date.now();
      sendTyping(chatId).catch(() => {});
    }
    scheduleDraft(value);
  };

  const submit = () => {
    const value = text.trim();
    if (editing) {
      if (!value) return;
      if (value !== (editing.text ?? "").trim()) onSaveEdit?.(editing, value);
      onCancelEdit?.();
      return;
    }
    if (!value) return;
    const reply = replyTo;
    setText("");
    onCancelReply();
    clearTimeout(draftTimer.current);
    chatCache.setDraft(client, chatId, "");
    saveDraft(chatId, "").catch(() => {});
    onSent?.();
    send(value, reply).catch((err: unknown) => {
      // Не ушло — текст возвращаем, если человек ещё не начал новое сообщение.
      setText((current) => current || value);
      setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
    });
  };

  // Как composer.js: выбранное сначала в окне отправки, потом загрузка, потом сообщение
  // (по 10 вложений; подпись — у первого).
  const sendMedia = async ({ picks, spoiler }: MediaSendChoice) => {
    setPicked(null);
    setError(null);
    const { uploaded, error: uploadError, total } = await uploads.upload(picks);
    if (uploadError) {
      setError(
        uploaded.length
          ? `Загружено ${uploaded.length} из ${total} — часть файлов не отправилась: ${uploadError}`
          : uploadError || `Не удалось загрузить файл${total > 1 ? "ы" : ""}`
      );
    }
    if (!uploaded.length) return;
    const caption = latestText.current.trim();
    const reply = replyTo;
    const atts: OutgoingAttachment[] = uploaded.map((a) => (spoiler && (a.kind === "image" || a.kind === "video") ? { ...a, spoiler: true } : a));
    setText("");
    onCancelReply();
    clearTimeout(draftTimer.current);
    chatCache.setDraft(client, chatId, "");
    saveDraft(chatId, "").catch(() => {});
    onSent?.();
    for (const [i, part] of chunks(atts, MAX_ATTACHMENTS_PER_MESSAGE).entries()) {
      await send(i === 0 ? caption : "", i === 0 ? reply : null, part).catch((err: unknown) => {
        setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
      });
    }
  };

  // Опрос, чек-лист, кубик — отдельным сообщением; текст в поле остаётся.
  const sendAttachment = (caption: string, attachment: OutgoingAttachment) => {
    const reply = replyTo;
    onCancelReply();
    onSent?.();
    send(caption, reply, [attachment]).catch((err: unknown) => {
      setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
    });
  };

  // Картинка или файл из буфера обмена — в окно отправки.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length || editing) return;
    e.preventDefault();
    attach(files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape" && (replyTo || editing)) {
      e.preventDefault();
      if (editing) onCancelEdit?.();
      else onCancelReply();
      return;
    }
    if (e.key === "ArrowUp" && onEditLast && !editing && !text && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onEditLast();
    }
  };

  return (
    <div className={styles.composer}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {editing ? (
        <div className={styles.banner}>
          <Icon name="Edit" size={16} />
          <div className={styles.bannerBody}>
            <span className={styles.bannerLabel}>Изменение</span>
            <span className={styles.bannerText}>{stripCustomEmoji(messagePreview(editing)) || "Сообщение"}</span>
          </div>
          <button type="button" className={styles.iconButton} title="Отменить изменение" onClick={onCancelEdit}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ) : replyTo ? (
        <div className={styles.banner}>
          <Icon name="Reply" size={16} />
          <div className={styles.bannerBody}>
            <span className={styles.bannerLabel}>{replyToName ? `Ответ ${replyToName}` : "Ответ"}</span>
            <span className={styles.bannerText}>{stripCustomEmoji(messagePreview(replyTo)) || "Сообщение"}</span>
          </div>
          <button type="button" className={styles.iconButton} title="Отменить ответ" onClick={onCancelReply}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ) : null}
      <UploadStrip tiles={uploads.tiles} onCancel={uploads.cancel} />
      <div className={styles.row}>
        <div className={styles.field}>
          {editing ? (
            <span className={styles.attachGap} />
          ) : (
            <AttachButton
              onFiles={attach}
              onPoll={() => setCreating("poll")}
              onChecklist={() => setCreating("checklist")}
              onDice={(emoji) => sendAttachment("", { kind: "dice", meta: { emoji } })}
            />
          )}
          <textarea
          ref={textarea}
          className={styles.input}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        </div>
        <button type="button" className={styles.send} title={editing ? "Сохранить" : "Отправить"} disabled={!text.trim()} onClick={submit}>
          <Icon name={editing ? "Check" : "Send"} size={22} />
        </button>
      </div>
      {creating === "poll" ? (
        <PollDialog
          onClose={() => setCreating(null)}
          onCreate={({ question, options, correctIndex, multiple }) =>
            sendAttachment(question, { kind: "poll", meta: { options, votes: options.map(() => 0), voterIds: options.map(() => []), correctIndex, multiple } })
          }
        />
      ) : null}
      {creating === "checklist" ? (
        <ChecklistDialog
          onClose={() => setCreating(null)}
          onCreate={({ title, items, othersCanMark, othersCanAdd }) =>
            sendAttachment(title, { kind: "checklist", meta: { items: items.map((text, i) => ({ id: i + 1, text })), othersCanMark, othersCanAdd } })
          }
        />
      ) : null}
      {picked ? <SendMediaDialog files={picked} onSend={(choice) => void sendMedia(choice)} onClose={() => setPicked(null)} /> : null}
    </div>
  );
}
