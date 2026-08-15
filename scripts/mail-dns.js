#!/usr/bin/env node
// Prints the DNS records that make this server's mail acceptable to strict
// providers — Gmail in particular, which refuses anonymous mail outright.
//
//   node scripts/mail-dns.js [ip]
//
// Everything here is derived, not invented: the DKIM key is the one the server
// actually signs with (generating it on first run if needed), and the IP
// defaults to whatever the sending domain's A record points at — i.e. this
// deployment's own server. Pass an address to override.
//
// These three records are the entire manual part of sending mail. There is no
// code-only substitute: they are a domain owner's signed statement that this
// server may send as this domain, and only whoever controls the domain's DNS
// can make it.
// Те же config.env/.env, что читает сервер, — иначе проверка судила бы
// о настройках, отличных от боевых.
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
