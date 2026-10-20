const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { buildUserExport } = require("../data/dataExport");

const router = express.Router();
router.use(requireUserId);

// «Экспорт данных» для самого пользователя (право на переносимость): выгружает
// переписку и манифест вложений. Сами файлы (фото/видео/голосовые) качаются
// клиентом по ссылкам data.media[].url — обычному участнику его чатов отдать
// файл могут, поэтому отдельный роут не нужен. Журналировать не нужно: это
// выгрузка своих данных, а не запрос юридического отдела.
router.get(
  "/",
  asyncRoute(async (req, res) => {
    // Чужие телефоны — с учётом их приватности, как в профиле.
    const data = await buildUserExport(req.uid, { respectPrivacy: true, forSelf: true });
    if (!data) return res.status(404).json({ error: "Пользователь не найден" });
    res.json({ data });
  })
);

module.exports = router;
