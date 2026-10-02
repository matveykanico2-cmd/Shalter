#!/usr/bin/env node
require("../server/lib/loadConfig");
const { buildDnsAdvice } = require("../server/lib/mailDns");

const MAIL_FROM = process.env.MAIL_FROM || "Shalter <no-reply@shalter.ru>";
const domain = ((MAIL_FROM.match(/<([^>]+)>/) || [null, MAIL_FROM])[1].split("@")[1] || "").trim();

async function main() {
  const advice = await buildDnsAdvice();
  if (!advice.domain) {
    console.error("MAIL_FROM не задан — непонятно, для какого домена считать записи.");
    process.exit(1);
  }

  console.log(`\nЗаписи для домена ${advice.domain}${advice.ip ? ` (адрес сервера ${advice.ip})` : ""} — панель DNS у регистратора:\n`);
  for (const r of advice.records) {
    console.log(`${r.kind} — ${r.note}`);
    console.log(`   Тип: TXT   Имя: ${r.name}`);
    console.log(`   Значение: ${r.value}`);
    console.log(`   Сейчас: ${r.published ? "опубликована" : r.current ? `другое значение — ${r.current}` : "нет записи"}\n`);
  }
  if (!advice.ip) {
    console.log("Внешний адрес сервера определить не удалось — SPF показан без него.\n");
  }
  console.log("Плюс одно, что делается не в DNS: попросите хостера поставить PTR");
  console.log(`(обратную запись) для ${advice.ip || "IP сервера"} на ${advice.domain}.\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
