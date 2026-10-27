// Сторож сети: подключается через NODE_OPTIONS=--require к процессу сервера и
// воркерам Vitest, когда задан SHALTER_NET_GUARD_LOG. Любое соединение или
// DNS-запрос не на loopback отклоняется (как будто сети нет) и записывается
// строкой JSON в этот файл. Так проверяется критерий «прогон не зависит от сети».
"use strict";

const fs = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");

const logFile = process.env.SHALTER_NET_GUARD_LOG;

if (logFile) {
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "::", "::ffff:127.0.0.1"]);
  const isLocal = (host) => !host || LOCAL_HOSTS.has(host) || /^127\./.test(host) || host.endsWith(".localhost");

  const record = (kind, target) => {
    const stack = (new Error().stack || "")
      .split("\n")
      .slice(2)
      .map((l) => l.trim())
      .filter((l) => !l.includes("net-guard.cjs") && !l.includes("node:"))
      .slice(0, 4);
    const line = { kind, target, pid: process.pid, script: process.argv[1] || "", stack };
    try {
      fs.appendFileSync(logFile, JSON.stringify(line) + "\n");
    } catch {}
  };

  const refused = (target) => Object.assign(new Error(`net-guard: сеть недоступна в тестах (${target})`), { code: "ECONNREFUSED" });

  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let opts = args[0];
    if (Array.isArray(opts)) opts = opts[0];
    let host;
    let port;
    let path;
    if (opts && typeof opts === "object") {
      host = opts.host;
      port = opts.port;
      path = opts.path;
    } else if (typeof opts === "number" || (typeof opts === "string" && /^\d+$/.test(opts))) {
      port = opts;
      host = typeof args[1] === "string" ? args[1] : undefined;
    } else if (typeof opts === "string") {
      path = opts;
    }
    if (!path && !isLocal(host)) {
      const target = `${host}:${port}`;
      record("connect", target);
      process.nextTick(() => this.destroy(refused(target)));
      return this;
    }
    return origConnect.apply(this, args);
  };

  const guardLookup = (orig) =>
    function (hostname, ...rest) {
      if (typeof hostname === "string" && !isLocal(hostname) && net.isIP(hostname) === 0) {
        record("dns", hostname);
        const cb = rest.find((a) => typeof a === "function");
        const err = Object.assign(new Error(`net-guard: DNS недоступен в тестах (${hostname})`), { code: "ENOTFOUND", hostname });
        if (cb) return void process.nextTick(() => cb(err));
        return Promise.reject(err);
      }
      return orig.call(this, hostname, ...rest);
    };

  for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveMx", "resolveTxt", "resolveSrv", "resolveCname", "resolveNs"]) {
    if (typeof dns[name] === "function") dns[name] = guardLookup(dns[name]);
    if (dns.promises && typeof dns.promises[name] === "function") dns.promises[name] = guardLookup(dns.promises[name]);
  }
  for (const R of [dns.Resolver, dns.promises && dns.promises.Resolver]) {
    if (!R) continue;
    for (const name of Object.getOwnPropertyNames(R.prototype)) {
      if (/^resolve/.test(name) && typeof R.prototype[name] === "function") R.prototype[name] = guardLookup(R.prototype[name]);
    }
  }
}
