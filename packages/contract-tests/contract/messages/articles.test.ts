// Статьи (Premium): сообщение type "article", текст — markdown с «# Заголовком» в первой
// строке, обложка — обычное вложение-картинка. До 20000 символов вместо 4096.
import { describe, expect, test } from "vitest";
import { messageEnvelope, sendResult } from "../../schemas/messages";
import { expectError, expectOk } from "../../support/expect";
import { createDm, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, registerAdmin } from "../stars/helpers";
import { msgs } from "./helpers";

const ADMIN_PHONE = "+70000000932";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });

let adminUser: TestUser;
async function premiumUser(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  const user = await registerUser(server().baseUrl);
  const res = await adminUser.api.post("/api/premium/grant", { userId: user.id });
  expect(res.status, res.text).toBe(200);
  return user;
}

const ARTICLE = "# Заголовок\n\nПервый абзац.\n\n- пункт\n- пункт";

describe("отправка", () => {
  test("Premium: type article, текст как есть, длиннее 4096 — можно", async () => {
    const author = await premiumUser();
    const reader = await registerUser(server().baseUrl);
    const dm = await createDm(author, reader);

    const sent = expectOk(await author.api.post(msgs(dm.id), { text: ARTICLE, article: true }), sendResult).message;
    expect(sent).toMatchObject({ type: "article", text: ARTICLE });
    const long = `# Длинная\n\n${"а".repeat(15000)}`;
    expect(expectOk(await author.api.post(msgs(dm.id), { text: long, article: true }), sendResult).message.text).toBe(long);
    expectError(await author.api.post(msgs(dm.id), { text: `# Слишком\n${"а".repeat(20000)}`, article: true }), 400, "Сообщение длиннее 20000 символов");
    // Обычное сообщение — по-прежнему до 4096.
    expectError(await author.api.post(msgs(dm.id), { text: "а".repeat(4097) }), 400, "Сообщение длиннее 4096 символов");

    const history = (await reader.api.get(msgs(dm.id))).body.messages;
    expect(history.find((m: { id: string }) => m.id === sent.id)).toMatchObject({ type: "article", text: ARTICLE });
  });

  test("без Premium — 403; без заголовка — 400; отложить нельзя", async () => {
    const [plain, other] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(plain, other);
    expectError(await plain.api.post(msgs(dm.id), { text: ARTICLE, article: true }), 403, "Создание статей доступно только с Shalter Premium");

    const author = await premiumUser();
    const dm2 = await createDm(author, other);
    expectError(await author.api.post(msgs(dm2.id), { text: "Без заголовка", article: true }), 400, "У статьи должен быть заголовок");
    const sendAt = new Date(Date.now() + 3_600_000).toISOString();
    expectError(await author.api.post(msgs(dm2.id, "/scheduled"), { text: ARTICLE, article: true, sendAt }), 400, "Статью нельзя отложить — опубликуйте её сразу");
  });

  test("пересылка статьи — тоже статья, Premium у пересылающего не нужен", async () => {
    const author = await premiumUser();
    const [reader, friend] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(author, reader);
    const sent = expectOk(await author.api.post(msgs(dm.id), { text: ARTICLE, article: true }), sendResult).message;
    const dm2 = await createDm(reader, friend);
    const fwd = await sendText(reader, dm2.id, "", { forwardedFrom: { messageId: sent.id } });
    expect(fwd).toMatchObject({ type: "article", text: ARTICLE });
  });
});

describe("правка", () => {
  test("до 20000 символов, заголовок обязателен", async () => {
    const author = await premiumUser();
    const reader = await registerUser(server().baseUrl);
    const dm = await createDm(author, reader);
    const sent = expectOk(await author.api.post(msgs(dm.id), { text: ARTICLE, article: true }), sendResult).message;

    const edited = `# Новый заголовок\n\n${"б".repeat(5000)}`;
    expect(expectOk(await author.api.patch(msgs(dm.id, `/${sent.id}`), { text: edited }), messageEnvelope).message).toMatchObject({ type: "article", text: edited });
    expectError(await author.api.patch(msgs(dm.id, `/${sent.id}`), { text: "без заголовка" }), 400, "У статьи должен быть заголовок");
  });
});
