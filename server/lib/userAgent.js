// Minimal User-Agent parsing — good enough for a "Chrome, Linux" style
// device label in the Settings → Devices list. Not meant to be exhaustive.
function parseUserAgent(ua = "") {
  let browser = "Браузер";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "неизвестная ОС";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser}, ${os}`;
}

module.exports = { parseUserAgent };
