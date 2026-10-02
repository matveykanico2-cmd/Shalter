import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { fileToImageUpload } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { openStoryViewer } from "./storyViewer.js";
import { openStoryEditor } from "./storyEditor.js";
import { onWsMessage } from "../lib/wsClient.js";

const MAX_STORY_DIMENSION = 1080;

export function StoriesBar() {
  const container = el("div", { class: "stories-bar" });
  let groups = [];
  let progress = null;

  async function refetch() {
    const res = await api.listStories().catch(() => null);
    if (!res) return;
    groups = res.groups;
    render();
  }

  async function postStory(files) {
    const items = [];
    for (const [i, file] of files.entries()) {
      const isVideo = file.type.startsWith("video/");
      let upload = file;
      if (!isVideo) {
        progress = `Редактируем ${i + 1} из ${files.length}…`;
        render();
        const edited = await openStoryEditor(file);
        if (!edited) continue;
        upload = edited === file ? await fileToImageUpload(file, MAX_STORY_DIMENSION) : edited;
      }
      progress = `Загружаем ${i + 1} из ${files.length}…`;
      render();
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
    const myItem = el("button", {
      class: "story-item",
      onclick: () => (myGroup ? openStoryViewer(groups, myGroupIndex, me.id, refetch) : fileInput.click()),
      oncontextmenu: (e) => {
        e.preventDefault();
        fileInput.click();
      },
    }, [
      el("div", { class: `story-avatar-ring ${myRing}` }, [Avatar({ name: me.name, color: me.avatarColor, image: me.avatarImage, size: 52 })]),
      el("span", {
        class: "story-add-badge",
        title: "Добавить историю",
        html: iconSvg("Plus", 12),
        onclick: (e) => {
          e.stopPropagation();
          fileInput.click();
        },
      }),
      el("span", { class: "story-item-label" }, progress ?? "Моя история"),
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

  const unsubs = [
    onWsMessage("story:new", refetch),
    onWsMessage("story:deleted", refetch),
  ];
  container.cleanup = () => unsubs.forEach((u) => u());

  refetch();
  return container;
}
