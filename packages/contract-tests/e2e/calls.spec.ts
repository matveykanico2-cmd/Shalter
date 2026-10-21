// Аудиозвонок между двумя браузерами (камера и микрофон фейковые): входящий звонок,
// ответ, экран звонка у обоих, плавающий пузырь (PiP) при уходе на другой экран, сброс.
import { test, expect } from "./support/fixtures";
import { createDm, sendText } from "../support/seed";
import { chatRow, expectSignedIn, messageText, navLink } from "./support/ui";

const TIMER = /\d{2}:\d{2}/;
// Пузырь PiP: аватар-инициал, имя собеседника и таймер.
// В личке у чата нет названия — пузырь подписан именем собеседника.
const PIP_NAME = /^(Б\s*)?Борис\s*\d{2}:\d{2}$/;

test("аудиозвонок из лички: входящий, ответ, PiP при навигации, завершение", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  await sendText(alice, chat.id, "Сейчас позвоню");

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  // Борис — на главном экране, без открытого чата.
  const b = (await openAs(boris.api, "/")).page;
  await expectSignedIn(b);
  await expect(messageText(a, "Сейчас позвоню")).toBeVisible();

  // Алиса звонит из шапки лички.
  await a.getByRole("banner").getByRole("button", { name: "Позвонить", exact: true }).click();
  await expect(a).toHaveURL(/\/call\//);
  const hangupA = a.getByRole("button", { name: "Завершить", exact: true });
  await expect(hangupA).toBeVisible();

  // У Бориса — экран входящего звонка с именем звонящей.
  await expect(b.getByText("Входящий звонок", { exact: true })).toBeVisible();
  await expect(b.getByText("Алиса", { exact: true }).last()).toBeVisible();
  // Кнопка «Ответить» бесконечно «дышит» (CSS-анимация без prefers-reduced-motion),
  // поэтому «стабильной» для Playwright не бывает. Клик мышью с force изредка (~1 из 10
  // прогонов в одном воркере) не доходит до обработчика — запроса ответа нет, — поэтому
  // событие click отправляется прямо на кнопку.
  const answer = b.getByRole("button", { name: "Ответить", exact: true });
  await expect(answer).toBeEnabled();
  await answer.dispatchEvent("click");
  await expect(b.getByText("Входящий звонок", { exact: true })).toHaveCount(0);

  // Оба на экране звонка: идёт таймер разговора, есть «Микрофон» и «Завершить».
  await expect(b).toHaveURL(/\/call\//);
  for (const p of [a, b]) {
    await expect(p.getByRole("button", { name: "Завершить", exact: true })).toBeVisible();
    await expect(p.getByRole("button", { name: "Микрофон", exact: true })).toBeVisible();
    await expect(p.getByText(TIMER).first()).toBeVisible();
  }
  const callUrl = a.url();

  // Алиса уходит из звонка в переписку — звонок не обрывается, оболочка показывает
  // пузырь PiP с собеседником и таймером.
  await chatRow(a, "Борис", "Сейчас позвоню").click();
  await expect(a).toHaveURL(new RegExp(`/chat/${chat.id}$`));
  await expect(messageText(a, "Сейчас позвоню")).toBeVisible();
  const pip = a.getByRole("button", { name: PIP_NAME });
  await expect(pip).toBeVisible();
  // Пузырь переживает и переход в боковой раздел. (Если уйти в боковой раздел прямо
  // с экрана звонка, звонок не сворачивается — он остаётся в правой колонке.)
  await navLink(a, "Контакты").click();
  await expect(a).toHaveURL(/\/contacts$/);
  await expect(pip).toBeVisible();
  // У Бориса звонок всё ещё идёт.
  await expect(b.getByRole("button", { name: "Завершить", exact: true })).toBeVisible();

  // Нажатие на пузырь возвращает на экран звонка.
  await pip.click();
  await expect(a).toHaveURL(callUrl);
  await expect(hangupA).toBeVisible();
  await expect(pip).toHaveCount(0);

  // Алиса кладёт трубку — звонок завершается у обоих.
  await hangupA.click();
  await expect(a.getByRole("button", { name: "Завершить", exact: true })).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Завершить", exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await alice.api.get("/api/calls")).body.calls?.find((c: any) => c.chatId === chat.id)?.status)
    .toBe("completed");
});


test("звонящий сбросил до ответа: у него «Отменённый звонок», у собеседника — «Пропущенный»", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);
  const call = (await alice.api.post("/api/calls", { chatId: chat.id, kind: "voice" })).body.call;
  expect((await alice.api.patch(`/api/calls/${call.id}`, { status: "ended" })).status).toBe(200);

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  await expect(chatRow(a, "Борис", "📞 Отменённый звонок")).toBeVisible();
  await expect(a.locator(".bubble-call-title")).toHaveText("Отменённый звонок");

  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(chatRow(b, "Алиса", "📞 Пропущенный звонок")).toBeVisible();
  await expect(b.locator(".bubble-call-title")).toHaveText("Пропущенный звонок");
});
