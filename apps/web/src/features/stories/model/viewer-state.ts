import { framesOf, type Story, type StoryComment, type StoryGroup, type StoryViewer } from "@/entities/story";

// Состояние просмотра историй — переходы openStoryViewer (public/js/components/storyViewer.js):
// кадр за кадром внутри автора, потом следующий автор; на последнем кадре просмотр закрывается.
// Панели «Комментарии» и «просмотров» принадлежат истории и сбрасываются при переходе.

export type CommentRef = { id: string; author: StoryComment["author"] };

export type ViewerState = {
  groups: StoryGroup[];
  gi: number;
  si: number;
  /** Листать некуда (или всё удалили) — просмотр закрывается. */
  done: boolean;
  viewers: StoryViewer[] | null;
  viewersOpen: boolean;
  comments: StoryComment[] | null;
  commentsOpen: boolean;
  editingCommentId: string | null;
  replyTo: CommentRef | null;
};

export type ViewerAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "nextGroup" }
  | { type: "prevGroup" }
  | { type: "drop"; storyId: string }
  | { type: "patchStory"; storyId: string; patch: Partial<Story> }
  | { type: "toggleViewers" }
  | { type: "toggleComments" }
  | { type: "viewers"; storyId: string; viewers: StoryViewer[] }
  | { type: "comments"; storyId: string; comments: StoryComment[] }
  | { type: "comment"; storyId: string; comment: StoryComment }
  | { type: "commentPatch"; storyId: string; commentId: string; patch: Partial<StoryComment> }
  | { type: "commentRemoved"; storyId: string; commentId: string }
  | { type: "editComment"; commentId: string | null }
  | { type: "replyTo"; to: CommentRef | null };

const NO_PANELS = { viewers: null, viewersOpen: false, comments: null, commentsOpen: false, editingCommentId: null, replyTo: null } as const;

export function initViewer({ groups, groupIndex, startIndex }: { groups: StoryGroup[]; groupIndex: number; startIndex: number }): ViewerState {
  // Своя копия: просмотр помечает просмотренное и выкидывает удалённое, не трогая кэш ленты.
  const copy = groups.map((g) => ({ ...g, stories: g.stories.map((s) => ({ ...s })) }));
  const si = Math.min(Math.max(0, startIndex), Math.max(0, framesOf(copy[groupIndex]).length - 1));
  return { groups: copy, gi: groupIndex, si, done: !copy[groupIndex], ...NO_PANELS };
}

export const currentStoryOf = (s: ViewerState) => framesOf(s.groups[s.gi])[s.si]?.story;

const isCurrent = (s: ViewerState, storyId: string) => currentStoryOf(s)?.id === storyId;

export function viewerReducer(s: ViewerState, a: ViewerAction): ViewerState {
  switch (a.type) {
    case "next": {
      if (s.si < framesOf(s.groups[s.gi]).length - 1) return { ...s, si: s.si + 1, ...NO_PANELS };
      return viewerReducer(s, { type: "nextGroup" });
    }
    case "prev": {
      if (s.si > 0) return { ...s, si: s.si - 1, ...NO_PANELS };
      if (s.gi > 0) return { ...s, gi: s.gi - 1, si: Math.max(0, framesOf(s.groups[s.gi - 1]).length - 1), ...NO_PANELS };
      return s;
    }
    case "nextGroup":
      return s.gi < s.groups.length - 1 ? { ...s, gi: s.gi + 1, si: 0, ...NO_PANELS } : { ...s, done: true };
    case "prevGroup":
      return s.gi > 0 ? { ...s, gi: s.gi - 1, si: 0, ...NO_PANELS } : s;
    case "drop":
      return dropStory(s, a.storyId);
    case "patchStory":
      return { ...s, groups: s.groups.map((g) => ({ ...g, stories: g.stories.map((st) => (st.id === a.storyId ? { ...st, ...a.patch } : st)) })) };
    case "toggleViewers":
      return { ...s, viewersOpen: !s.viewersOpen, commentsOpen: false };
    case "toggleComments":
      return { ...s, commentsOpen: !s.commentsOpen, viewersOpen: s.commentsOpen ? s.viewersOpen : false };
    case "viewers":
      return isCurrent(s, a.storyId) ? { ...s, viewers: a.viewers } : s;
    case "comments":
      return isCurrent(s, a.storyId) ? { ...s, comments: a.comments } : s;
    case "comment":
      if (!isCurrent(s, a.storyId) || !s.comments || s.comments.some((c) => c.id === a.comment.id)) return s;
      return { ...s, comments: [...s.comments, a.comment] };
    case "commentPatch":
      if (!isCurrent(s, a.storyId) || !s.comments) return s;
      return { ...s, comments: s.comments.map((c) => (c.id === a.commentId ? { ...c, ...a.patch } : c)) };
    case "commentRemoved":
      if (!isCurrent(s, a.storyId) || !s.comments) return s;
      return { ...s, comments: s.comments.filter((c) => c.id !== a.commentId), editingCommentId: s.editingCommentId === a.commentId ? null : s.editingCommentId };
    case "editComment":
      return { ...s, editingCommentId: a.commentId };
    case "replyTo":
      return { ...s, replyTo: a.to };
  }
}

/** История удалена (автором, модератором, у другого зрителя по сокету): остаёмся на том же кадре, если он жив. */
function dropStory(s: ViewerState, storyId: string): ViewerState {
  if (!s.groups.some((g) => g.stories.some((st) => st.id === storyId))) return s;
  const was = framesOf(s.groups[s.gi])[s.si];
  let gi = s.gi;
  const groups: StoryGroup[] = [];
  s.groups.forEach((g, i) => {
    const stories = g.stories.filter((st) => st.id !== storyId);
    if (stories.length) groups.push({ ...g, stories: stories as StoryGroup["stories"] });
    else if (i < s.gi) gi--;
  });
  if (!groups.length) return { ...s, groups, done: true };
  gi = Math.min(Math.max(0, gi), groups.length - 1);
  const list = framesOf(groups[gi]);
  if (!list.length) return { ...s, groups, done: true };
  const same = was ? list.findIndex((f) => f.story.id === was.story.id && f.index === was.index) : -1;
  const si = same >= 0 ? same : Math.min(s.si, list.length - 1);
  const stayed = same >= 0 && gi === s.gi;
  return { ...s, groups, gi, si, ...(stayed ? {} : NO_PANELS) };
}
