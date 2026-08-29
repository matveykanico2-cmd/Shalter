const crypto = require("crypto");
const http = require("http");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat } = require("../data/chats");
const { getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { isStaff } = require("../lib/chatPermissions");
const { broadcastToUsers } = require("../ws");
const live = require("../data/liveStreams");
const rtmp = require("../rtmp");

// Эфиры в каналах и группах: ведущий вещает звук и видео, слушатели смотрят,
// а кому-то из них ведущий может дать слово. Плюс чат внутри самого эфира.
//
// Медиа сюда не заходит вообще: сервер раздаёт только состояние (кто в эфире,
// у кого какая роль) и служит почтой для WebRTC-сигналов (server/ws.js). Сами
// звук и видео идут напрямую между браузерами — как и в звонках.
//
// Честно о масштабе: связь «каждый с каждым», без промежуточного сервера,
// который пересобирал бы потоки (SFU). Ведущий отправляет свою картинку
// отдельно каждому зрителю, поэтому это эфир на десяток-полтора человек, а не
// на стадион. Для стадиона нужен SFU — отдельная служба, которой в этом
// проекте нет и которую нельзя изобразить парой строк.
const router = express.Router();
router.use(requireUserId);

const MAX_MESSAGE_LEN = 500;

async function loadStream(req, res) {
  const stream = live.getStream(req.params.id);
  if (!stream) {
    res.status(404).json({ error: "Эфир не найден" });
    return null;
  }
  const chat = await getChat(stream.chatId);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(403).json({ error: "Нет доступа к этому эфиру" });
    return null;
  }
  return { stream, chat };
}

function requireHost(stream, req, res) {
  if (stream.hostId !== req.uid) {
    res.status(403).json({ error: "Управлять эфиром может только ведущий" });
    return false;
  }
  return true;
}

// Завершение — единственное действие, доступное не только ведущему: эфир
// принадлежит чату, и тот, кто вправе его начать, вправе и выключить. Без
// этого брошенный эфир (ведущий закрыл вкладку, ушёл из канала, начал его
// второй администратор) висел «в эфире» навсегда, и снять плашку было некому:
// остальное управление — слово, микрофоны — по-прежнему только у ведущего.
function canStopStream(stream, chat, userId) {
  return stream.hostId === userId || isStaff(chat, userId);
}

// Полное состояние: сам эфир, участники с карточками и хвост чата. Один
// запрос, потому что клиенту при входе нужно всё сразу, а три отдельных
// показали бы экран, собирающийся по частям.
// Что показать ведущему для OBS. Только ему и только для rtmp-эфира: ключ —
// это пароль на вещание, и лишний человек с ним подменит картинку в чужом
// эфире. Хост берётся из заголовка запроса — сервер не знает, под каким именем
// к нему приходят снаружи (см. rtmp.ingestUrlFor).
function ingestFor(stream, req) {
  if (stream.source !== "rtmp" || stream.hostId !== req.uid) return null;
  return { url: rtmp.ingestUrlFor(req.headers.host), key: live.getStreamKey(stream.id) };
}

async function stateOf(stream) {
  const participants = live.listParticipants(stream.id);
  const users = await Promise.all(participants.map((p) => getUser(p.userId)));
  const messages = live.listMessages(stream.id);
  const authors = await Promise.all(messages.map((m) => getUser(m.userId)));
  return {
    stream,
    participants: participants.map((p, i) => ({ ...p, user: users[i] ? publicUser(users[i]) : { id: p.userId, name: "—" } })),
    messages: messages.map((m, i) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      user: authors[i] ? publicUser(authors[i]) : { id: m.userId, name: "—" },
    })),
  };
}

// Изменения состояния уходят только тем, кто сейчас в эфире, а не всем
// подписчикам канала: список участников меняется на каждый вход и выход, и
// рассылать это тысяче человек, которые эфир не открывали, незачем.
function broadcastState(stream, extra = {}) {
  const ids = live.listParticipants(stream.id).map((p) => p.userId);
  broadcastToUsers(ids, { type: "live:state", streamId: stream.id, ...extra });
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "Чат не найден" });
    if (chat.type === "dm") return res.status(400).json({ error: "Эфир бывает в канале или группе — для двоих есть звонок" });
    // Вести эфир может тот же, кто управляет чатом: в канале это его голос, и
    // включить его от имени канала не должен любой подписчик.
    if (!isStaff(chat, req.uid)) return res.status(403).json({ error: "Начать эфир может только администратор" });

    const already = live.getLiveStreamForChat(chat.id);
    // Ведущему, который вернулся к своему же эфиру из OBS, ключ нужен снова —
    // например, он перезапустил программу и настройки в ней потерялись.
    if (already) return res.json({ stream: already, already: true, ingest: ingestFor(already, req) });

    // "rtmp" — картинку пришлёт внешняя программа (OBS и подобные), и тогда
    // эфиру нужен ключ: он же пароль на вещание. 16 случайных байт, потому что
    // угадывание ключа — единственный способ влезть в чужой эфир.
    const source = req.body?.source === "rtmp" ? "rtmp" : "webrtc";
    const stream = live.createStream({
      chatId: chat.id,
      hostId: req.uid,
      title: String(req.body?.title ?? "").trim().slice(0, 80),
      withVideo: req.body?.withVideo !== false,
      source,
      streamKey: source === "rtmp" ? crypto.randomBytes(16).toString("hex") : null,
    });
    // А вот о начале эфира знать должны все участники чата — это и есть
    // приглашение. Плашка в чате, без звонка.
    broadcastToUsers(chat.memberIds, { type: "live:started", chatId: chat.id, stream });
    res.json({ stream, ingest: ingestFor(stream, req) });
  })
);

// Идёт ли эфир в этом чате — то, что спрашивает открытый чат, чтобы показать
// плашку.
router.get(
  "/chat/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "Чат не найден" });
    // canHost отдаётся всегда, а не только когда эфир уже идёт: именно по нему
    // показывается кнопка «Начать эфир», а начинают её нажимать как раз тогда,
    // когда эфира нет. (Первая версия возвращала здесь голый stream: null — и
    // кнопка не появлялась никогда.)
    const canHost = isStaff(chat, req.uid);
    const stream = live.getLiveStreamForChat(chat.id);
    if (!stream) return res.json({ stream: null, viewers: 0, canHost });
    // canStop едет вместе с плашкой, чтобы завершить эфир можно было прямо из
    // чата — не входя в него. Войти ради выключения значит спросить камеру и
    // микрофон у человека, который хочет ровно обратного.
    res.json({
      stream,
      viewers: live.listParticipants(stream.id).length,
      canHost,
      canStop: canStopStream(stream, chat, req.uid),
    });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    res.json({ ...(await stateOf(found.stream)), ingest: ingestFor(found.stream, req) });
  })
);

// Картинка эфира из OBS — зрителю. Прокси, а не прямая ссылка на медиасервер, и
// это главное здесь: RTMP-сервер слушает только петлю (server/rtmp.js), а
// пускать или нет — решается тут, теми же правилами, что и вход в сам эфир.
// Иначе эфир закрытого канала смотрел бы любой, кто раздобыл ключ.
//
// Поток бесконечный: ответ не заканчивается, пока зритель не закроет вкладку
// или ведущий не остановит вещание.
router.get(
  "/:id/feed.flv",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.source !== "rtmp") return res.status(404).json({ error: "Этот эфир идёт не через OBS" });

    const url = rtmp.internalFlvUrl(live.getStreamKey(found.stream.id));
    if (!url) return res.status(404).json({ error: "Поток не найден" });

    const upstream = http.get(url, (feed) => {
      if (feed.statusCode !== 200) {
        feed.resume();
        // Программа ещё не подключилась — не ошибка сервера, а «пока нечего
        // показывать»: клиент попробует снова через несколько секунд.
        if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
        return;
      }
      res.setHeader("Content-Type", "video/x-flv");
      // no-transform — это ещё и прямой запрет посредникам что-либо делать с
      // телом ответа. Сжатие бесконечного потока не заканчивается никогда:
      // сжимающий копит данные и ждёт конца ответа, которого у эфира нет.
      // Общий фильтр в server/index.js это уже учитывает, но здесь стоит
      // отдельно — на случай nginx или другого посредника впереди, который про
      // наш фильтр ничего не знает.
      res.setHeader("Cache-Control", "no-store, no-transform");
      feed.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
      else res.end();
    });
    // Зритель ушёл — обрываем и забор потока. Без этого каждое закрытое окно
    // оставляло бы за собой живое соединение с медиасервером.
    res.on("close", () => upstream.destroy());
  })
);

router.post(
  "/:id/join",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.status !== "live") return res.status(410).json({ error: "Эфир уже завершён" });
    // Ведущий остаётся ведущим при переподключении: перезагрузка страницы не
    // должна разжаловать его в зрители собственного эфира.
    const role = found.stream.hostId === req.uid ? "host" : undefined;
    live.setParticipant(found.stream.id, req.uid, role ? { role } : {});
    broadcastState(found.stream);
    res.json({ ...(await stateOf(found.stream)), ingest: ingestFor(found.stream, req) });
  })
);

router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    live.removeParticipant(found.stream.id, req.uid);

    // Ушёл ведущий — эфира больше нет: говорить в нём некому, а плашка «идёт
    // эфир» продолжала бы звать людей в пустую комнату.
    if (found.stream.hostId === req.uid && found.stream.status === "live") {
      const stream = live.endStream(found.stream.id);
      broadcastToUsers(found.chat.memberIds, { type: "live:ended", chatId: stream.chatId, streamId: stream.id });
      return res.json({ ok: true, ended: true });
    }

    // Сообщаем и оставшимся, и самому вышедшему — его клиент по этому событию
    // закрывает соединения.
    broadcastToUsers([...live.listParticipants(found.stream.id).map((p) => p.userId), req.uid], {
      type: "live:state",
      streamId: found.stream.id,
    });
    res.json({ ok: true });
  })
);

// Поднятая рука — единственное, что зритель может сделать сам. Разрешение
// говорить остаётся за ведущим.
router.post(
  "/:id/hand",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    const me = live.getParticipant(found.stream.id, req.uid);
    if (!me) return res.status(404).json({ error: "Вы не в эфире" });
    live.setParticipant(found.stream.id, req.uid, { handRaised: req.body?.raised !== false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

// Дать слово и забрать его. Роль «speaker» — это и есть право говорить: у неё
// нет отдельного выключателя, иначе «может» и «говорит» разъезжаются.
router.post(
  "/:id/participants/:userId/role",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found || !requireHost(found.stream, req, res)) return;
    const role = req.body?.role === "speaker" ? "speaker" : "viewer";
    const target = live.getParticipant(found.stream.id, req.params.userId);
    if (!target) return res.status(404).json({ error: "Этого человека нет в эфире" });
    if (target.role === "host") return res.status(400).json({ error: "Ведущего нельзя лишить слова" });

    // Рука опускается вместе с выдачей слова — она свою работу сделала.
    live.setParticipant(found.stream.id, req.params.userId, { role, handRaised: false, mutedByHost: false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

// Заглушить говорящего, не забирая слово: короткая мера на «извините, у вас
// фоном телевизор», после которой человек включает себя сам.
router.post(
  "/:id/participants/:userId/mute",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found || !requireHost(found.stream, req, res)) return;
    const target = live.getParticipant(found.stream.id, req.params.userId);
    if (!target) return res.status(404).json({ error: "Этого человека нет в эфире" });
    live.setParticipant(found.stream.id, req.params.userId, { mutedByHost: req.body?.muted !== false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/stop",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (!canStopStream(found.stream, found.chat, req.uid)) {
      return res.status(403).json({ error: "Завершить эфир может ведущий или администратор чата" });
    }
    // Уже завершённый эфир завершается «успешно»: кнопку могли нажать дважды
    // или из двух мест сразу, и отказ здесь выглядел бы как «не выключается».
    if (found.stream.status !== "live") return res.json({ stream: found.stream });
    // Эфир из OBS заканчивается и на стороне программы: без этого она продолжит
    // заливать картинку в завершённый эфир, а ведущий, закрывший вкладку, об
    // этом даже не узнает.
    if (found.stream.source === "rtmp") rtmp.stopPublisher(live.getStreamKey(found.stream.id));
    const stream = live.endStream(found.stream.id);
    // Здесь рассылка снова всему чату: плашка «идёт эфир» висит у всех, и
    // снять её нужно у всех, а не только у тех, кто внутри.
    broadcastToUsers(found.chat.memberIds, { type: "live:ended", chatId: stream.chatId, streamId: stream.id });
    res.json({ stream });
  })
);

router.post(
  "/:id/messages",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.status !== "live") return res.status(410).json({ error: "Эфир завершён" });
    const text = String(req.body?.text ?? "").trim().slice(0, MAX_MESSAGE_LEN);
    if (!text) return res.status(400).json({ error: "Пустое сообщение" });

    const saved = live.addMessage(found.stream.id, req.uid, text);
    const user = await getUser(req.uid);
    const message = { id: saved.id, text: saved.text, createdAt: saved.createdAt, user: publicUser(user) };
    broadcastToUsers(
      live.listParticipants(found.stream.id).map((p) => p.userId),
      { type: "live:message", streamId: found.stream.id, message }
    );
    res.json({ message });
  })
);

module.exports = router;
