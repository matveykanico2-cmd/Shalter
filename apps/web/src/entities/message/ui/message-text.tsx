import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { langLabel, tokenize } from "@/shared/lib/highlight";

import { type Block, type Inline, internalRoute, linkSafety, parseText, QUOTE_COLLAPSE_LINES } from "../lib/format-text";

import styles from "./message-text.module.css";

/** Код длиннее этого не подсвечиваем — токенизатор однопроходный, но не бесплатный. */
const HIGHLIGHT_LIMIT = 20_000;

/**
 * Текст сообщения с разметкой (жирный, код, цитаты, таблицы, спойлеры, ссылки), как
 * formatText в public/js/lib/formatText.js. meta — время с галочками: встаёт в конец
 * последней строки.
 */
export function MessageText({ text, meta }: { text: string; meta?: ReactNode }) {
  const blocks = useMemo(() => parseText(text), [text]);
  const lastLine = blocks.at(-1)?.kind === "line" ? blocks.length - 1 : -1;
  return (
    <div className={styles.text}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} tail={i === lastLine ? meta : undefined} />
      ))}
      {lastLine < 0 && meta ? <span className={styles.block}>{meta}</span> : null}
    </div>
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
      return item.text;
    case "bold":
      return <b>{item.text}</b>;
    case "italic":
      return <i>{item.text}</i>;
    case "underline":
      return <u>{item.text}</u>;
    case "strike":
      return <s>{item.text}</s>;
    case "code":
      return <code className={styles.inlineCode}>{item.text}</code>;
    case "spoiler":
      return <Spoiler text={item.text} />;
    case "link":
      return <TextLink href={item.href} label={item.label} />;
    // Профиль по @имени и поиск по #тегу появятся вместе с этими экранами.
    case "mention":
    case "hashtag":
      return <span className={styles.mention}>{item.text}</span>;
    // Свои эмодзи рисуются сценой (public/js/lib/customScene.js) — пока значком, как в превью.
    case "emoji":
      return "🎨";
  }
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
    // Встроенный браузер (public/js/components/inAppBrowser.js) появится позже —
    // пока новая вкладка, с тем же предупреждением о подозрительной ссылке.
    const { unsafe, warning } = linkSafety(href);
    if (warning || unsafe) {
      const host = URL.canParse(href) ? new URL(href).hostname : href;
      if (!window.confirm(`${warning || "Ссылка может быть небезопасной."}\n\n${host}`)) return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <a href={href} target="_blank" rel="noreferrer" className={styles.link} title={label === href ? undefined : href} onClick={open}>
      {label}
    </a>
  );
}
