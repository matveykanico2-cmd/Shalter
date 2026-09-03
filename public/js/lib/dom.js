// Tiny hyperscript-style helper so components build real DOM nodes directly
// (no vdom/diffing — this app re-renders whole subtrees on state change).
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    append(node, child);
  }
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((c) => append(node, c));
    return;
  }
  node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
}

// Вставка нескольких детей с той же защитой, что и внутри el().
//
// Нативный node.append() превращает null в текстовый узел со словом «null» —
// именно так оно и появлялось на экранах: везде, где элемент рисуется по
// условию («есть ошибка — покажи строку, нет — ничего»), в разметку попадало
// слово null. Здесь пустые значения отбрасываются, как и везде в этом модуле.
export function appendAll(node, ...children) {
  for (const child of children) append(node, child);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(root, child) {
  clear(root);
  append(root, child);
}
