import { api } from "../api.js";
import { navigate } from "../router.js";

// Переход по объявлению: сначала считается клик, потом открывается ссылка.
// Счётчик — не причина задерживать человека, поэтому его ошибка проглатывается.
//
// Вынесено из двух мест сразу (chatList.js и discoverChannels.js), когда у
// объявлений появились внутренние ссылки: продавец маркета рекламирует свою
// витрину (/market/shop/…), и открывать её новой вкладкой браузера — значит
// выкидывать человека из приложения ради страницы этого же приложения.
export async function openAd(ad) {
  if (!ad) return;
  await api.clickAd(ad.id).catch(() => {});
  const url = ad.url;
  if (!url) return;
  // Внутренний адрес — роутером. Наружу — только http(s): в поле ссылки
  // кампании лежит текст, который написал рекламодатель, и открывать оттуда
  // javascript:/data: нельзя, что бы туда ни записали.
  if (url.startsWith("/")) navigate(url);
  else if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noreferrer");
}
