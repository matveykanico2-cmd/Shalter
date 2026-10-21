// Общие помощники сценариев «истории и люди». Только роли и видимые тексты.
import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Настоящий PNG заданного размера, залитый одним цветом — фото истории, картинка статуса. */
export function solidPng(width = 64, height = 64, [r, g, b]: [number, number, number] = [220, 80, 40]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Тишина в WAV (PCM 16 бит, моно, 8 кГц) заданной длительности — «трек» для профиля. */
export function silentWav(seconds = 2): Buffer {
  const rate = 8000;
  const data = rate * 2 * seconds;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // моно
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(data, 40);
  return buf;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Кружок чужой истории в полосе историй: кнопка с именем автора (и, возможно,
 * инициалом аватара перед ним) — без превью сообщения, в отличие от строки чата.
 * Страница должна быть открыта на переписке, а не на пустом главном экране:
 * там справа подсказки с такими же кнопками «инициал + имя» недавних собеседников.
 */
export function storyItem(page: Page, firstName: string) {
  return page.getByRole("button", { name: new RegExp(`^(${esc(firstName[0])}\\s*)?${esc(firstName)}$`) });
}

/** Своя «Моя история» в полосе историй. */
export function myStory(page: Page) {
  return page.getByRole("button", { name: /Моя история$/ });
}

/** Нажать кнопку, открывающую системный выбор файла, и подложить файл. */
export async function chooseFile(page: Page, click: () => Promise<void>, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await click();
  await (await chooser).setFiles(file);
}

/** Панель профиля пользователя (боковая, с заголовком «Профиль»). */
export function profilePanel(page: Page) {
  return page.getByRole("complementary").filter({ has: page.getByRole("heading", { name: "Профиль", exact: true }) });
}

/** Подтвердить окно-вопрос (askConfirm): заголовок с вопросом и кнопка подтверждения. */
export async function confirmDialog(page: Page, question: string | RegExp, okLabel: string | RegExp) {
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
  await page.getByRole("button", { name: okLabel }).last().click();
  await expect(page.getByRole("heading", { name: question })).toHaveCount(0);
}

/**
 * Строка контакта на экране «Контакты»: кнопка «аватар + имя + статус/ник», открывает профиль.
 * Имя может быть «своим» (переименован у себя).
 */
export function contactEntry(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^(\\S{1,2}\\s+)?${esc(name)}\\s+(в сети|был|@)`) });
}

/**
 * Действие в строке контакта («Написать», «Переименовать у себя», «Заблокировать»,
 * «Удалить из контактов»). Кнопки показываются только при наведении на строку (как в tweb),
 * поэтому сначала наводим курсор на контакт.
 * TODO(a11y): у строки контакта нет роли (listitem/row) — кнопки не привязаны к контакту
 * по доступному имени; сценарии держат одного контакта, чтобы имя кнопки было однозначным.
 */
export async function rowAction(page: Page, contact: string, action: string | RegExp) {
  await contactEntry(page, contact).hover();
  await page.getByRole("button", { name: action, exact: typeof action === "string" }).click();
}
