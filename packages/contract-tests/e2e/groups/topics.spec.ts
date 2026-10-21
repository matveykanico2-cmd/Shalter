// Темы в группе (форум): админ включает темы, создаёт тему и пишет в неё;
// участник видит вкладку темы и сообщение только в ней.
import { test, expect } from "../support/fixtures";
import { createGroup, sendText } from "../../support/seed";
import { composer, messageText, sendMessage } from "../support/ui";
import { chatMenu } from "./helpers";

test("админ включает темы и создаёт тему — участник читает её во вкладке", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const group = await createGroup(alice, [boris], { title: `Форум ${Date.now()}` });
  await sendText(alice, group.id, "Общий вопрос");
  const topic = `Расписание ${Date.now()}`;

  const a = (await openAs(alice.api, `/chat/${group.id}`)).page;
  await expect(messageText(a, "Общий вопрос")).toBeVisible();
  await expect(a.getByRole("tablist")).toHaveCount(0);

  await chatMenu(a, "Включить темы");
  const tabs = a.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "Все", exact: true })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /Общее$/ })).toBeVisible();

  // «Новая тема» → окно с названием → «Создать»: новая вкладка выбрана.
  await a.getByRole("button", { name: "Новая тема", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Новая тема" })).toBeVisible();
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(a.getByText("Введите название")).toBeVisible();
  await a.getByPlaceholder("Название темы").fill(topic);
  await a.getByRole("button", { name: "Создать", exact: true }).click();
  const topicTab = tabs.getByRole("tab", { name: new RegExp(topic) });
  await expect(topicTab).toHaveAttribute("aria-selected", "true");
  await expect(composer(a)).toBeVisible();
  await sendMessage(a, "Встреча в 19:00");
  await expect(messageText(a, "Встреча в 19:00")).toBeVisible();

  // Участник открывает группу: вкладки тем на месте.
  const b = (await openAs(boris.api, `/chat/${group.id}`)).page;
  const bTabs = b.getByRole("tablist");
  const bTopic = bTabs.getByRole("tab", { name: new RegExp(topic) });
  await expect(bTopic).toBeVisible();
  // Во вкладке «Общее» сообщения темы нет, общее сообщение есть.
  await bTabs.getByRole("tab", { name: /Общее$/ }).click();
  await expect(messageText(b, "Общий вопрос")).toBeVisible();
  await expect(messageText(b, "Встреча в 19:00")).toHaveCount(0);
  // Во вкладке темы — только её сообщения; ответ уходит в тему и виден Алисе вживую.
  await bTopic.click();
  await expect(bTopic).toHaveAttribute("aria-selected", "true");
  await expect(messageText(b, "Встреча в 19:00")).toBeVisible();
  await expect(messageText(b, "Общий вопрос")).toHaveCount(0);
  await sendMessage(b, "Буду");
  await expect(messageText(a, "Буду")).toBeVisible();

  // Сервер: тема есть, ответ Бориса привязан к ней.
  const topics = (await alice.api.get(`/api/chats/${group.id}/topics`)).body.topics;
  const created = topics.find((t: any) => t.title === topic);
  expect(created).toBeTruthy();
  const history = (await alice.api.get(`/api/chats/${group.id}/messages`)).body.messages;
  expect(history.find((m: any) => m.text === "Буду")?.topicId).toBe(created.id);
});
