import { el } from "../lib/dom.js";

// Удаление сообщения: один вопрос и галочка, а не две кнопки-близнеца.
//
// Раньше здесь стоял выбор из двух пунктов — «удалить у себя» и «удалить у
// всех», — и разница между ними читалась только по надписи, в спешке
// одинаковой. Галочка честнее: действие одно (удалить), а «у всех» — его
// свойство, которое видно в момент нажатия и остаётся невыбранным по
// умолчанию, потому что необратимо именно оно.
export function openDeleteMessageDialog({ count = 1, canDeleteForEveryone = true, someoneElses = false, onDelete }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const checkbox = el("input", { type: "checkbox", class: "delete-everyone-check" });

  function close() {
    overlay.remove();
  }

  const title = count > 1 ? `Удалить ${count} сообщ.?` : "Удалить сообщение?";
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    canDeleteForEveryone
      ? el("label", { class: "delete-everyone-row" }, [
          checkbox,
          el("span", {}, [
            el("span", { class: "delete-everyone-title" }, "Удалить у всех"),
            el(
              "span",
              { class: "delete-everyone-hint" },
              someoneElses
                ? "Сообщение исчезнет у собеседника и с сервера — вместе с вложениями."
                : "Сообщение исчезнет у всех участников и с сервера — вместе с вложениями."
            ),
          ]),
        ])
      : el("p", { class: "settings-toggle-hint" }, "Чужое сообщение можно убрать только из своей переписки."),
    el("button", {
      class: "btn-accent danger",
      onclick: () => {
        const forEveryone = canDeleteForEveryone && checkbox.checked;
        close();
        onDelete(forEveryone);
      },
    }, "Удалить"),
    el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
  ]);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  return { close };
}
