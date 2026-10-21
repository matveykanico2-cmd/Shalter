// Платный пост в канале: подписчик видит размытую заглушку с ценой, открывает
// пост за звёзды и видит фото; звёзды уходят автору. Без звёзд — отказ и окно покупки.
// Пост публикуется через API (составление платного поста — отдельный сценарий композера).
import { economyTest, expect, grantStars, starsBalance, uploadPhoto } from "./helpers";
import { createChannel } from "../../support/seed";
import type { TestUser } from "../../support/seed";
import { messageText } from "../support/ui";

const test = economyTest();

async function publishPaidPost(owner: TestUser, channelId: string, text: string, photoName: string, stars: number) {
  const att = await uploadPhoto(owner.api, photoName);
  const res = await owner.api.post(`/api/posts/${channelId}/publish`, { text, attachments: [att], paidMedia: { stars } });
  expect(res.status, res.text).toBe(200);
  return res.body.message;
}

test("подписчик открывает платное фото за звёзды, автор видит его сразу и получает звёзды", async ({ newUser, openAs, admin }) => {
  const owner = await newUser("Ольга");
  const sub = await newUser("Борис");
  const channel = await createChannel(owner, [sub], { title: "Закрытые кадры" });
  await grantStars(admin, sub, 10);
  const b = (await openAs(sub.api, `/chat/${channel.id}`)).page;
  await expect(b.getByRole("banner").getByText("Закрытые кадры")).toBeVisible();

  // Пост приходит подписчику вживую — сразу заглушкой.
  await publishPaidPost(owner, channel.id, "Кадр дня", "kadr-dnya.png", 3);
  await expect(messageText(b, "Кадр дня")).toBeVisible();
  // Заглушка: цена и что внутри, самого фото нет.
  const unlock = b.getByRole("button", { name: "Открыть за 3", exact: true });
  await expect(unlock).toBeVisible();
  await expect(b.getByText("1 фото", { exact: true })).toBeVisible();
  await expect(b.getByRole("img", { name: "kadr-dnya.png" })).toHaveCount(0);

  // Автор канала видит фото без оплаты.
  const o = (await openAs(owner.api, `/chat/${channel.id}`)).page;
  await expect(o.getByRole("img", { name: "kadr-dnya.png" })).toBeVisible();
  await expect(o.getByRole("button", { name: "Открыть за 3", exact: true })).toHaveCount(0);

  // Подтверждение с ценой → фото открыто.
  await unlock.click();
  await expect(b.getByRole("heading", { name: /Открыть 1 фото за 3.*\? Звёзды получит автор канала\./ })).toBeVisible();
  await b.getByRole("button", { name: "Открыть за 3 ⭐" }).click();
  await expect(b.getByText("Пост открыт")).toBeVisible();
  expect(await starsBalance(sub)).toBe(7);
  expect(await starsBalance(owner)).toBe(3);

  // Фото открыто сразу и остаётся открытым после перезагрузки.
  await expect(b.getByRole("img", { name: "kadr-dnya.png" })).toBeVisible();
  await b.reload();
  await expect(b.getByRole("img", { name: "kadr-dnya.png" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Открыть за 3", exact: true })).toHaveCount(0);
});

test("без звёзд пост не открывается — подсказка и окно покупки звёзд", async ({ newUser, openAs }) => {
  const owner = await newUser("Ольга");
  const sub = await newUser("Борис");
  const channel = await createChannel(owner, [sub], { title: "Дорогие кадры" });
  await publishPaidPost(owner, channel.id, "Эксклюзив", "exclusive.png", 5);

  const b = (await openAs(sub.api, `/chat/${channel.id}`)).page;
  await b.getByRole("button", { name: "Открыть за 5", exact: true }).click();
  await b.getByRole("button", { name: "Открыть за 5 ⭐" }).click();
  await expect(b.getByText(/Не хватает звёзд: нужно 5/)).toBeVisible();
  // Сразу предлагается купить звёзды.
  await expect(b.getByText("Купить звёзды")).toBeVisible();
  await expect(b.getByText(/^Баланс\s*0$/)).toBeVisible();
  await b.getByRole("button", { name: "Закрыть" }).click();
  await expect(b.getByText("Купить звёзды")).toHaveCount(0);
  // Пост по-прежнему закрыт.
  await expect(b.getByRole("button", { name: "Открыть за 5", exact: true })).toBeVisible();
  await expect(b.getByRole("img", { name: "exclusive.png" })).toHaveCount(0);
});

// Пост пришёл вживую, подписчик сразу открывает его: пока висит подтверждение, лента
// может перечитаться и пересоздать пузырь закрытым — после оплаты фото видно и в нём.
test("фото открывается сразу после оплаты поста, пришедшего вживую", async ({ newUser, openAs, admin }) => {
  const owner = await newUser("Ольга");
  const sub = await newUser("Борис");
  const channel = await createChannel(owner, [sub], { title: "Живой канал" });
  await grantStars(admin, sub, 10);

  const b = (await openAs(sub.api, `/chat/${channel.id}`)).page;
  await expect(b.getByRole("banner").getByText("Живой канал")).toBeVisible();
  await publishPaidPost(owner, channel.id, "Платный кадр", "live-kadr.png", 2);
  await expect(messageText(b, "Платный кадр")).toBeVisible();
  await b.getByRole("button", { name: "Открыть за 2", exact: true }).click();
  await b.getByRole("button", { name: "Открыть за 2 ⭐" }).click();
  await expect(b.getByText("Пост открыт")).toBeVisible();
  await expect(b.getByRole("img", { name: "live-kadr.png" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Открыть за 2", exact: true })).toHaveCount(0);
});
