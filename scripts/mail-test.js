require("../server/lib/loadConfig");
const { sendMail, verifySmtp } = require("../server/lib/mailer");

const to = process.argv[2];
if (!to) {
  console.error("Использование: node scripts/mail-test.js адрес@почта");
  process.exit(1);
}

(async () => {
  if (!process.env.SMTP_URL && !process.env.SMTP_HOST) {
    console.log("SMTP не задан — письмо уйдёт напрямую на сервер получателя, а если он откажет, ляжет в data/outbox.");
    console.log("Для отправки через ящик задайте SMTP_URL (или SMTP_HOST/PORT/USER/PASS).");
  } else {
    const check = await verifySmtp();
    if (check.ok) console.log("Подключение и вход на SMTP-сервер: успешно.");
    else {
      console.error(`Не удалось подключиться к SMTP-серверу: ${check.error}`);
      if (/535|Authentication|credentials/i.test(check.error)) {
        console.error("Похоже на неверный логин или пароль. Для Яндекса нужен ПАРОЛЬ ПРИЛОЖЕНИЯ, а не пароль от почты,");
        console.error("и в SMTP_URL символ @ внутри логина пишется как %40.");
      } else if (/ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(check.error)) {
        console.error("Похоже, исходящее соединение на этот порт закрыто — проверьте фаервол хостера (587 и 465).");
      } else if (/ENOTFOUND|EAI_AGAIN/i.test(check.error)) {
        console.error("Не разрешается имя сервера — опечатка в SMTP_HOST?");
      }
      process.exit(1);
    }
  }
  const res = await sendMail({
    to,
    subject: "Проверка отправки Shalter",
    text: "Если вы это читаете — почта настроена верно.\n\nЭто тестовое письмо, отвечать не нужно.",
  });
  if (res.delivered && res.outbox) console.log(`Записано в ${res.outbox} (SMTP не настроен).`);
  else if (res.delivered) console.log(`Отправлено на ${to}. Проверьте входящие и папку «Спам».`);
  else console.error(`Не отправлено: ${res.reason}. Смотрите сообщение об ошибке выше.`);
  process.exit(res.delivered ? 0 : 1);
})();
