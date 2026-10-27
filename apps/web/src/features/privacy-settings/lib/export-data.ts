import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { exportData } from "../api/privacy-settings";

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** «Выгрузить переписку и медиа»: JSON-история и каждое вложение отдельным файлом — exportData в views/settings/index.js. */
export async function exportMyData() {
  let data;
  try {
    const res = await exportData();
    data = res?.data ?? res;
  } catch (err) {
    toast(errorText(err, "Не удалось выгрузить данные"));
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), `shalter_export_${stamp}.json`);

  const media = ((data as { media?: { url?: unknown; name?: string }[] }).media ?? []).filter(
    (m): m is { url: string; name?: string } => typeof m.url === "string" && m.url.startsWith("/uploads/")
  );
  if (!media.length) {
    toast("Готово: история экспортирована");
    return;
  }
  toast(`Экспорт: история + ${media.length} вложений…`);
  let ok = 0;
  let fail = 0;
  for (const m of media) {
    try {
      const r = await fetch(m.url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      download(await r.blob(), m.name || m.url.slice("/uploads/".length));
      ok++;
    } catch {
      fail++;
    }
  }
  toast(`Экспорт готов: ${ok}${fail ? ` (+ ${fail} не удалось)` : ""}`);
}
