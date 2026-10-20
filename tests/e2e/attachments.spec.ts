// Вложения: фото, документ и голосовое — получатель видит их у себя без перезагрузки.
import { test, expect } from "./support/fixtures";
import { createDm, sendText } from "../support/seed";
import { composer, messageText } from "./support/ui";
import type { Page } from "@playwright/test";

// Маленький настоящий PNG 1×1.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

/** Скрепка → плитка меню вложений → системный выбор файла. */
async function attachViaMenu(page: Page, tile: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByRole("button", { name: "Вложение", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: tile, exact: true }).click();
  await (await chooser).setFiles(file);
}

test("фото и документ доходят до собеседника", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Пришли файлы");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Пришли файлы")).toBeVisible();
  await expect(composer(b)).toBeVisible();

  // Фото: окно предпросмотра «Отправить фото» → «Отправить».
  await attachViaMenu(a, "Фото или видео", { name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(a.getByRole("heading", { name: "Отправить фото" })).toBeVisible();
  await a.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Отправить фото" })).toHaveCount(0);
  const photo = b.getByRole("img", { name: "pixel.png" }).last();
  await expect(photo).toBeVisible();
  // Картинка реально загрузилась с сервера (не «битая»).
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Документ: «Файл» → «Отправить файл» → у Бориса ссылка на скачивание с именем файла.
  await attachViaMenu(a, "Файл", { name: "отчёт.txt", mimeType: "text/plain", buffer: Buffer.from("квартальный отчёт\n") });
  await expect(a.getByRole("heading", { name: "Отправить файл" })).toBeVisible();
  await a.getByRole("button", { name: "Отправить", exact: true }).click();
  const docLink = b.getByRole("link", { name: /отчёт\.txt/ });
  await expect(docLink).toBeVisible();
  await expect(docLink).toHaveAttribute("download", "отчёт.txt");

  // Файл действительно скачивается и совпадает с отправленным.
  const href = await docLink.getAttribute("href");
  expect(href).toBeTruthy();
  const res = await b.request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("квартальный отчёт\n");
});

test("голосовое сообщение с фейкового микрофона", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(boris, chat.id, "Скажи что-нибудь");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(messageText(a, "Скажи что-нибудь")).toBeVisible();
  await expect(composer(b)).toBeVisible();

  // Нажатие на микрофон — запись «без рук»; «Отправить» завершает и отправляет.
  await a.getByRole("button", { name: /^Голосовое сообщение/ }).click();
  const send = a.getByRole("button", { name: "Отправить", exact: true });
  await expect(send).toBeVisible();
  // Запись идёт — таймер больше нуля (иначе голосовое отбрасывается как пустое).
  await expect(a.getByText(/0:0[1-9]|00:0[1-9]/).first()).toBeVisible();
  await send.click();

  // У обоих — плеер голосового с кнопкой «Слушать».
  await expect(a.getByRole("button", { name: "Слушать" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Слушать" })).toBeVisible();
});
