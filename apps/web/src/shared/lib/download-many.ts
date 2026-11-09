export type DownloadItem = { url: string; name?: string };

function fileName(item: DownloadItem, index: number) {
  if (item.name?.trim()) return item.name.trim();
  try {
    const name = decodeURIComponent(new URL(item.url, location.href).pathname.split("/").pop() ?? "");
    if (name) return name;
  } catch {
    // Ниже будет безопасное имя.
  }
  return `shalter-${index + 1}`;
}

function clickDownloads(items: readonly DownloadItem[]) {
  items.forEach((item, index) => {
    const link = document.createElement("a");
    link.href = item.url;
    link.download = fileName(item, index);
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
  });
}

/** На телефоне отдаём все файлы одним системным листом, иначе запускаем обычные скачивания. */
export async function downloadMany(items: readonly DownloadItem[]) {
  if (!items.length) return 0;
  const share = navigator.share?.bind(navigator);
  if (!share || typeof File === "undefined") {
    clickDownloads(items);
    return items.length;
  }
  try {
    const files: File[] = [];
    for (const [index, item] of items.entries()) {
      const response = await fetch(item.url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`download ${response.status}`);
      const blob = await response.blob();
      files.push(new File([blob], fileName(item, index), { type: blob.type || "application/octet-stream" }));
    }
    if (navigator.canShare?.({ files }) !== false) {
      await share({ files, title: files.length === 1 ? files[0]?.name : `Файлы Shalter (${files.length})` });
      return files.length;
    }
  } catch (error) {
    // Отмена системного листа — не начинаем неожиданные скачивания.
    if (error instanceof DOMException && error.name === "AbortError") return 0;
  }
  clickDownloads(items);
  return items.length;
}
