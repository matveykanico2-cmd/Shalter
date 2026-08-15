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
const dns = require("dns").promises;
const { publicRecord } = require("../server/lib/dkim");

const MAIL_FROM = process.env.MAIL_FROM || "Shalter <no-reply@shalter.ru>";
const domain = ((MAIL_FROM.match(/<([^>]+)>/) || [null, MAIL_FROM])[1].split("@")[1] || "").trim();

async function main() {
  let ip = process.argv[2];
  if (!ip) {
    try {
      [ip] = await dns.resolve4(domain);
    } catch {
      ip = null;
    }
  }
  const dkim = publicRecord();

  console.log(`\nЗаписи для домена ${domain} (панель DNS у регистратора):\n`);
  console.log("1. SPF — какие серверы вправе отправлять почту от имени домена");
  console.log("   Тип: TXT   Имя: @ (сам домен)");
  console.log(`   Значение: v=spf1 ${ip ? `ip4:${ip} ` : ""}~all\n`);
  console.log("2. DKIM — открытая половина ключа, которым сервер подписывает письма");
  console.log(`   Тип: TXT   Имя: ${dkim.name}`);
  console.log(`   Значение: ${dkim.value}\n`);
  console.log("3. DMARC — что делать с письмами, не прошедшими первые две проверки");
  console.log("   Тип: TXT   Имя: _dmarc");
  console.log(`   Значение: v=DMARC1; p=none; rua=mailto:postmaster@${domain}\n`);
  if (!ip) {
    console.log(`Внимание: у ${domain} нет A-записи, IP для SPF подставить не из чего — укажите его аргументом.\n`);
  }
  console.log("Плюс одно, что делается не в DNS: попросите хостера поставить PTR");
  console.log(`(обратную запись) для ${ip || "IP сервера"} на ${domain}. Без неё часть провайдеров`);
  console.log("отклоняет письма ещё до проверки подписи.\n");
  console.log("Проверить, что записи разошлись (через несколько минут после добавления):");
  console.log(`   dig +short TXT ${domain} && dig +short TXT ${dkim.name}.${domain}\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
