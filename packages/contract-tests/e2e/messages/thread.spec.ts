// Обсуждение сообщения в группе («Ответить в теме»): панель «Тема» с ответами.
import { test, expect } from "../support/fixtures";
import { createGroup, sendText } from "../../support/seed";
import { composer, messageText } from "../support/ui";
import { messageAction } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * Панель темы.
 * TODO(a11y): панель — <aside> без доступного имени; отличаем её от инфо-панели
 * чата по заголовку «Тема». Когда у панели появится aria-label, искать по нему.
 */
function threadPanel(page: Page) {
  return page.getByRole("complementary").filter({ has: page.getByRole("heading", { name: "Тема", exact: true }) });
}

test("ответ в теме: панель с ответами, счётчик ответов под сообщением у остальных", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const group = await createGroup(alice, [boris], { title: "Дача" });
  await sendText(alice, group.id, "Кто едет в субботу?");
  await sendText(alice, group.id, "Отвечайте в теме");

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  await expect(messageText(a, "Отвечайте в теме")).toBeVisible();
  await expect(messageText(b, "Отвечайте в теме")).toBeVisible();

  // Борис: меню сообщения → «Ответить в теме» → панель «Тема» с исходным сообщением.
  await messageAction(b, "Кто едет в субботу?", "Ответить в теме");
  const panel = threadPanel(b);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Кто едет в субботу?")).toBeVisible();
  await expect(panel.getByText("Ответы (0)")).toBeVisible();
  await expect(panel.getByText("Пока нет ответов — начните тему первым")).toBeVisible();

  // Ответ из поля ввода панели.
  const box = panel.getByRole("textbox", { name: "Сообщение", exact: true });
  await box.fill("Я еду");
  await box.press("Enter");
  await expect(panel.getByText("Ответы (1)")).toBeVisible();
  await expect(panel.getByText("Я еду", { exact: true })).toBeVisible();

  // В основной ленте ответа нет, под исходным сообщением — «💬 1 ответ», и у Алисы тоже (вживую).
  await expect(b.getByRole("button", { name: "💬 1 ответ" })).toBeVisible();
  await expect(a.getByRole("button", { name: "💬 1 ответ" })).toBeVisible();
  await expect(messageText(a, "Я еду")).toHaveCount(0);

  // Алиса открывает тему по счётчику и отвечает — Борис видит ответ в открытой панели вживую.
  await a.getByRole("button", { name: "💬 1 ответ" }).click();
  const panelA = threadPanel(a);
  await expect(panelA.getByText("Я еду", { exact: true })).toBeVisible();
  await expect(panelA.getByText("Борис", { exact: true })).toBeVisible();
  const boxA = panelA.getByRole("textbox", { name: "Сообщение", exact: true });
  await boxA.fill("Отлично, беру мангал");
  await boxA.press("Enter");
  await expect(panel.getByText("Отлично, беру мангал")).toBeVisible();
  await expect(panel.getByText("Ответы (2)")).toBeVisible();
  await expect(b.getByRole("button", { name: "💬 2 ответа" })).toBeVisible();

  // Escape закрывает панель; основное поле ввода снова единственное.
  await a.keyboard.press("Escape");
  await expect(panelA).toHaveCount(0);
  await expect(composer(a)).toBeVisible();

  // Ответы сохраняются: после перезагрузки счётчик на месте.
  await a.reload();
  await expect(a.getByRole("button", { name: "💬 2 ответа" })).toBeVisible();
});
