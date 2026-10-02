import { api } from "../api.js";
import { navigate } from "../router.js";

export async function openAd(ad) {
  if (!ad) return;
  await api.clickAd(ad.id).catch(() => {});
  const url = ad.url;
  if (!url) return;
  if (url.startsWith("/")) navigate(url);
  else if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noreferrer");
}
