import { createContext, type MouseEvent, type ReactNode, use, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { langLabel, tokenize } from "@/shared/lib/highlight";
import { linkSafety } from "@/shared/lib/link-safety";
import { EmojiText, openInAppBrowser } from "@/shared/ui";

import { type Block, type Inline, internalRoute, parseText, QUOTE_COLLAPSE_LINES } from "../lib/format-text";
import { MessageLinks } from "../model/message-links";

import { CustomEmoji } from "./animated";
import styles from "./message-text.module.css";

/** Свои эмодзи сообщения: [ce:N] в тексте — N-я сцена из message.customEmoji. */
const CustomEmojiScenes = createContext<readonly unknown[] | undefined>(undefined);

/** Код длиннее этого не подсвечиваем — токенизатор однопроходный, но не бесплатный. */
const HIGHLIGHT_LIMIT = 20_000;

/**
 * Текст сообщения с разметкой (жирный, код, цитаты, таблицы, спойлеры, ссылки), как
 * formatText в public/js/lib/formatText.js. meta — время с галочками: встаёт в конец
 * последней строки.
 */
export function MessageText({ text, meta, customEmoji, markdown = false }: { text: string; meta?: ReactNode; customEmoji?: readonly unknown[]; markdown?: boolean }) {
  // markdown — тело статьи: ещё заголовки «## …» и списки.
  const blocks = useMemo(() => parseText(text, { markdown }), [text, markdown]);
  const lastLine = blocks.at(-1)?.kind === "line" ? blocks.length - 1 : -1;
  return (
    <CustomEmojiScenes value={customEmoji}>
      <div className={styles.text}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} tail={i === lastLine ? meta : undefined} />
        ))}
        {lastLine < 0 && meta ? <span className={styles.block}>{meta}</span> : null}
      </div>
    </CustomEmojiScenes>
  );
}

function BlockView({ block, tail }: { block: Block; tail?: ReactNode }) {
  switch (block.kind) {
    case "line":
      return (
        <span className={styles.block}>
          <InlineList items={block.inline} />
          {tail}
        </span>
      );
    case "code":
      return <CodeBlock code={block.code} lang={block.lang} />;
    case "quote":
      return <Quote lines={block.lines} />;
    case "heading": {
      // Заголовок статьи — h2, разделы её тела — на уровень ниже.
      const Tag = (["h3", "h4", "h5", "h6", "h6"] as const)[block.level - 2]!;
      return (
        <Tag className={styles.heading}>
          <InlineList items={block.inline} />
        </Tag>
      );
    }
    case "list":
      return (
        <ul className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineList items={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <span className={`${styles.block} ${styles.tableWrap}`}>
          <table className={styles.table}>
            {block.header ? (
              <thead>
                <tr>
                  {block.header.map((cell, c) => (
                    <th key={c}>
                      <InlineList items={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <InlineList items={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </span>
      );
  }
}

function InlineList({ items }: { items: Inline[] }) {
  return items.map((item, i) => <InlineView key={i} item={item} />);
}

function InlineView({ item }: { item: Inline }) {
  switch (item.kind) {
    case "text":
      return <EmojiText text={item.text} />;
    case "bold":
      return (
        <b>
          <EmojiText text={item.text} />
        </b>
      );
    case "italic":
      return (
        <i>
          <EmojiText text={item.text} />
        </i>
      );
    case "underline":
      return (
        <u>
          <EmojiText text={item.text} />
        </u>
      );
    case "strike":
      return (
        <s>
          <EmojiText text={item.text} />
        </s>
      );
    case "code":
      return <code className={styles.inlineCode}>{item.text}</code>;
    case "spoiler":
      return <Spoiler text={item.text} />;
    case "link":
      return <TextLink href={item.href} label={item.label} />;
    case "mention":
      return <MentionLink text={item.text} handle={item.handle} />;
    case "hashtag":
      return <HashtagLink tag={item.text} />;
    case "emoji":
      return <InlineCustomEmoji index={item.index} />;
  }
}

/** @имя — профиль (или канал, группа) по нику. */
function MentionLink({ text, handle }: { text: string; handle: string }) {
  const { onMention } = use(MessageLinks);
  if (!onMention) return <span className={styles.mention}>{text}</span>;
  return (
    <button
      type="button"
      className={`${styles.mention} ${styles.mentionLink}`}
      onClick={(e) => {
        e.stopPropagation();
        onMention(handle);
      }}
    >
      {text}
    </button>
  );
}

/** #тег — поиск по чату с ним. */
function HashtagLink({ tag }: { tag: string }) {
  const { onHashtag } = use(MessageLinks);
  if (!onHashtag) return <span className={styles.mention}>{tag}</span>;
  return (
    <button
      type="button"
      className={`${styles.mention} ${styles.mentionLink}`}
      onClick={(e) => {
        e.stopPropagation();
        onHashtag(tag);
      }}
    >
      {tag}
    </button>
  );
}

function InlineCustomEmoji({ index }: { index: number }) {
  const scene = use(CustomEmojiScenes)?.[index];
  return scene ? <CustomEmoji scene={scene} /> : "🎨";
}

function Quote({ lines }: { lines: Inline[][] }) {
  const long = lines.length > QUOTE_COLLAPSE_LINES;
  const [collapsed, setCollapsed] = useState(long);
  return (
    <span className={styles.block}>
      <span className={collapsed ? `${styles.quote} ${styles.quoteCollapsed}` : styles.quote}>
        {lines.map((line, i) => (
          <span key={i} className={styles.block}>
            <InlineList items={line} />
          </span>
        ))}
      </span>
      {long ? (
        <button
          type="button"
          className={styles.quoteToggle}
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
        >
          {collapsed ? "Показать полностью" : "Свернуть"}
        </button>
      ) : null}
    </span>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => (code.length <= HIGHLIGHT_LIMIT ? tokenize(code, lang) : [[null, code] as const]), [code, lang]);
  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };
  return (
    <span className={styles.codeBlock}>
      <span className={styles.codeHead}>
        <span>{langLabel(lang) || "Код"}</span>
        <button type="button" className={styles.codeCopy} title="Копировать код" onClick={copy}>
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </span>
      <pre>
        <code>
          {tokens.map(([cls, text], i) =>
            cls ? (
              <span key={i} className={styles[cls]}>
                {text}
              </span>
            ) : (
              text
            )
          )}
        </code>
      </pre>
    </span>
  );
}

function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className={`${styles.spoiler} ${styles.revealed}`}>{text}</span>;
  const reveal = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setRevealed(true);
  };
  return (
    <span
      className={styles.spoiler}
      role="button"
      tabIndex={0}
      aria-label="Скрытый текст — нажмите, чтобы показать"
      onClick={reveal}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        reveal(e);
      }}
    >
      {text}
    </span>
  );
}

// Ссылка с подписью [текст](url): настоящий адрес — в title, проверка идёт по нему.
function TextLink({ href, label }: { href: string; label: string }) {
  const navigate = useNavigate();
  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const internal = internalRoute(href, window.location.origin);
    if (internal) return void navigate(internal);
    openInAppBrowser(href, linkSafety(href));
  };
  return (
    <a href={href} target="_blank" rel="noreferrer" className={styles.link} title={label === href ? undefined : href} onClick={open}>
      {label}
    </a>
  );
}
