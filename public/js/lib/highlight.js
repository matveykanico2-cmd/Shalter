// Подсветка синтаксиса для блоков кода в сообщениях. Не полноценный парсер —
// однопроходный токенизатор: комментарии, строки, числа, ключевые слова,
// вызовы функций. Этого хватает, чтобы код в чате читался как в редакторе.

const KW = {
  js: "async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield",
  ts: "abstract as any boolean declare enum implements interface keyof namespace never number private protected public readonly string type unknown",
  py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self",
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
  rust: "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
  c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while",
  cpp: "bool catch class constexpr delete explicit friend namespace new noexcept nullptr operator override private protected public template this throw try typename using virtual std",
  java: "abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch synchronized this throw throws try void volatile while var",
  php: "abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include instanceof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while",
  sql: "select from where insert into values update set delete create table drop alter add join left right inner outer on group by order having limit offset as and or not null is in like between distinct union all primary key foreign references index",
  sh: "if then else elif fi for while do done case esac in function return export local echo exit cd sudo",
  css: "important media keyframes from to root",
};
const LITERALS = new Set("true false null undefined None True False nil NULL".split(" "));

const ALIASES = {
  javascript: "js", jsx: "js", mjs: "js", node: "js", typescript: "ts", tsx: "ts",
  python: "py", golang: "go", rs: "rust", h: "c", "c++": "cpp", hpp: "cpp", cs: "java", csharp: "java",
  kotlin: "java", kt: "java", swift: "rust", bash: "sh", shell: "sh", zsh: "sh", console: "sh",
  postgres: "sql", mysql: "sql", sqlite: "sql", scss: "css", less: "css",
};

const LABELS = {
  js: "JavaScript", ts: "TypeScript", py: "Python", go: "Go", rust: "Rust", c: "C", cpp: "C++",
  java: "Java", php: "PHP", sql: "SQL", sh: "Bash", css: "CSS", json: "JSON", html: "HTML", xml: "XML",
};

export function normalizeLang(lang) {
  const l = (lang ?? "").toLowerCase();
  return ALIASES[l] ?? l;
}

export function langLabel(lang) {
  const l = normalizeLang(lang);
  return LABELS[l] ?? (lang ? lang : "");
}

function keywordsFor(lang) {
  const base = KW[lang] ?? (lang === "json" || lang === "html" || lang === "xml" ? "" : `${KW.js} ${KW.py}`);
  const extra = lang === "ts" ? KW.js : lang === "cpp" ? KW.c : "";
  return new Set(`${base} ${extra}`.split(/\s+/).filter(Boolean));
}

// Возвращает список [класс | null, текст].
export function tokenize(code, lang) {
  lang = normalizeLang(lang);
  if (lang === "html" || lang === "xml") return tokenizeMarkup(code);
  const kws = keywordsFor(lang);
  // «#» — комментарий в Python/Bash/PHP и в коде без указанного языка.
  const hashComment = ["py", "sh", "php"].includes(lang) || (!KW[lang] && lang !== "json");
  const slashComment = lang !== "py" && lang !== "sh";
  const sqlComment = lang === "sql";
  const out = [];
  let i = 0;
  const push = (cls, text) => {
    const last = out[out.length - 1];
    if (last && last[0] === cls) last[1] += text;
    else out.push([cls, text]);
  };
  while (i < code.length) {
    const ch = code[i];
    const rest = code.slice(i);
    let m;
    if ((ch === "/" && code[i + 1] === "/" && slashComment) || (sqlComment && ch === "-" && code[i + 1] === "-")) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push("tk-comment", code.slice(i, stop));
      i = stop;
    } else if (ch === "#" && hashComment) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push("tk-comment", code.slice(i, stop));
      i = stop;
    } else if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push("tk-comment", code.slice(i, stop));
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === "\\") j++;
        if (code[j] === "\n" && ch !== "`" && lang !== "py") break;
        j++;
      }
      j = Math.min(j + 1, code.length);
      const str = code.slice(i, j);
      // В JSON ключи выделяем отдельно от значений.
      const isKey = lang === "json" && /^\s*:/.test(code.slice(j));
      push(isKey ? "tk-prop" : "tk-string", str);
      i = j;
    } else if ((m = /^(0x[\da-f]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?)/i.exec(rest)) && !/[\w$]/.test(code[i - 1] ?? "")) {
      push("tk-number", m[0]);
      i += m[0].length;
    } else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = m[0];
      const next = code.slice(i + word.length).match(/^\s*(\()?/);
      const lw = lang === "sql" ? word.toLowerCase() : word;
      let cls = null;
      if (kws.has(lw)) cls = "tk-keyword";
      else if (LITERALS.has(word)) cls = "tk-literal";
      else if (next?.[1]) cls = "tk-function";
      else if (/^[A-Z][a-z]/.test(word) && lang !== "sql") cls = "tk-type";
      else if (code[i - 1] === ".") cls = "tk-prop";
      push(cls, word);
      i += word.length;
    } else if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
      push("tk-operator", ch);
      i++;
    } else {
      push(null, ch);
      i++;
    }
  }
  return out;
}

function tokenizeMarkup(code) {
  const out = [];
  const re = /(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)/g;
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push([null, code.slice(last, m.index)]);
    if (m[1]) out.push(["tk-comment", m[1]]);
    else {
      out.push(["tk-operator", m[2]], ["tk-keyword", m[3]]);
      const attrRe = /(\s+)([\w:-]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g;
      let a;
      while ((a = attrRe.exec(m[4]))) {
        out.push([null, a[1]], ["tk-prop", a[2]]);
        if (a[3]) out.push(["tk-operator", a[3]], ["tk-string", a[4]]);
      }
      out.push(["tk-operator", m[5]]);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out.push([null, code.slice(last)]);
  return out;
}
