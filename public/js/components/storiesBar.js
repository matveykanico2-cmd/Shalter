import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { fileToImageDataUrl, fileToDataUrl } from "../lib/image.js";
import { openStoryViewer } from "./storyViewer.js";

const MAX_STORY_DIMENSION = 1080;

export function StoriesBar() {
  const container = el("div", { class: "stories-bar" });
  let groups = [];

  async function refetch() {
    const res = await api.listStories().catch(() => null);
    if (!res) return;
    groups = res.groups;
    render();
  }

  async function postStory(file) {
    const isVideo = file.type.startsWith("video/");
    const url = isVideo ? await fileToDataUrl(file) : await fileToImageDataUrl(file, MAX_STORY_DIMENSION);
    await api.postStory(isVideo ? "video" : "image", url);
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
      onchange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) await postStory(file);
      },
    });

    const myRing = myGroup?.stories.some((s) => !s.viewed) ? "unseen" : myGroup ? "seen" : "";
    const myItem = el("button", { class: "story-item", onclick: () => (myGroup ? openStoryViewer(groups, myGroupIndex, me.id, render) : fileInput.click()) }, [
      el("div", { class: `story-avatar-ring ${myRing}` }, [Avatar({ name: me.name, color: me.avatarColor, image: me.avatarImage, size: 52 })]),
      !myGroup ? el("span", { class: "story-add-badge", html: iconSvg("Plus", 12) }) : null,
      el("span", { class: "story-item-label" }, "Ваша история"),
    ]);

    container.append(myItem, fileInput);

    groups.forEach((g, i) => {
      if (g.user.id === me.id) return;
      const unseen = g.stories.some((s) => !s.viewed);
      container.appendChild(
        el("button", { class: "story-item", onclick: () => openStoryViewer(groups, i, me.id, render) }, [
          el("div", { class: `story-avatar-ring ${unseen ? "unseen" : "seen"}` }, [
            Avatar({ name: g.user.name, color: g.user.avatarColor, image: g.user.avatarImage, size: 52 }),
          ]),
          el("span", { class: "story-item-label" }, g.user.name.split(" ")[0]),
        ])
      );
    });
  }

  refetch();
  return container;
}
