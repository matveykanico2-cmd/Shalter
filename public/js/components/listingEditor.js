import { el, clear, appendAll } from "../lib/dom.js";
import { api } from "../api.js";
import { uploadFile } from "../lib/upload.js";
import { fileToImageUpload } from "../lib/image.js";

// Размещение и правка объявления.
//
// Фотографии уезжают файлами и попадают в объявление ссылками — не строками
// data: внутри записи. Причина та же, что и у сообщений: доска с картинками
// внутри базы раздувает её и тянет всё это в каждый ответ ленты.
const MAX_PHOTOS = 8;
const MAX_PHOTO_SIDE = 1600;

export function openListingEditor({ listing = null, categories = [], onSaved } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "listing-editor-body" });
  const dialog = el("div", { class: "modal-dialog listing-editor" }, [
    el("h2", { class: "modal-title" }, listing ? "Изменить объявление" : "Новое объявление"),
    body,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const form = {
    title: listing?.title ?? "",
    description: listing?.description ?? "",
    category: listing?.category ?? "other",
    condition: listing?.condition ?? "used",
    priceRub: listing?.priceRub ?? "",
    isNegotiable: !!listing?.isNegotiable,
    city: listing?.city ?? "",
    photos: [...(listing?.photos ?? [])],
    // null — «не отправляю»; число — сколько стоит отправка.
    cdekPriceRub: listing?.cdekPriceRub ?? null,
    status: listing?.status ?? "active",
  };
  let busy = false;
  let error = null;
  let uploading = false;

  function close() {
    overlay.remove();
  }

  async function addPhotos(files) {
    uploading = true;
    render();
    try {
      for (const file of files) {
        if (form.photos.length >= MAX_PHOTOS) break;
        const smaller = await fileToImageUpload(file, MAX_PHOTO_SIDE);
        const uploaded = await uploadFile(smaller, "image");
        form.photos.push(uploaded.url);
      }
    } catch (err) {
      error = err.message || "Не удалось загрузить фото";
    }
    uploading = false;
    render();
  }

  async function save() {
    error = null;
    if (!form.title.trim()) {
      error = "Напишите, что продаёте";
      return render();
    }
    busy = true;
    render();
    const payload = {
      ...form,
      priceRub: form.isNegotiable ? 0 : Number(form.priceRub) || 0,
      cdekPriceRub: form.cdekPriceRub === null || form.cdekPriceRub === "" ? null : Number(form.cdekPriceRub),
    };
    try {
      if (listing) await api.updateListing(listing.id, payload);
      else await api.createListing(payload);
      onSaved?.();
      close();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
      busy = false;
      render();
    }
  }

  async function remove() {
    if (!listing || !confirm("Удалить объявление? Это навсегда.")) return;
    try {
      await api.deleteListing(listing.id);
      onSaved?.();
      close();
    } catch (err) {
      error = err.message || "Не удалось удалить";
      render();
    }
  }

  function field(label, node) {
    return el("label", { class: "listing-field" }, [el("span", { class: "settings-toggle-hint" }, label), node]);
  }

  function render() {
    clear(body);
    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (files.length) addPhotos(files);
      },
    });

    appendAll(body, 
      field("Что продаёте", el("input", { class: "login-input", maxlength: 80, value: form.title, oninput: (e) => (form.title = e.target.value) })),
      field(
        "Описание",
        el("textarea", { class: "login-input listing-textarea", maxlength: 3000, value: form.description, oninput: (e) => (form.description = e.target.value) })
      ),
      field(
        "Категория",
        el(
          "select",
          { class: "login-input", onchange: (e) => (form.category = e.target.value) },
          (categories.length ? categories : [{ id: "other", label: "Другое" }]).map((c) =>
            el("option", { value: c.id, selected: form.category === c.id }, c.label)
          )
        )
      ),
      field(
        "Состояние",
        el("select", { class: "login-input", onchange: (e) => (form.condition = e.target.value) }, [
          el("option", { value: "used", selected: form.condition === "used" }, "Б/у"),
          el("option", { value: "new", selected: form.condition === "new" }, "Новое"),
        ])
      ),
      el("div", { class: "listing-price-row" }, [
        field(
          "Цена, ₽",
          el("input", {
            class: "login-input",
            type: "number",
            min: "0",
            disabled: form.isNegotiable,
            value: form.priceRub,
            oninput: (e) => (form.priceRub = e.target.value),
          })
        ),
        el("label", { class: "listing-checkbox" }, [
          el("input", {
            type: "checkbox",
            checked: form.isNegotiable,
            onchange: (e) => {
              form.isNegotiable = e.target.checked;
              render();
            },
          }),
          el("span", {}, "Цена договорная"),
        ]),
      ]),
      field("Город", el("input", { class: "login-input", maxlength: 60, value: form.city, oninput: (e) => (form.city = e.target.value) })),
      // Доставки как услуги здесь нет: сервис ничего не отправляет и не
      // отслеживает. Это просто число, которое увидит покупатель, — чтобы не
      // спрашивать про отправку в каждой переписке.
      el("div", { class: "listing-cdek" }, [
        el("label", { class: "listing-checkbox" }, [
          el("input", {
            type: "checkbox",
            checked: form.cdekPriceRub !== null,
            onchange: (e) => {
              form.cdekPriceRub = e.target.checked ? 0 : null;
              render();
            },
          }),
          el("span", {}, "Отправлю СДЭК"),
        ]),
        form.cdekPriceRub !== null
          ? field(
              "Стоимость отправки, ₽",
              el("input", {
                class: "login-input",
                type: "number",
                min: "0",
                value: form.cdekPriceRub,
                oninput: (e) => (form.cdekPriceRub = e.target.value),
              })
            )
          : null,
        el("p", { class: "settings-toggle-hint" }, "Отправляете вы сами — Shalter доставку не оформляет и денег за неё не берёт. Число видно покупателю в объявлении."),
      ]),
      el("div", { class: "listing-photos" }, [
        ...form.photos.map((url, i) =>
          el("div", { class: "listing-photo" }, [
            el("img", { src: url, alt: "" }),
            el(
              "button",
              {
                class: "listing-photo-remove",
                title: "Убрать фото",
                onclick: () => {
                  form.photos.splice(i, 1);
                  render();
                },
              },
              "×"
            ),
          ])
        ),
        form.photos.length < MAX_PHOTOS
          ? el("button", { class: "listing-photo-add", onclick: () => fileInput.click() }, uploading ? "…" : "+ фото")
          : null,
      ]),
      fileInput,
      listing
        ? field(
            "Состояние объявления",
            el("select", { class: "login-input", onchange: (e) => (form.status = e.target.value) }, [
              el("option", { value: "active", selected: form.status === "active" }, "Активно"),
              el("option", { value: "sold", selected: form.status === "sold" }, "Продано"),
              el("option", { value: "archived", selected: form.status === "archived" }, "Снято с публикации"),
            ])
          )
        : null,
      error ? el("p", { class: "login-error" }, error) : null,
      el("div", { class: "listing-editor-actions" }, [
        listing ? el("button", { class: "settings-danger-link", onclick: remove }, "Удалить") : null,
        el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
        el("button", { class: "btn-accent", disabled: busy || uploading, onclick: save }, busy ? "Сохраняем…" : listing ? "Сохранить" : "Разместить"),
      ])
    );
  }

  render();
  return { close };
}
