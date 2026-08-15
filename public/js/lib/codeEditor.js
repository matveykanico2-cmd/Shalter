// A real code editor (syntax highlighting + autocomplete) for Settings →
// Боты → Код, powered by CodeMirror 6 — loaded straight from esm.sh (a CDN
// that serves real npm packages as native ES modules), not vendored or
// bundled locally. That's consistent with this project's "no framework/
// bundler for public/js" rule (see AGENTS.md) for `npm run dev`; the
// production build (scripts/build.js) marks these exact URLs as external so
// esbuild leaves the import statements alone rather than trying to fetch/
// bundle them itself — the browser resolves them at runtime either way.
//
// Deliberately *not* using esm.sh's `?bundle` flag here: CodeMirror's
// extension system does `instanceof` checks against classes from
// @codemirror/state, and `?bundle` inlines a separate private copy of that
// package into each of these four imports — four different classes that
// all happen to be named the same thing, so `instanceof` fails with
// "Unrecognized extension value" even though the code looks completely
// correct.
//
// Also deliberately *pinned to exact versions with an explicit `?deps=`*
// rather than left floating on "@6" — two failure modes hit along the way
// (both confirmed live, not just from reading esm.sh's docs): (1) leaving
// @codemirror/state unpinned while `codemirror` internally resolves its own
// "^6.0.0" range to "whatever the latest 6.x happens to be right now" can
// still produce two different concrete versions of it (surfaced as bizarre
// internal errors like "No tile at position undefined" — nothing that looks
// like a version problem); (2) floating the top-level `codemirror` package
// itself on "@6" is worse — its 6.65.x release changed its export shape
// entirely (no more named `EditorView`/`basicSetup` exports at all), which
// breaks import resolution for the *whole app*, not just this editor, since
// this file's imports are evaluated as soon as anything reaches it. `?deps=`
// is esm.sh's documented mechanism for forcing every one of these four
// packages to resolve the exact same shared @codemirror/state +
// @codemirror/view versions — note it has to be a literal string in each
// import (an ES module import source can't be a template literal/computed
// expression), so the query string is repeated rather than shared as a
// constant.
import { EditorView, basicSetup } from "https://esm.sh/codemirror@6.0.1?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7";
import { EditorState } from "https://esm.sh/@codemirror/state@6.7.1";
import { javascript } from "https://esm.sh/@codemirror/lang-javascript@6.2.5?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7";
import { autocompletion } from "https://esm.sh/@codemirror/autocomplete@6.20.3?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7";

// A curated completion list for the bot-programming surface specifically
// (see the /bots documentation page) rather than full generic JS intellisense — this is a small,
// focused scripting context (one handleMessage function), so "the bot API
// plus common keywords" is more useful here than a general-purpose language
// server would be.
const COMPLETIONS = [
  { label: "handleMessage", type: "function", detail: "(msg, bot)", info: "Called for every incoming message. Must be async." },
  { label: "msg.text", type: "property", info: "The message text the user sent." },
  { label: "msg.chatId", type: "property", info: "Which chat this message is in." },
  { label: "msg.senderId", type: "property", info: "Who sent it." },
  { label: "msg.createdAt", type: "property", info: "ISO timestamp." },
  { label: "bot.send", type: "function", detail: "(text, opts?)", info: "Reply in the same chat as msg." },
  { label: "bot.sendTo", type: "function", detail: "(chatId, text, opts?)", info: "Send to a specific chat." },
  { label: "console.log", type: "function" },
  { label: "console.error", type: "function" },
  { label: "fetch", type: "function", info: "Call an external API." },
  { label: "async", type: "keyword" },
  { label: "await", type: "keyword" },
  { label: "function", type: "keyword" },
  { label: "return", type: "keyword" },
  { label: "if", type: "keyword" },
  { label: "else", type: "keyword" },
  { label: "const", type: "keyword" },
  { label: "let", type: "keyword" },
  { label: "for", type: "keyword" },
  { label: "JSON.stringify", type: "function" },
  { label: "JSON.parse", type: "function" },
];

function botApiCompletionSource(context) {
  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: COMPLETIONS };
}

// basicSetup's own closeBrackets only skips-over a typed closing bracket
// when it's immediately adjacent on the same line (confirmed by direct
// testing: typing a multi-line function like `f() {\n  body\n}` character
// by character — which is exactly how anyone hand-types a bot's
// handleMessage — leaves the auto-inserted "}" in place *and* inserts the
// user's own, producing invalid doubled-brace code that fails silently
// until "Запустить"/a real message throws a confusing syntax error). This
// input handler runs before CodeMirror's own transaction filters and
// consumes the keystroke as a plain cursor move whenever a matching closing
// bracket is the next non-whitespace text ahead of the cursor, so typing a
// real closing bracket always just steps over the auto-inserted one
// regardless of how many lines are in between.
function skipClosingBracketAcrossLines(view, from, to, text) {
  if (from !== to || !")]}".includes(text)) return false;
  const ahead = view.state.doc.sliceString(from, from + 200);
  const match = /^\s*(\)|\]|\})/.exec(ahead);
  if (match && match[1] === text) {
    view.dispatch({ selection: { anchor: from + match[0].length }, scrollIntoView: true });
    return true;
  }
  return false;
}

// container: a plain DOM element to mount into. Returns a small handle —
// this file has no idea about the rest of the app's render cycle, callers
// own creating/destroying it around their own dialog's lifecycle.
export function createCodeEditor(container, { value = "", onChange, readOnly = false } = {}) {
  const extensions = [
    basicSetup,
    javascript(),
    autocompletion({ override: [botApiCompletionSource] }),
    EditorView.inputHandler.of(skipClosingBracketAcrossLines),
    EditorView.theme({
      "&": { height: "100%", fontSize: "13px", border: "1px solid var(--color-border)", borderRadius: "8px" },
      ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
      ".cm-content": { padding: "8px 0" },
    }),
  ];
  if (readOnly) extensions.push(EditorView.editable.of(false));
  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      })
    );
  }

  const view = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: container });

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
