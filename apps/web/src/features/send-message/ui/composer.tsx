import { useQueryClient } from "@tanstack/react-query";
import { type ClipboardEvent, type KeyboardEvent, type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { chatCache } from "@/entities/chat";
import { gameAttachmentFor, openGamesCatalog } from "@/entities/game";
import { MediaPreview, type Message, messagePreview, splitArticle, stripCustomEmoji } from "@/entities/message";
import { useSession } from "@/entities/session";
import { useSettings } from "@/entities/settings";
import { ContactPicker, type PickedContact } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { getPosition, type LatLng } from "@/shared/lib/geolocation";
import { blurThumb } from "@/shared/lib/image";
import { isRecordingSupported, type RecordMode } from "@/shared/lib/media/recorder";
import { askText, dismissToast, EmojiText, Icon, toast } from "@/shared/ui";

import { hugoCheck, type OutgoingAttachment, saveDraft, scheduleMessage, searchGames, type SendOptions, sendTyping } from "../api/send-message";
import { chunks, MAX_ATTACHMENTS_PER_MESSAGE } from "../lib/files";
import { applyAll, applyFix, cleanMatches, type ProofMatch } from "../lib/hugo";
import { startLiveLocationSharing } from "../lib/live-location";
import { splitLongText } from "../lib/long-text";
import { playSendPlane } from "../lib/send-plane";
import { type BotCommand, parseSlashCommand, suggestSlashCommands } from "../lib/slash-commands";
import { type Edit, formatShortcut, linkSelection, quoteSelection, wrapSelection } from "../lib/text-format";
import { typingPingDue } from "../lib/typing";
import { useSendMessage } from "../model/use-send-message";
import { useUploads } from "../model/use-uploads";

import { type ArticleDraft, ArticleEditor } from "./article-editor";
import { AttachButton } from "./attach-button";
import { BotCommandsButton } from "./bot-commands-button";
import { ChecklistDialog } from "./checklist-dialog";
import styles from "./composer.module.css";
import { EmojiButton } from "./emoji-picker";
import { FormatBar,type FormatKind } from "./format-bar";
import { HugoPanel, type HugoState } from "./hugo-panel";
import { LocationPicker, type PickedLocation } from "./location-picker";
import { MemeDialog } from "./meme-dialog";
import { PaintDialog } from "./paint-dialog";
import { PollDialog } from "./poll-dialog";
import { RecordButtons } from "./record-buttons";
import { type HoldControl, RecordingBar, type RecordingDone } from "./recording-bar";
import { ScheduleDialog } from "./schedule-dialog";
import { ScheduledList } from "./scheduled-list";
import { SendButton } from "./send-button";
import { type MediaSendChoice, SendMediaDialog } from "./send-media-dialog";
import { StickerButton } from "./sticker-picker";
import { type MentionUser, type Suggestion,SuggestMenu } from "./suggest-menu";
import { UploadStrip } from "./upload-strip";

export type ComposerHandle = {
  /** Файлы, брошенные на чат, — в окно отправки. */
  attach: (files: File[]) => void;
  /** Ответ с выделенной частью текста — цитата «> …» в начало поля. */
  quote: (text: string) => void;
  /** Текст сообщением как есть — нажатая кнопка бота (onKeyboardAction). */
  sendText: (text: string) => void;
};

// Как public/js/components/composer.js: «печатает» не чаще раза в 2,5 с, черновик на
// сервер — когда набор затих.
const TYPING_PING_MS = 2500;
const DRAFT_SAVE_MS = 600;
const MAX_ROWS_HEIGHT = 200;

const NO_PEOPLE: PickedContact[] = [];
const NO_IDS: string[] = [];
const NO_MENTIONS: MentionUser[] = [];
const NO_COMMANDS: BotCommand[] = [];
const MENTION_LIMIT = 6;
const COMMAND_ERROR_MS = 2500;

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
  /** Текст перед отправкой — например, /settings в чате с Shalter AI открывает настройки ИИ. */
  onBeforeSend?: (text: string) => void;
  /** Правка своего сообщения: в поле его текст, Enter — сохранить. */
  editing?: Message | null;
  onSaveEdit?: (m: Message, text: string) => void;
  onCancelEdit?: () => void;
  /** Стрелка вверх в пустом поле — править последнее своё сообщение. */
  onEditLast?: () => void;
  /** Открытая тема группы — сообщения уходят в неё. */
  topicId?: string | null;
  /** Кого можно отправить контактом, кроме своих контактов (участники чата), и кого нельзя. */
  people?: readonly PickedContact[];
  excludeContacts?: readonly string[];
  /** Эффекты при отправке — в личке. */
  allowEffects?: boolean;
  /** «Отправить, когда будет в сети» — в личке с человеком. */
  allowWhenOnline?: boolean;
  /**
   * Ответ в ветке (threadPanel.js: Composer без черновика): сообщение уходит в ветку,
   * в ленту чата не попадает, отложенной отправки нет; onSent — ответ сервера.
   */
  thread?: { rootId: string; onSent: (m: Message) => void; postId?: string };
  /** Участники с @именем — подсказки при наборе «@». */
  mentions?: readonly MentionUser[];
  /** Команды бота: кнопка «/» и подсказки при наборе «/». */
  botCommands?: readonly BotCommand[];
  /** Админ группы с анонимными админами — «Отправить от имени группы». */
  canPostAnonymously?: boolean;
  /** Сообщения или комментарии здесь платные, и платит пишущий. */
  paid?: { stars: number; kind: "message" | "comment" } | null;
  /** Можно «Размыть за звёзды» в окне отправки фото. */
  canPostPaid?: boolean;
  /** «Печатает…» другим — нет, если пишешь не участником (комментарий до вступления в обсуждение). */
  typing?: boolean;
  /** Чат с Shalter AI: без записи голосовых, а пока бот пишет — «стоп» вместо «Отправить». */
  ai?: { generating: boolean; onStop: () => void } | null;
  ref?: Ref<ComposerHandle>;
};

/** Поле ввода: текст, ответ на сообщение, Enter — отправить, Shift+Enter — новая строка. */
export function Composer(props: Props) {
  const { chatId, meId, channel, initialDraft, replyTo, replyToName, onCancelReply, onSent, paid } = props;
  const placeholder = props.placeholder ?? (paid ? `${paid.kind === "comment" ? "Комментарий" : "Сообщение"} · ${paid.stars} ⭐` : "Сообщение");
  const mentions = props.mentions ?? NO_MENTIONS;
  const botCommands = props.botCommands ?? NO_COMMANDS;
  const { onSaveEdit, onCancelEdit, onEditLast, ref } = props;
  // Статью правят в её окне (заголовок и текст), а не в поле ввода.
  const editingArticle = props.editing?.type === "article" ? props.editing : null;
  const editing = editingArticle ? null : (props.editing ?? null);
  const isPremium = !!useSession().data?.user?.isPremium;
  const client = useQueryClient();
  const thread = props.thread;
  const sendOne = useSendMessage(chatId, meId, channel, props.topicId, thread?.rootId, thread?.postId);
  const send: typeof sendOne = async (...args) => {
    const message = await sendOne(...args);
    playSendPlane(textarea.current);
    thread?.onSent(message);
    return message;
  };
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

  // «От имени группы» — для одного сообщения, как postAsChat в composer.js, но и для
  // вложений: голосовое или кубик от админа не должны раскрывать, кто он. Ref — потому
  // что запись и геолокация отправляются из замыкания, созданного раньше.
  const [asGroup, setAsGroupState] = useState(false);
  const asGroupRef = useRef(false);
  const setAsGroup = (on: boolean) => {
    asGroupRef.current = on;
    setAsGroupState(on);
  };
  const takeAsGroup = (): SendOptions => {
    if (!asGroupRef.current) return {};
    setAsGroup(false);
    return { anonymous: true };
  };

  const textarea = useRef<HTMLTextAreaElement>(null);
  const uploads = useUploads(chatId);
  const [picked, setPicked] = useState<File[] | null>(null);
  const [creating, setCreating] = useState<"poll" | "checklist" | "contact" | "meme" | "paint" | null>(null);
  const [hugo, setHugo] = useState<HugoState | null>(null);
  // Окно статьи; initial — черновик, вернувшийся после неудачной отправки.
  const [article, setArticle] = useState<{ initial: ArticleDraft | null } | null>(null);
  const [scheduling, setScheduling] = useState<"dialog" | "list" | null>(null);
  const [placePicker, setPlacePicker] = useState<{ reason: string; resolve: (value: PickedLocation) => void } | null>(null);
  const [recording, setRecording] = useState<{ mode: RecordMode; hold: boolean } | null>(null);
  const holdControlRef = useRef<HoldControl | null>(null);
  const transcribe = !!useSettings().data?.voiceTranscription;
  const [canRecord] = useState(isRecordingSupported);
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

  // Выбрали «Ответить» или «Изменить» — сразу печатаем; ветку открыли — тоже.
  useEffect(() => {
    if (replyTo || editing) textarea.current?.focus();
  }, [replyTo, editing]);
  const threadOpen = !!thread;
  useEffect(() => {
    if (threadOpen) textarea.current?.focus();
  }, [threadOpen]);

  // Ушли из чата раньше, чем черновик сохранился, — сохраняем сразу, а не теряем.
  const pendingDraft = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      clearTimeout(draftTimer.current);
      pendingDraft.current?.();
    },
    []
  );

  const attach = (files: File[]) => {
    if (!editing && files.length) setPicked(files);
  };

  const scheduleDraft = (value: string) => {
    if (thread) return;
    clearTimeout(draftTimer.current);
    const save = () => {
      pendingDraft.current = null;
      chatCache.setDraft(client, chatId, value);
      saveDraft(chatId, value).catch(() => {});
    };
    pendingDraft.current = save;
    draftTimer.current = setTimeout(save, DRAFT_SAVE_MS);
  };

  const onChange = (value: string) => {
    setText(value);
    setError(null);
    setMenuClosed(false);
    setActiveSuggestion(0);
    if (editing) return;
    const pingAt = value.trim() && props.typing !== false ? typingPingDue(lastTyping.current, TYPING_PING_MS) : null;
    if (pingAt) {
      lastTyping.current = pingAt;
      sendTyping(chatId).catch(() => {});
    }
    scheduleDraft(value);
  };

  useImperativeHandle(ref, () => ({
    attach,
    quote: (q: string) => {
      const quoted = q
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      const next = `${quoted}\n${latestText.current}`;
      setText(next);
      scheduleDraft(next);
      textarea.current?.focus();
    },
    sendText: (value: string) => {
      onSent?.();
      send(value, null).catch((err: unknown) => setError(errorText(err, "Не удалось отправить сообщение")));
    },
  }));

  // Эмодзи из панели — в место курсора, как insertPlainEmoji в composer.js; после
  // форматирования — выделение или курсор там, где их оставила правка.
  const caret = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el || caret.current === null) return;
    el.setSelectionRange(caret.current.start, caret.current.end);
    caret.current = null;
  }, [text]);
  const insertEmoji = (emoji: string) => {
    const el = textarea.current;
    const pos = el?.selectionStart ?? text.length;
    caret.current = { start: pos + emoji.length, end: pos + emoji.length };
    onChange(text.slice(0, pos) + emoji + text.slice(pos));
    // На телефоне клавиатура не открывается поверх панели — как в tweb.
    if (!window.matchMedia?.("(pointer: coarse)").matches) el?.focus({ preventScroll: true });
  };

  const submit = (options: SendOptions = {}, typed = text) => {
    let value = typed.trim();
    if (editing) {
      if (!value) return;
      if (value !== (editing.text ?? "").trim()) onSaveEdit?.(editing, value);
      onCancelEdit?.();
      return;
    }
    if (!value) return;
    props.onBeforeSend?.(value);
    // «/команда …» — разметка, кубик или окно; команды бота уходят боту как есть.
    if (value.startsWith("/")) {
      const cmd = parseSlashCommand(value, reservedCommands);
      if (cmd && "error" in cmd) return showCommandError(cmd.error);
      if (cmd && !("text" in cmd)) {
        setText("");
        clearDraft();
        if ("dice" in cmd) void sendAttachment("", { kind: "dice", meta: { emoji: cmd.dice } });
        else if (cmd.action === "game") void sendGame(cmd.arg);
        else setCreating(cmd.action);
        return;
      }
      if (cmd) {
        value = cmd.text;
        if (cmd.silent) options = { ...options, silent: true };
      }
    }
    options = { ...options, ...takeAsGroup() };
    const reply = replyTo;
    clearInput();
    onSent?.();
    // Длиннее 4096 знаков — несколькими сообщениями; ответ и эффект — у первого.
    void (async () => {
      const parts = splitLongText(value);
      for (const [i, part] of parts.entries()) {
        try {
          await send(part, i === 0 ? reply : null, [], undefined, i === 0 ? options : options.silent ? { silent: true } : {});
        } catch (err) {
          // Не ушло — текст возвращаем, если человек ещё не начал новое сообщение.
          const left = parts.slice(i).join("\n");
          setText((current) => current || left);
          setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
          return;
        }
      }
    })();
  };

  // Поле очищено отправкой или отложенной отправкой: ответ, черновик, Hugo — тоже.
  const clearInput = () => {
    setText("");
    setHugo(null);
    onCancelReply();
    clearDraft();
  };

  const clearDraft = () => {
    clearTimeout(draftTimer.current);
    if (thread) return;
    chatCache.setDraft(client, chatId, "");
    saveDraft(chatId, "").catch(() => {});
  };

  // «Отправить позже» — только то, что уже набрано (scheduleSend в composer.js).
  const openSchedule = () => {
    if (!text.trim()) {
      toast("Сначала напишите сообщение — запланировать можно только то, что уже набрано", { error: true });
      return;
    }
    setScheduling("dialog");
  };
  const schedule = async ({ sendAt, repeat, whenOnline }: { sendAt: string | null; repeat: Parameters<typeof scheduleMessage>[1]["repeat"]; whenOnline: boolean }) => {
    try {
      await scheduleMessage(chatId, { text: text.trim(), replyToId: replyTo?.id ?? null, topicId: props.topicId ?? replyTo?.topicId ?? null, sendAt, repeat, whenOnline });
    } catch (err) {
      setError(errorText(err, "Не удалось запланировать отправку"));
      return;
    }
    clearInput();
    setScheduling("list");
  };

  // Hugo: проверка набранного; исправление — и проверка заново (runHugo в composer.js).
  const runHugo = async (value = text) => {
    if (!value.trim()) return;
    setHugo({ kind: "checking" });
    try {
      const { matches } = await hugoCheck(value);
      setHugo({ kind: "done", matches: cleanMatches(matches) });
    } catch (err) {
      setHugo({ kind: "error", text: errorText(err, "Не удалось проверить текст") });
    }
  };
  const replaceText = (next: string, caretAt?: number) => {
    if (caretAt !== undefined) caret.current = { start: caretAt, end: caretAt };
    onChange(next);
    textarea.current?.focus();
  };
  const fixOne = (m: ProofMatch, replacement: string) => {
    const res = applyFix(text, m, replacement);
    replaceText(res.text, res.caret);
    void runHugo(res.text);
  };

  // Как composer.js: выбранное сначала в окне отправки, потом загрузка, потом сообщение
  // (по 10 вложений; подпись — у первого).
  const sendMedia = async ({ picks, spoiler, paidStars }: MediaSendChoice) => {
    // Платный пост: размытая миниатюра первого фото или видео — её видят до оплаты; готовится, пока идёт загрузка.
    const firstMedia = picks.find((p) => p.kind === "image" || p.kind === "video");
    const blur = paidStars && firstMedia ? blurThumb(firstMedia.file).catch(() => ({})) : null;
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
    const paidMedia = paidStars ? { stars: paidStars, ...((await blur) ?? {}) } : null;
    const first: SendOptions = { ...takeAsGroup(), ...(paidMedia ? { paidMedia } : {}) };
    const caption = latestText.current.trim();
    const reply = replyTo;
    const atts: OutgoingAttachment[] = uploaded.map((a) => (spoiler && (a.kind === "image" || a.kind === "video") ? { ...a, spoiler: true } : a));
    setText("");
    onCancelReply();
    clearDraft();
    onSent?.();
    for (const [i, part] of chunks(atts, MAX_ATTACHMENTS_PER_MESSAGE).entries()) {
      await send(i === 0 ? caption : "", i === 0 ? reply : null, part, undefined, i === 0 ? first : {}).catch((err: unknown) => {
        setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
      });
    }
  };

  // Опрос, чек-лист, кубик — отдельным сообщением; текст в поле остаётся.
  const sendAttachment = (caption: string, attachment: OutgoingAttachment) => {
    const reply = replyTo;
    onCancelReply();
    onSent?.();
    return send(caption, reply, [attachment], undefined, takeAsGroup()).catch((err: unknown) => {
      setError(err instanceof TypeError ? "Нет связи с сервером — сообщение не отправлено" : errorText(err, "Не удалось отправить сообщение"));
      return null;
    });
  };

  // Статья — только с Premium (сервер проверяет то же: 403).
  const openArticle = () => {
    if (!isPremium) {
      toast("Создание статей доступно только Premium", { error: true });
      return;
    }
    setArticle({ initial: null });
  };
  // Обложка загружается как фото (окно ждёт: «Публикация…»), потом статья уходит
  // сообщением с article: true — временный пузырь сразу статьёй. Не ушла — окно снова с черновиком.
  const sendArticle = async ({ text: articleText, title, body, cover }: { text: string; title: string; body: string; cover: File | null }) => {
    const atts: OutgoingAttachment[] = [];
    if (cover) {
      const { uploaded, error: uploadError } = await uploads.upload([{ file: cover, kind: "image" }]);
      if (!uploaded[0]) return uploadError || "Не удалось загрузить обложку";
      atts.push(uploaded[0]);
    }
    const reply = replyTo;
    const options: SendOptions = { ...takeAsGroup(), article: true };
    onCancelReply();
    onSent?.();
    send(articleText, reply, atts, undefined, options).catch((err: unknown) => {
      setError(err instanceof TypeError ? "Нет связи с сервером — статья не опубликована" : errorText(err, "Не удалось опубликовать статью"));
      setArticle({ initial: { title, body, cover } });
    });
    return null;
  };

  // GPS → координаты; не вышло — окно выбора места (примерное по IP или поиск адреса),
  // чтобы геолокация отправлялась всегда (locateOrPick в composer.js).
  const locateOrPick = async (live: boolean): Promise<LatLng | null> => {
    toast("Определяем местоположение…", { durationMs: 25_000 });
    try {
      return await getPosition();
    } catch (err) {
      dismissToast();
      const reason = `${errorText(err)}.${live ? " Живая геолокация будет обновляться, только когда телефон отдаст координаты." : ""} Можно выбрать место вручную:`;
      const picked = await new Promise<PickedLocation>((resolve) => setPlacePicker({ reason, resolve }));
      setPlacePicker(null);
      return picked === "retry" ? locateOrPick(live) : picked;
    } finally {
      dismissToast();
    }
  };

  const sendLocation = async (live: boolean) => {
    const pos = await locateOrPick(live);
    if (!pos) return;
    if (!live) {
      void sendAttachment("", { kind: "location", meta: pos });
      return;
    }
    const liveMinutes = 15;
    const message = await sendAttachment("", { kind: "location", meta: { ...pos, liveMinutes } });
    if (message) startLiveLocationSharing(chatId, message.id, liveMinutes * 60_000);
  };

  // Голосовое или кружок записан — загрузка и сообщение (composer.js, recordingHandle.result).
  const sendRecording = async (mode: RecordMode, { recorded, waveform, transcript }: RecordingDone) => {
    setRecording(null);
    const ext = recorded.mimeType.includes("mp4") ? "mp4" : "webm";
    const file = new File([recorded.blob], `${mode}-${Date.now()}.${ext}`, { type: recorded.mimeType });
    const { uploaded, error: uploadError } = await uploads.upload([{ file, kind: mode }]);
    const att = uploaded[0];
    if (!att) {
      setError(uploadError || "Не удалось отправить запись");
      return;
    }
    void sendAttachment("", { ...att, kind: mode, durationSec: recorded.durationSec, ...(mode === "voice" ? { waveform, transcript } : {}) });
  };

  // Мем или рисунок — картинкой сразу, без окна отправки (sendImageNow в composer.js).
  const sendImageNow = async (file: File) => {
    const { uploaded, error: uploadError } = await uploads.upload([{ file, kind: "image" }]);
    const att = uploaded[0];
    if (!att) {
      setError(uploadError || "Не удалось загрузить файл");
      return;
    }
    void sendAttachment("", att);
  };

  // Каталог игр: «В чат» отправляет карточку выбранной игры.
  const openGames = () => openGamesCatalog({ chatId, onPick: (g) => void sendAttachment("", gameAttachmentFor(g)) });
  // «/game змейка» — сразу карточка найденной игры; без названия или не нашлось — каталог.
  const sendGame = async (q: string) => {
    const query = q.trim();
    if (query) {
      try {
        const { games } = await searchGames(query);
        const found = games.find((g) => g.title.toLowerCase() === query.toLowerCase()) ?? games[0];
        if (found) return void sendAttachment("", gameAttachmentFor(found));
        toast(`Игра «${query}» не найдена — выберите в каталоге`);
      } catch {
        // Поиск не ответил — выбираем в каталоге.
      }
    }
    openGames();
  };

  // Подсказки над полем: «/нач» в начале поля — команды, «@ник» перед курсором — участники.
  const [cursor, setCursor] = useState(text.length);
  const [selected, setSelected] = useState(false);
  const [menuClosed, setMenuClosed] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [commandError, setCommandError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(errorTimer.current), []);
  const showCommandError = (message: string) => {
    setCommandError(message);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setCommandError(null), COMMAND_ERROR_MS);
  };
  const reservedCommands = botCommands.map((c) => c.command.toLowerCase());
  const suggestions = ((): Suggestion[] => {
    if (menuClosed || selected) return [];
    const before = text.slice(0, cursor);
    const command = editing ? null : /^\/([\p{L}\d_]*)$/u.exec(before);
    if (command) return suggestSlashCommands(command[1]!, botCommands).map((c) => ({ kind: "command", command: c }));
    const mention = /(?:^|\s)@(\w*)$/.exec(before);
    if (!mention) return [];
    const q = mention[1]!.toLowerCase();
    return mentions
      .filter((u) => u.username && (u.username.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q)))
      .slice(0, MENTION_LIMIT)
      .map((u) => ({ kind: "mention", user: u }));
  })();
  const active = Math.min(activeSuggestion, Math.max(0, suggestions.length - 1));

  const pickSuggestion = (s: Suggestion) => {
    if (s.kind === "command") {
      const next = `/${s.command.name}${s.command.takesArg ? " " : ""}`;
      // Команда без текста (кубик, опрос, команда бота) выполняется сразу.
      if (!s.command.takesArg) return submit({}, next);
      caret.current = { start: next.length, end: next.length };
      onChange(next);
      return;
    }
    const before = text.slice(0, cursor).replace(/@(\w*)$/, `@${s.user.username} `);
    caret.current = { start: before.length, end: before.length };
    onChange(before + text.slice(cursor));
    setCursor(before.length);
    textarea.current?.focus();
  };

  // Форматирование выделенного: кнопки панели и сочетания клавиш.
  const applyEdit = (edit: Edit | null) => {
    if (!edit) return;
    caret.current = { start: edit.start, end: edit.end };
    onChange(edit.text);
  };
  const format = async (kind: FormatKind) => {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (kind === "quote") return applyEdit(quoteSelection(text, a, b));
    if (kind === "link") {
      if (!text.slice(a, b).trim()) return;
      const address = await askText("Адрес ссылки", { initial: "https://" });
      if (address) applyEdit(linkSelection(text, a, b, address));
      el.focus();
      return;
    }
    applyEdit(wrapSelection(text, a, b, kind));
  };
  const trackSelection = () => {
    const el = textarea.current;
    if (!el) return;
    setCursor(el.selectionStart);
    setSelected(document.activeElement === el && el.selectionEnd > el.selectionStart);
  };

  // Выделение ручками на телефоне и программное — только через selectionchange (как в composer.js).
  const trackRef = useRef(trackSelection);
  useEffect(() => {
    trackRef.current = trackSelection;
  });
  useEffect(() => {
    const onChange = () => {
      if (document.activeElement === textarea.current) trackRef.current();
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  // Картинка или файл из буфера обмена — в окно отправки.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length || editing) return;
    e.preventDefault();
    attach(files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((active + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        pickSuggestion(suggestions[active]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuClosed(true);
        return;
      }
    }
    const mark = editing ? null : formatShortcut(e);
    if (mark) {
      e.preventDefault();
      applyEdit(wrapSelection(text, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, mark));
      return;
    }
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
      {/* Отказ сервера — как тост старого клиента (role="status"): текст остаётся в поле. */}
      {error ? (
        <p className={styles.error} role="status">
          <EmojiText text={error} />
        </p>
      ) : null}
      {editing ? (
        <div className={styles.banner}>
          <Icon name="Edit" size={16} />
          <div className={styles.bannerBody}>
            <span className={styles.bannerLabel}>Изменение</span>
            {editing.attachments?.length ? (
              <MediaPreview className={styles.bannerText} message={editing} size={28} />
            ) : (
              <span className={styles.bannerText}>{stripCustomEmoji(messagePreview(editing)) || "Сообщение"}</span>
            )}
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
            {replyTo.attachments?.length ? (
              <MediaPreview className={styles.bannerText} message={replyTo} size={28} />
            ) : (
              <span className={styles.bannerText}>{stripCustomEmoji(messagePreview(replyTo)) || "Сообщение"}</span>
            )}
          </div>
          <button type="button" className={styles.iconButton} title="Отменить ответ" onClick={onCancelReply}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ) : null}
      {hugo ? (
        <HugoPanel
          state={hugo}
          text={text}
          onFix={fixOne}
          onFixAll={() => {
            if (hugo.kind === "done") replaceText(applyAll(text, hugo.matches));
            setHugo(null);
          }}
          onClose={() => setHugo(null)}
        />
      ) : null}
      <UploadStrip tiles={uploads.tiles} onCancel={uploads.cancel} />
      {paid ? (
        <p className={styles.paidHint}>
          <EmojiText
            text={
              paid.kind === "comment"
                ? `⭐ Комментарии в этом канале стоят ${paid.stars} ⭐ — спишется за каждый`
                : `⭐ Этот пользователь принимает сообщения за ${paid.stars} ⭐ — спишется за каждое отправленное`
            }
          />
        </p>
      ) : null}
      <SuggestMenu items={suggestions} active={active} error={commandError} onPick={pickSuggestion} />
      {selected && !editing ? <FormatBar onFormat={(kind) => void format(kind)} /> : null}
      <div className={styles.row}>
        {recording ? (
          <RecordingBar
            key={`${recording.mode}`}
            chatId={chatId}
            mode={recording.mode}
            hold={recording.hold}
            transcribe={transcribe}
            holdControlRef={holdControlRef}
            onDone={(result) => void sendRecording(recording.mode, result)}
            onCancel={() => setRecording(null)}
            onError={(text) => {
              setRecording(null);
              setError(text);
            }}
            onHoldEnd={() => setRecording((r) => (r?.hold ? { ...r, hold: false } : r))}
          />
        ) : (
          <div className={styles.field}>
            {editing ? (
              <span className={styles.attachGap} />
            ) : (
              <AttachButton
                onFiles={attach}
                onPoll={() => setCreating("poll")}
                onChecklist={() => setCreating("checklist")}
                onArticle={channel ? undefined : openArticle}
                onDice={(emoji) => void sendAttachment("", { kind: "dice", meta: { emoji } })}
                onGames={openGames}
                onLocation={(live) => void sendLocation(live)}
                onContact={() => setCreating("contact")}
                onHugo={() => void runHugo()}
                onMeme={() => setCreating("meme")}
                onPaint={() => setCreating("paint")}
                onSchedule={thread ? undefined : openSchedule}
              />
            )}
            {botCommands.length && !editing ? <BotCommandsButton commands={botCommands} onCommand={(cmd) => submit({}, cmd)} /> : null}
            {props.canPostAnonymously && !editing ? (
              <button
                type="button"
                className={asGroup ? `${styles.attach} ${styles.anonymousOn}` : styles.attach}
                title={asGroup ? "Отправляется от имени группы" : "Отправить от имени группы"}
                aria-pressed={asGroup}
                onClick={() => setAsGroup(!asGroup)}
              >
                <Icon name="Users" size={18} />
              </button>
            ) : null}
            <textarea
              ref={textarea}
              className={styles.input}
              rows={1}
              value={text}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => {
                onChange(e.target.value);
                setCursor(e.target.selectionStart);
              }}
              onSelect={trackSelection}
              onBlur={() => {
                setSelected(false);
                setMenuClosed(true);
              }}
              onFocus={() => setMenuClosed(false)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            {/* Hugo и «Позже» прямо в поле, как в composer.js; на узком экране и в ветке — только в меню скрепки. */}
            {!editing && !thread ? (
              <button type="button" className={`${styles.attach} ${styles.secondary}`} title="Проверить текст (Hugo)" onClick={() => void runHugo()}>
                <Icon name="Check" size={19} />
              </button>
            ) : null}
            {/* В канале стикер публикацией поста не уходит — кнопки нет. */}
            {!editing && !channel ? (
              <StickerButton
                chatId={chatId}
                onSend={(sticker) => {
                  const reply = replyTo;
                  onCancelReply();
                  onSent?.();
                  send("", reply, [], sticker).catch((err: unknown) => setError(errorText(err, "Не удалось отправить стикер")));
                }}
              />
            ) : null}
            {!editing && !thread ? (
              <button type="button" className={`${styles.attach} ${styles.secondary}`} title="Отправить позже" onClick={openSchedule}>
                <Icon name="Clock" size={18} />
              </button>
            ) : null}
            <EmojiButton onPick={insertEmoji} />
          </div>
        )}
        {props.ai?.generating && !editing ? (
          <button type="button" className={`${styles.send} ${styles.stop}`} title="Остановить ответ" aria-label="Остановить ответ" onClick={props.ai.onStop}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
            </svg>
          </button>
        ) : recording && !recording.hold ? null : !text.trim() && !editing && canRecord && !props.ai ? (
          <RecordButtons holdingMode={recording?.hold ? recording.mode : null} holdControlRef={holdControlRef} onStart={(mode, hold) => setRecording((r) => r ?? { mode, hold })} />
        ) : (
          <SendButton
            editing={!!editing}
            disabled={!text.trim()}
            allowEffects={!!props.allowEffects}
            onSend={submit}
            onSchedule={thread ? undefined : openSchedule}
          />
        )}
      </div>
      {article ? <ArticleEditor initial={article.initial} onSubmit={sendArticle} onClose={() => setArticle(null)} /> : null}
      {editingArticle ? (
        <ArticleEditor
          key={editingArticle.id}
          editing
          initial={{ ...splitArticle(editingArticle.text), cover: null }}
          onSubmit={({ text: next }) => {
            if (next !== (editingArticle.text ?? "").trim()) onSaveEdit?.(editingArticle, next);
            return null;
          }}
          onClose={() => onCancelEdit?.()}
        />
      ) : null}
      {creating === "meme" ? <MemeDialog onDone={(file) => void sendImageNow(file)} onClose={() => setCreating(null)} /> : null}
      {creating === "paint" ? <PaintDialog onDone={(file) => void sendImageNow(file)} onClose={() => setCreating(null)} /> : null}
      {creating === "poll" ? (
        <PollDialog
          onClose={() => setCreating(null)}
          onCreate={({ question, options, correctIndex, multiple }) =>
            void sendAttachment(question, { kind: "poll", meta: { options, votes: options.map(() => 0), voterIds: options.map(() => []), correctIndex, multiple } })
          }
        />
      ) : null}
      {creating === "checklist" ? (
        <ChecklistDialog
          onClose={() => setCreating(null)}
          onCreate={({ title, items, othersCanMark, othersCanAdd }) =>
            void sendAttachment(title, { kind: "checklist", meta: { items: items.map((text, i) => ({ id: i + 1, text })), othersCanMark, othersCanAdd } })
          }
        />
      ) : null}
      {creating === "contact" ? (
        <ContactPicker
          title="Отправить контакт"
          extra={props.people ?? NO_PEOPLE}
          exclude={props.excludeContacts ?? NO_IDS}
          onClose={() => setCreating(null)}
          onPick={(u) => void sendAttachment("", { kind: "contact", meta: { userId: u.id, name: u.name, phone: u.phone } })}
        />
      ) : null}
      {scheduling === "dialog" ? <ScheduleDialog allowWhenOnline={!!props.allowWhenOnline} onSchedule={(c) => void schedule(c)} onClose={() => setScheduling(null)} /> : null}
      {scheduling === "list" ? <ScheduledList chatId={chatId} onClose={() => setScheduling(null)} /> : null}
      {placePicker ? <LocationPicker reason={placePicker.reason} onDone={placePicker.resolve} /> : null}
      {picked ? <SendMediaDialog files={picked} allowPaid={!!props.canPostPaid && !thread} onSend={(choice) => void sendMedia(choice)} onClose={() => setPicked(null)} /> : null}
    </div>
  );
}
