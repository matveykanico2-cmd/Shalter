// Sends one letter with whatever SMTP settings are in the environment, and says
// plainly what happened. Run it on the server *before* wiring the app up:
//
//   SMTP_URL='smtps://user%40domain:app-password@smtp.yandex.ru:465' \
//   MAIL_FROM='Shalter <no-reply@shalter.ru>' \
//   node scripts/mail-test.js you@example.com
//
// Separated from the app on purpose — when recovery mail doesn't arrive, the
// question is always "are the credentials right or is the code wrong", and this
// answers the first half on its own.
// Те же config.env/.env, что читает сервер, — иначе проверка судила бы
// о настройках, отличных от боевых.
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
    // Connect and log in before sending: a wrong password and a blocked port
    // both end as "письмо не ушло", but only one of them is fixed by editing
    // the password.
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
