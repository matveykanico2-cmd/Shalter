const dns = require("dns").promises;
const { publicRecord } = require("./dkim");

const MAIL_FROM_DEFAULT = "Shalter <no-reply@your-domain.example>";

function senderDomain() {
  const from = process.env.MAIL_FROM || MAIL_FROM_DEFAULT;
  return ((from.match(/<([^>]+)>/) || [null, from])[1].split("@")[1] || "").trim().toLowerCase();
}

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
