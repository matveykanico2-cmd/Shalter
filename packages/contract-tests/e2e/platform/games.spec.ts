// Игры: встроенная игра из каталога отправляется карточкой в чат, собеседник играет,
// его рекорд виден в таблице рекордов чата; своя игра создаётся в «Настройки → Игры»,
// код подаётся через Game API, рекорд из игры попадает в таблицу, игру находят другие.
import { test, expect } from "../support/fixtures";
import { createDm } from "../../support/seed";
import { composer, navLink } from "../support/ui";
import { gameApi, esc } from "./helpers";

test("2048 из каталога — карточкой в чат; собеседник играет, рекорд виден обоим", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const chat = await createDm(alice, boris);

  const a = (await openAs(alice.api, `/chat/${chat.id}`)).page;
  const b = (await openAs(boris.api, `/chat/${chat.id}`)).page;
  await expect(composer(a)).toBeVisible();

  // Вложение → «Кубик и игры» → каталог игр → поиск → «В чат».
  await a.getByRole("button", { name: "Вложение", exact: true }).click();
  await a.getByRole("button", { name: "Кубик и игры" }).click();
  await a.getByRole("button", { name: /Игры — 2048, Змейка/ }).click();
  await expect(a.getByRole("heading", { name: /Игры/ })).toBeVisible();
  await expect(a.getByText("Змейка", { exact: true })).toBeVisible();
  await a.getByPlaceholder("Поиск игр").fill("2048");
  await expect(a.getByText("Змейка", { exact: true })).toHaveCount(0);
  await a.getByRole("button", { name: "В чат", exact: true }).click();

  // Карточка игры приходит собеседнику вживую.
  const play = b.getByRole("button", { name: /Играть/ });
  await expect(play).toBeVisible();
  await expect(b.getByText("Складывайте плитки до 2048")).toBeVisible();
  await play.click();

  // Игра открылась поверх чата; ходим стрелками, пока сервер не получит рекорд.
  const frame = b.getByTitle("2048", { exact: true });
  await expect(frame).toBeVisible();
  await frame.click();
  const best = async () => (await boris.api.get(`/api/games/builtin-2048/best`, { query: { chatId: chat.id } })).body.best ?? 0;
  // Счёт уходит на сервер через ~2 с после последнего хода — между сериями ходов ждём
  // без нажатий, тогда записанный рекорд равен итоговому счёту.
  await expect(async () => {
    for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"]) await b.keyboard.press(key);
    await expect.poll(best, { timeout: 4_000 }).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });
  const score = await best();
  await b.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(frame).toHaveCount(0);

  // Рекорды с карточки в чате: у Бориса и у Алисы — Борис с его счётом.
  for (const p of [b, a]) {
    await p.getByRole("button", { name: /Рекорды/ }).click();
    await expect(p.getByRole("heading", { name: /Рекорды · 2048/ })).toBeVisible();
    await expect(p.getByText("Лучшие результаты в этом чате")).toBeVisible();
    await expect(p.getByText("Борис", { exact: true }).last()).toBeVisible();
    await expect(p.getByText(String(score), { exact: true })).toBeVisible();
  }
});

// Таблица рекордов из окна запущенной игры — поверх игры (.game-scores-overlay выше .game-overlay).
test("«Рекорды» в окне игры показываются поверх игры", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/");
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "Игры", exact: true }).click();
  await page.getByPlaceholder("Поиск игр").fill("2048");
  await expect(page.getByRole("button", { name: "Играть", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(page.getByTitle("2048", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Рекорды", exact: true }).click();
  // Общая таблица 2048 может быть уже не пустой (её пишут другие тесты на том же сервере) — смотрим на заголовок.
  const scores = page.getByRole("heading", { name: /Рекорды · 2048/ });
  await expect(scores).toBeVisible();
  // Закрыть таблицу можно, только если она не перекрыта игрой.
  await page.getByRole("button", { name: "Закрыть", exact: true }).last().click({ timeout: 3_000 });
  await expect(scores).toHaveCount(0);
  await expect(page.getByTitle("2048", { exact: true })).toBeVisible();
});

test("своя игра: создание в настройках, токен Game API, рекорд из игры, игра в каталоге у других", async ({ newUser, openAs, baseUrl }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const suffix = `k${Date.now().toString(36)}`;
  const title = `Кликер ${suffix}`;

  const { page } = await openAs(alice.api, "/settings/games");
  await expect(page.getByText("Ваши игры — 0", { exact: true })).toBeVisible();
  await expect(page.getByText("У вас пока нет своих игр")).toBeVisible();
  await page.getByRole("button", { name: "Создать игру" }).click();
  await expect(page.getByRole("heading", { name: "Новая игра" })).toBeVisible();
  await page.getByPlaceholder("Название", { exact: true }).fill(title);
  await page.getByPlaceholder("Короткое описание (необязательно)").fill("Жмите кнопку");
  await page.getByRole("checkbox", { name: "Показывать в каталоге игр для всех" }).check();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Новая игра" })).toHaveCount(0);

  // Список «Ваши игры» обновляется сразу, без перезагрузки.
  await expect(page.getByText("Ваши игры — 1", { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  // Без кода игра — черновик: в каталог она попадёт после загрузки кода через Game API.
  await expect(page.getByText("черновик — загрузите код через Game API", { exact: true })).toBeVisible();

  // Токен Game API: подтверждение, показ токена один раз.
  await page.getByRole("button", { name: "API-токен", exact: true }).click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Токен Game API/ })).toBeVisible();
  const token = (await page.getByRole("code").textContent())!.trim();
  expect(token.length).toBeGreaterThan(10);

  // Сервер разработчика загружает код игры.
  const code = `<h1>${title}</h1><button onclick="Shalter.gameOver(77)">Финиш</button>`;
  const upd = await gameApi(baseUrl, token).post("updateGame", { code });
  expect(upd.status).toBe(200);

  // Код загружен — игра в каталоге.
  await page.reload();
  await expect(page.getByText("в каталоге", { exact: true })).toBeVisible();

  // Играем: игра сообщает результат, приложение ставит рекорд.
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  const game = page.getByTitle(title, { exact: true }).contentFrame();
  await game.getByRole("button", { name: "Финиш" }).click();
  await expect(page.getByText("Новый рекорд: 77!")).toBeVisible();
  const gameId = (await alice.api.get("/api/games/mine")).body.games[0].id;
  expect((await alice.api.get(`/api/games/${gameId}/scores`)).body.scores).toMatchObject([{ name: "Алиса", score: 77 }]);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();

  // Борис находит игру в общем каталоге (меню → «Игры») и открывает её.
  const b = (await openAs(boris.api, "/")).page;
  await expect(navLink(b, "Чаты")).toBeVisible();
  await b.getByRole("button", { name: "Меню", exact: true }).click();
  await b.getByRole("button", { name: "Игры", exact: true }).click();
  await b.getByPlaceholder("Поиск игр").fill(suffix);
  await expect(b.getByText(title, { exact: true })).toBeVisible();
  await expect(b.getByText("Жмите кнопку", { exact: true })).toBeVisible();
  await expect(b.getByRole("button", { name: "Играть", exact: true })).toHaveCount(1);
  await b.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(b.getByTitle(title, { exact: true }).contentFrame().getByRole("button", { name: "Финиш" })).toBeVisible();
  await b.getByTitle(title, { exact: true }).contentFrame().getByRole("button", { name: "Финиш" }).click();
  await expect(b.getByText("Новый рекорд: 77!")).toBeVisible();
  await expect
    .poll(async () => (await boris.api.get(`/api/games/${gameId}/scores`)).body.scores.map((s: any) => s.name))
    .toEqual(expect.arrayContaining(["Алиса", "Борис"]));
});

test("новая игра сразу появляется в «Ваши игры» без перезагрузки", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const { page } = await openAs(alice.api, "/settings/games");
  await page.getByRole("button", { name: "Создать игру" }).click();
  await page.getByPlaceholder("Название", { exact: true }).fill("Мгновенная");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Ваши игры — 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Мгновенная", { exact: true })).toBeVisible();
});

// Поиск без учёта регистра и для кириллицы: «Кликер Супер» находится по «кликер».
test("каталог игр находит игру по кириллическому названию", async ({ newUser, openAs }) => {
  const alice = await newUser("Алиса");
  const boris = await newUser("Борис");
  const res = await alice.api.post("/api/games", { title: "Кликер Супер", code: "<p>x</p>", isPublic: true });
  expect(res.status).toBe(200);
  const { page } = await openAs(boris.api, "/");
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "Игры", exact: true }).click();
  await expect(page.getByText("Кликер Супер", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Поиск игр").fill("кликер");
  // Дождались результата поиска: встроенные игры под запрос не подходят и пропали.
  await expect(page.getByText("Змейка", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Кликер Супер", { exact: true })).toBeVisible();
});
