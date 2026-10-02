let cmPromise = null;
function loadCodeMirror() {
  if (!cmPromise) {
    cmPromise = Promise.all([
      import("https://esm.sh/codemirror@6.0.1?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7"),
      import("https://esm.sh/@codemirror/state@6.7.1"),
      import("https://esm.sh/@codemirror/lang-javascript@6.2.5?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7"),
      import("https://esm.sh/@codemirror/autocomplete@6.20.3?deps=@codemirror/state@6.7.1,@codemirror/view@6.43.7"),
    ]).then(([cm, state, lang, ac]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      EditorState: state.EditorState,
      javascript: lang.javascript,
      autocompletion: ac.autocompletion,
    }));
  }
  return cmPromise;
}

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

export async function createCodeEditor(container, { value = "", onChange, readOnly = false } = {}) {
  const { EditorView, EditorState, basicSetup, javascript, autocompletion } = await loadCodeMirror();
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
