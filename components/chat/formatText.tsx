"use client";

import { useState } from "react";

// Lightweight formatter for the composer's markdown-like shortcuts
// (spec 07.2): **bold**, *italic*, `code`, ~~strike~~, ||spoiler||, > quote,
// @mentions, and bare URLs. Deliberately regex-based — this is message
// rendering, not a full markdown pipeline.
export function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const isQuote = line.startsWith("> ");
        const content = renderInline(isQuote ? line.slice(2) : line);
        return (
          <span key={i} className="block">
            {isQuote ? (
              <span className="block border-l-2 border-accent pl-2 text-muted">{content}</span>
            ) : (
              content
            )}
            {i < lines.length - 1 && !isQuote ? "" : null}
          </span>
        );
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\|\|[^|]+\|\||@\w+|https?:\/\/\S+)/g);
  return tokens.filter(Boolean).map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return <b key={i}>{tok.slice(2, -2)}</b>;
    }
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[0.9em]">
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("~~") && tok.endsWith("~~")) {
      return (
        <s key={i} className="opacity-70">
          {tok.slice(2, -2)}
        </s>
      );
    }
    if (tok.startsWith("||") && tok.endsWith("||")) {
      return <Spoiler key={i} text={tok.slice(2, -2)} />;
    }
    if (tok.startsWith("@")) {
      return (
        <span key={i} className="font-medium text-accent">
          {tok}
        </span>
      );
    }
    if (tok.startsWith("http://") || tok.startsWith("https://")) {
      return (
        <a key={i} href={tok} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          {tok}
        </a>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return <i key={i}>{tok.slice(1, -1)}</i>;
    }
    return tok;
  });
}

function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={`cursor-pointer rounded px-1 transition-colors ${
        revealed ? "bg-transparent" : "bg-text text-transparent"
      }`}
    >
      {text}
    </span>
  );
}
