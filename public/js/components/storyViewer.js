import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";

const IMAGE_DURATION_MS = 5000;

// groups: [{ user, stories: [{id, kind, url, viewed, ...}] }], starting at
// groupIndex/storyIndex. Advances within a group, then to the next group
// (Telegram/Instagram-style "keep watching the next person's stories"),
// closing once the last group's last story finishes.
export function openStoryViewer(groups, groupIndex, meId, onChanged) {
  let gi = groupIndex;
  let si = 0;
  let timer = null;
  let videoEl = null;

  const overlay = el("div", { class: "story-viewer-overlay" });
  document.body.appendChild(overlay);

  function currentGroup() {
    return groups[gi];
  }
  function currentStory() {
    return currentGroup()?.stories[si];
  }

  function close() {
    clearTimeout(timer);
    videoEl?.pause();
    overlay.remove();
  }

  function goNextStory() {
    const group = currentGroup();
    if (si < group.stories.length - 1) {
      si++;
      render();
    } else {
      goNextGroup();
    }
  }

  function goPrevStory() {
    if (si > 0) {
      si--;
      render();
    } else if (gi > 0) {
      gi--;
      si = groups[gi].stories.length - 1;
      render();
    }
  }

  function goNextGroup() {
    if (gi < groups.length - 1) {
      gi++;
      si = 0;
      render();
    } else {
      close();
    }
  }

  async function markViewedIfNeeded(story) {
    if (story.viewed || story.userId === meId) return;
    story.viewed = true;
    onChanged?.();
    await api.viewStory(story.id).catch(() => {});
  }

  function render() {
    clearTimeout(timer);
    videoEl?.pause();
    const group = currentGroup();
    const story = currentStory();
    if (!group || !story) return close();

    markViewedIfNeeded(story);

    const bars = group.stories.map((s, i) =>
      el("div", { class: "story-progress-bar" }, [
        el("div", { class: `story-progress-fill ${i < si ? "done" : i === si ? "active" : ""}` }),
      ])
    );

    let media;
    if (story.kind === "video") {
      videoEl = el("video", {
        src: story.url,
        class: "story-media",
        autoplay: true,
        playsinline: true,
        onended: goNextStory,
      });
      media = videoEl;
    } else {
      videoEl = null;
      media = el("img", { src: story.url, class: "story-media" });
      timer = setTimeout(goNextStory, IMAGE_DURATION_MS);
    }

    const deleteBtn =
      story.userId === meId
        ? el("button", {
            class: "story-header-btn",
            title: "Удалить",
            html: iconSvg("Trash", 18),
            onclick: async () => {
              if (!confirm("Удалить историю?")) return;
              await api.deleteStory(story.id).catch(() => {});
              group.stories.splice(si, 1);
              onChanged?.();
              if (group.stories.length === 0) {
                groups.splice(gi, 1);
                if (groups.length === 0) return close();
                if (gi >= groups.length) gi = groups.length - 1;
                si = 0;
              } else if (si >= group.stories.length) {
                si = group.stories.length - 1;
              }
              render();
            },
          })
        : null;

    clear(overlay);
    overlay.append(
      el("div", { class: "story-progress-row" }, bars),
      el("div", { class: "story-header" }, [
        Avatar({ name: group.user.name, color: group.user.avatarColor, image: group.user.avatarImage, size: 32 }),
        el("span", { class: "story-header-name" }, group.user.name),
        deleteBtn,
        el("button", { class: "story-header-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close }),
      ]),
      media,
      el("div", { class: "story-tap-zones" }, [
        el("button", { class: "story-tap-zone", onclick: goPrevStory }),
        el("button", { class: "story-tap-zone", onclick: goNextStory }),
      ])
    );
  }

  render();
}
