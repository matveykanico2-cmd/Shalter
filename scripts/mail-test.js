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
const { sendMail, isMailConfigured } = require("../server/lib/mailer");

const to = process.argv[2];
if (!to) {
  console.error("Использование: node scripts/mail-test.js адрес@почта");
  process.exit(1);
}

(async () => {
  if (!process.env.SMTP_URL && !process.env.SMTP_HOST) {
    console.log("SMTP не задан — письмо будет записано в data/outbox вместо отправки.");
    console.log("Для реальной отправки задайте SMTP_URL (или SMTP_HOST/PORT/USER/PASS).");
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
