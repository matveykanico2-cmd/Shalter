const dns = require("dns").promises;
const { publicRecord } = require("./dkim");

// Какие DNS-записи нужны, чтобы письма этого сервера принимали, и какие из них
// уже опубликованы.
//
// Это единственная часть отправки почты, которую нельзя сделать кодом: записи —
// подпись владельца домена под тем, что этот сервер вправе слать от его имени.
// Зато можно сделать всё остальное: посчитать их точные значения, проверить, что
// уже стоит в DNS, и показать это администратору в самом приложении — потому что
// консоли у него может не быть вовсе (см. routes/admin.js's /mail-status).

const MAIL_FROM_DEFAULT = "Shalter <no-reply@shalter.ru>";

function senderDomain() {
  const from = process.env.MAIL_FROM || MAIL_FROM_DEFAULT;
  return ((from.match(/<([^>]+)>/) || [null, from])[1].split("@")[1] || "").trim().toLowerCase();
}

// Адрес, с которого письма уходят наружу. Спросить об этом саму машину нельзя:
// за NAT она знает только внутренний. Поэтому спрашиваем у того, кто нас видит.
async function detectPublicIp() {
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) });
    const ip = (await res.text()).trim();
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

async function txtRecords(name) {
  try {
    return (await dns.resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

// Добавляет ip4:<ip> в существующую SPF-запись, не выбрасывая то, что там уже
// есть. Затирать чужие механизмы нельзя: у домена может быть include почтового
// провайдера, и без него перестанет проходить проверка у писем, отправленных
// через него.
function spfWith(existing, ip) {
  if (!ip) return existing || "v=spf1 ~all";
  if (!existing) return `v=spf1 ip4:${ip} ~all`;
  if (existing.includes(`ip4:${ip}`)) return existing;
  return existing.replace(/\s*([~+-]?all)\s*$/, ` ip4:${ip} $1`);
}

async function buildDnsAdvice() {
  const domain = senderDomain();
  if (!domain) return { domain: null, ip: null, records: [] };

  const [ip, rootTxt, dmarcTxt] = await Promise.all([detectPublicIp(), txtRecords(domain), txtRecords(`_dmarc.${domain}`)]);
  const dkim = publicRecord();
  const dkimTxt = await txtRecords(`${dkim.name}.${domain}`);

  const currentSpf = rootTxt.find((t) => t.toLowerCase().startsWith("v=spf1")) ?? null;
  const wantSpf = spfWith(currentSpf, ip);
  const wantDmarc = `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`;

  return {
    domain,
    ip,
    records: [
      {
        kind: "SPF",
        name: "@",
        value: wantSpf,
        current: currentSpf,
        // Опубликованной считается запись, которая разрешает именно наш адрес,
        // а не любая существующая: SPF у домена обычно уже есть и разрешает
        // чужой почтовый сервис, а нас — нет.
        published: !!currentSpf && (!ip || currentSpf.includes(`ip4:${ip}`)),
        note: "Разрешает этому серверу слать письма от имени домена. Существующее значение сохранено — добавлен только адрес сервера.",
      },
      {
        kind: "DKIM",
        name: dkim.name,
        value: dkim.value,
        current: dkimTxt[0] ?? null,
        published: dkimTxt.some((t) => t.replace(/\s+/g, "") === dkim.value.replace(/\s+/g, "")),
        note: "Открытая половина ключа, которым сервер подписывает каждое письмо. Без неё gmail отклоняет письма как анонимные.",
      },
      {
        kind: "DMARC",
        name: "_dmarc",
        value: wantDmarc,
        current: dmarcTxt[0] ?? null,
        published: dmarcTxt.some((t) => t.toLowerCase().startsWith("v=dmarc1")),
        note: "Что делать с письмами, не прошедшими две проверки выше. Необязательна, но повышает доверие к домену.",
      },
    ],
  };
}

module.exports = { buildDnsAdvice, senderDomain, detectPublicIp };
