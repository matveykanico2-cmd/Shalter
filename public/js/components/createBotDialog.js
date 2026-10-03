import { el } from "../lib/dom.js";
import { openSideTab, twInputField, twAvatarEdit } from "./twTab.js";
import { showToast } from "./toast.js";

// Вкладка «Новый бот» в стиле tweb: аватар с камерой, имя и описание с подписью на рамке.
export function openCreateBotDialog(onSubmit) {
  const avatar = twAvatarEdit();
  const name = twInputField({ label: "Имя бота", maxLength: 64 });
  const desc = twInputField({ label: "Описание (необязательно)", multiline: true, maxLength: 255 });

  openSideTab({
    title: "Новый бот",
    content: [
      el("div", { class: "tw-create-head" }, [avatar.element]),
      el("div", { class: "tw-section-group" }, [
        el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field]),
        el("p", { class: "tw-section-caption" }, "После создания вы получите токен — с ним бота можно программировать через Bot API или прямо в Shalter."),
      ]),
    ],
    fab: {
      icon: "Check",
      title: "Создать",
      onClick: async (tab) => {
        const value = name.input.value.trim();
        if (!value) {
          name.field.classList.add("error");
          name.input.focus();
          return;
        }
        tab.setFabBusy(true);
        try {
          await onSubmit(value, avatar.image, desc.input.value.trim());
          tab.close({ all: true });
        } catch (err) {
          showToast(err?.message || "Не удалось создать бота");
        } finally {
          tab.setFabBusy(false);
        }
      },
    },
  });
}
