import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { fileToImageUpload } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { openStoryViewer } from "./storyViewer.js";
import { onWsMessage } from "../lib/wsClient.js";

const MAX_STORY_DIMENSION = 1080;

export function StoriesBar() {
  const container = el("div", { class: "stories-bar" });
  let groups = [];
  // Что показывать вместо подписи «Ваша история», пока кадры уезжают: видео
  // грузится не мгновенно, и без единого слова это выглядит как «ничего не
  // произошло», после чего файлы выбирают ещё раз.
  let progress = null;

  async function refetch() {
    const res = await api.listStories().catch(() => null);
    if (!res) return;
    groups = res.groups;
    render();
  }

  // Все выбранные файлы уезжают одной историей — листаемой, с кадром на каждый
  // файл. Раньше здесь был цикл с отдельной отправкой на каждый снимок, и
  // десять фотографий превращались в десять историй: их и смотрели по одной, и
  // удаляли по одной.
  //
  // Сами файлы идут потоковой загрузкой (lib/upload.js), а в истории лежат
  // только ссылки на них. Иначе кадры ехали бы base64-строками внутри одного
  // запроса: десять фотографий и видео не влезли бы в предел тела (25 МБ), и
  // падала бы вся история целиком — вместе с теми кадрами, что были в порядке.
  async function postStory(files) {
    const items = [];
    for (const [i, file] of files.entries()) {
      const isVideo = file.type.startsWith("video/");
      progress = `Загружаем ${i + 1} из ${files.length}…`;
      render();
      // По очереди, а не Promise.all: уменьшение картинки идёт в том же потоке,
      // что и отрисовка, а десяток параллельных отправок кладёт канал.
      const upload = isVideo ? file : await fileToImageUpload(file, MAX_STORY_DIMENSION);
      const { url } = await uploadFile(upload, isVideo ? "video" : "image");
      items.push({ kind: isVideo ? "video" : "image", url });
    }
    if (!items.length) return;
    await api.postStory(items);
    await refetch();
  }

  function render() {
    const me = getState().user;
    container.textContent = "";
    if (groups.length === 0 && !me) return;

    const myGroupIndex = groups.findIndex((g) => g.user.id === me.id);
    const myGroup = myGroupIndex >= 0 ? groups[myGroupIndex] : null;

    const fileInput = el("input", {
      type: "file",
      accept: "image/*,video/*",
      class: "hidden-input",
      // Несколько историй за один выбор — и строго по очереди, а не разом:
      // каждая уносит на сервер целую картинку в теле запроса, и десяток
      // параллельных отправок кладёт и канал, и обработку на сервере.
      multiple: true,
      onchange: async (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (!files.length) return;
        try {
          await postStory(files);
        } catch (err) {
          alert(err.message || "Не удалось выложить историю");
        } finally {
          progress = null;
          render();
        }
      },
    });

    const myRing = myGroup?.stories.some((s) => !s.viewed) ? "unseen" : myGroup ? "seen" : "";
    // После удаления лента перечитывается с сервера, а не перерисовывается по
    // памяти: так на экране всегда то, что действительно осталось, — а не то,
    // что клиент думает про свой массив.
    const myItem = el("button", { class: "story-item", onclick: () => (myGroup ? openStoryViewer(groups, myGroupIndex, me.id, refetch) : fileInput.click()) }, [
      el("div", { class: `story-avatar-ring ${myRing}` }, [Avatar({ name: me.name, color: me.avatarColor, image: me.avatarImage, size: 52 })]),
      !myGroup ? el("span", { class: "story-add-badge", html: iconSvg("Plus", 12) }) : null,
      el("span", { class: "story-item-label" }, progress ?? "Ваша история"),
    ]);

    container.append(myItem, fileInput);

    groups.forEach((g, i) => {
      if (g.user.id === me.id) return;
      const unseen = g.stories.some((s) => !s.viewed);
      container.appendChild(
        el("button", { class: "story-item", onclick: () => openStoryViewer(groups, i, me.id, refetch) }, [
          el("div", { class: `story-avatar-ring ${unseen ? "unseen" : "seen"}` }, [
            Avatar({ name: g.user.name, color: g.user.avatarColor, image: g.user.avatarImage, size: 52 }),
          ]),
          el("span", { class: "story-item-label" }, g.user.name.split(" ")[0]),
        ])
      );
    });
  }

  // Истории появляются и исчезают у всех сразу (server/routes/stories.js):
  // автор удалил — кружок пропал из ленты, не дожидаясь перезахода.
  const unsubs = [
    onWsMessage("story:new", refetch),
    onWsMessage("story:deleted", refetch),
  ];
  // Лента живёт столько же, сколько список чатов; когда её снимут с экрана,
  // подписки надо снять вместе с ней — иначе каждая перерисовка списка
  // оставляла бы за собой ещё одного слушателя.
  container.cleanup = () => unsubs.forEach((u) => u());

  refetch();
  return container;
}
