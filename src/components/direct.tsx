"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, ChevronLeft, FolderPlus, Forward, Gift, Image as ImageIcon, Info, Mic, MoreHorizontal, Palette, Phone, Pin, Search, Smile, Square, SquarePen, Send, Sticker, Video, X } from "lucide-react";
import { api, timeAgo, useApi, useIsPhone } from "@/lib/client";
import type { Conversation, FollowUser, Message, Post, UserLite } from "@/lib/types";
import { CallOverlay, type CallSignal } from "./call-overlay";

/** One-line inbox preview for any message kind. */
function previewText(m: NonNullable<Conversation["lastMessage"]>) {
  switch (m.kind) {
    case "post":
      return "Sent a post";
    case "voice":
      return "Voice message";
    case "media":
      return "Sent a photo or video";
    case "call":
      return "Call";
    case "gift":
      return "Sent a gift";
    case "poll":
      return "Poll";
    case "invoice":
      return "Sent an invoice";
    case "receipt":
      return "Sent a receipt";
    default:
      return m.text;
  }
}
import { useApp } from "./app-context";
import { InvoiceCardView, VoiceBubble } from "./invoice-card";
import { Avatar, Modal, OptionsMenu, PrimaryButton, Spinner, Verified } from "./ui";

function NewMessageModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { me } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FollowUser[] | null>(null);
  const [picked, setPicked] = useState<FollowUser[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const following = useApi<{ users: FollowUser[] }>(`/api/users/${me.username}/following`);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(
      () => api<{ users: FollowUser[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((d) => setResults(d.users.filter((u) => !u.isMe))),
      200,
    );
    return () => clearTimeout(t);
  }, [q]);

  const start = async () => {
    if (!picked.length) return;
    const body = picked.length > 1 ? { usernames: picked.map((user) => user.username), title: groupTitle } : { username: picked[0].username };
    const { id } = await api<{ id: number }>("/api/conversations", { body });
    onClose();
    router.push(`/direct/t/${id}`);
  };

  const searchResults = q.trim() ? results : null;
  const list = searchResults ?? following.data?.users;
  return (
    <Modal onClose={onClose} showClose={false} className="flex h-[min(480px,85vh)] w-[548px] max-w-full flex-col">
      <div className="relative flex h-[43px] shrink-0 items-center justify-center border-b border-border font-semibold">
        New message
        <button className="absolute right-2 p-2" onClick={onClose} aria-label="Close">
          <X size={24} />
        </button>
      </div>
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-semibold">To:</span>
        {picked.map((user) => <button key={user.id} onClick={() => setPicked((current) => current.filter((item) => item.id !== user.id))} className="flex items-center gap-1 rounded-full bg-[#e0f1ff] px-3 py-1 text-sm font-semibold text-link">{user.username} <X size={14} /></button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." autoFocus className="flex-1 bg-transparent py-1 outline-none placeholder:text-muted" />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {!searchResults && <div className="px-4 py-1 font-semibold">Suggested</div>}
        {!list ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="px-4 py-3 text-muted">No account found.</p>
        ) : (
          list.map((u) => (
            <button key={u.id} onClick={() => setPicked((current) => current.some((item) => item.id === u.id) ? current.filter((item) => item.id !== u.id) : [...current, u])} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
              <Avatar src={u.avatar} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{u.name || u.username}</div>
                <div className="truncate text-muted">{u.username}</div>
              </div>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${picked.some((item) => item.id === u.id) ? "border-link bg-link text-white" : "border-fg/60"}`}>{picked.some((item) => item.id === u.id) ? "✓" : ""}</span>
            </button>
          ))
        )}
      </div>
      <div className="p-4">
        {picked.length > 1 && <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group name (optional)" className="mb-2 w-full rounded-lg bg-field px-3 py-2 outline-none" />}
        <PrimaryButton className="w-full" disabled={!picked.length} onClick={() => void start()}>
          {picked.length > 1 ? "Create group" : "Chat"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function ConversationList({ selectedId }: { selectedId: number | null }) {
  const { me } = useApp();
  const { data, reload, error } = useApi<{ conversations: Conversation[] }>("/api/conversations");
  const foldersApi = useApi<{ folders: { id: number; name: string; conversationIds: number[] }[] }>("/api/chat-folders");
  const [composing, setComposing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const phone = useIsPhone();
  const needle = q.trim().toLowerCase();
  const shown = data?.conversations.filter(
    (c) => (filter === "all" || c.unread) && (folderId === null || !!foldersApi.data?.folders.find((folder) => folder.id === folderId)?.conversationIds.includes(c.id)) && (!needle || c.other.username.toLowerCase().includes(needle) || (c.other.name ?? "").toLowerCase().includes(needle)),
  );

  const createFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    await api("/api/chat-folders", { body: { name } });
    foldersApi.reload();
  };

  const assign = async (conversationId: number, targetFolderId: number) => {
    await api("/api/chat-folders", { body: { action: "add", folderId: targetFolderId, conversationId } });
    setAssigning(null);
    foldersApi.reload();
  };

  useEffect(() => {
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);
  // Refresh right away when the selected thread changes so its unread state clears.
  useEffect(() => {
    if (selectedId) setTimeout(reload, 400);
  }, [selectedId, reload]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pb-3 pt-9 max-md:px-4 max-md:pt-3">
        {/* Phones: big centered username, like the Instagram app. */}
        <span className="flex items-center gap-1 text-xl font-bold max-md:flex-1 max-md:justify-center max-md:pl-7 max-md:text-[22px]">
          {me.username}
          {me.verified && <Verified size={14} />}
          <ChevronDown size={18} />
        </span>
        <button onClick={() => setComposing(true)} aria-label="New message">
          <SquarePen size={26} />
        </button>
      </div>
      <label className="mx-4 mb-2 flex h-11 items-center gap-3 rounded-full bg-field px-4 text-muted max-md:mx-3 max-md:h-12">
        <Search size={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-muted"
        />
      </label>
      {/* Notes row: your note, then the people you chat with (display only). */}
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-6 pb-1 pt-2 max-md:px-3">
        <div className="flex w-[88px] shrink-0 flex-col items-center">
          <span className="relative z-10 mb-[-12px] line-clamp-2 max-w-[92px] rounded-2xl bg-field px-3 py-1.5 text-center text-xs leading-4 text-muted max-md:text-[13px]">
            Start your first note...
          </span>
          <Avatar src={me.avatar} size={phone ? 80 : 74} />
          <span className="mt-1.5 text-xs text-muted max-md:text-[13px]">Your note</span>
        </div>
        {data?.conversations.slice(0, 12).map((c) => (
          <Link key={c.id} href={`/direct/t/${c.id}`} className="flex w-[88px] shrink-0 flex-col items-center pt-[22px]">
            <Avatar src={c.other.avatar} size={phone ? 80 : 74} />
            <span className="mt-1.5 w-full truncate text-center text-xs max-md:text-[13px]">{c.title || c.other.name || c.other.username}</span>
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between px-6 pb-2.5 pt-3 max-md:px-4 max-md:pt-4">
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => setFilter("all")} className={`text-base max-md:text-[17px] ${filter === "all" ? "font-bold" : "text-muted"}`}>Messages</button>
          <button type="button" onClick={() => setFilter("unread")} className={`text-base max-md:text-[17px] ${filter === "unread" ? "font-bold" : "text-muted"}`}>Unread</button>
        </div>
        <button type="button" className="flex items-center gap-1 text-sm font-semibold text-link" onClick={() => void createFolder()}><FolderPlus size={16} />Folder</button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-3 max-md:px-4">
        <button type="button" onClick={() => setFolderId(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${folderId === null ? "bg-fg text-bg" : "bg-field text-muted"}`}>All chats</button>
        {foldersApi.data?.folders.map((folder) => <button type="button" key={folder.id} onClick={() => setFolderId(folder.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${folderId === folder.id ? "bg-fg text-bg" : "bg-field text-muted"}`}>{folder.name}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="px-6 py-8 text-center"><p className="text-sm text-danger">Couldn&apos;t load your chats.</p><button type="button" onClick={reload} className="mt-2 text-sm font-semibold text-link">Try again</button></div>
        ) : !shown ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-4 text-muted">No messages found.</p>
        ) : (
          shown.map((c) => {
            const last = c.lastMessage;
            const preview = last
              ? `${last.senderId === me.id ? "You: " : ""}${previewText(last)}`
              : "";
            return <div key={c.id} className={`relative flex items-center gap-1 hover:bg-hover ${selectedId === c.id ? "bg-hover" : ""}`}>
              <Link href={`/direct/t/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-6 py-2 max-md:px-4 max-md:py-2.5">
                <Avatar src={c.other.avatar} size={56} />
                <div className="min-w-0 flex-1 max-md:leading-[22px]">
                  <div className={`truncate text-[15px] max-md:text-base ${c.unread ? "font-bold" : ""}`}>{c.title || c.other.name || c.other.username}</div>
                  <div className={`flex text-[13px] max-md:text-[15px] ${c.unread ? "font-bold text-fg" : "text-muted"}`}><span className="truncate">{preview}</span>{last && <span className="shrink-0">&nbsp;· {timeAgo(last.createdAt)}</span>}</div>
                </div>
                {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#5865f2] max-md:h-2.5 max-md:w-2.5" />}
              </Link>
              {foldersApi.data?.folders.length ? <div className="relative mr-3"><button type="button" onClick={() => setAssigning(assigning === c.id ? null : c.id)} className="rounded-full p-2 text-muted hover:bg-field hover:text-fg" aria-label="Add chat to folder" title="Add to folder"><FolderPlus size={16} /></button>{assigning === c.id && <div className="absolute right-0 top-10 z-20 min-w-36 rounded-xl border border-border bg-elevated p-1 shadow-lg">{foldersApi.data.folders.map((folder) => <button type="button" key={folder.id} onClick={() => void assign(c.id, folder.id)} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-hover">{folder.name}</button>)}</div>}</div> : null}
            </div>;
          })
        )}
      </div>
      {composing && <NewMessageModal onClose={() => setComposing(false)} />}
    </div>
  );
}

function SharedPostBubble({ post, mine }: { post: NonNullable<Message["post"]>; mine: boolean }) {
  const { openPost } = useApp();
  return (
    <button
      onClick={() => api<{ post: Post }>(`/api/posts/${post.id}`).then((d) => openPost(d.post))}
      className={`w-[236px] overflow-hidden rounded-2xl text-left ${mine ? "bg-bubble-mine text-white" : "bg-bubble-them"}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar src={post.user.avatar} size={24} />
        <span className="font-semibold">{post.user.username}</span>
      </div>
      <div className="aspect-square bg-black">
        {post.thumb.kind === "video" ? (
          <video src={post.thumb.url} muted preload="metadata" className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumb.url} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      {post.caption && (
        <div className="line-clamp-2 px-3 py-2 text-[13px]">
          <span className="font-semibold">{post.user.username}</span> {post.caption}
        </div>
      )}
    </button>
  );
}

function MediaBubble({ media, mine }: { media: NonNullable<Message["media"]>; mine: boolean }) {
  return (
    <div className={`max-w-[75%] overflow-hidden rounded-2xl ${mine ? "bg-bubble-mine" : "bg-bubble-them"}`}>
      {media.kind === "video" ? (
        <video src={media.url} controls playsInline className="max-h-[360px] max-w-[280px] object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt="Shared media" className="max-h-[360px] max-w-[280px] object-cover" />
      )}
    </div>
  );
}

function CallBubble({ call, mine }: { call: NonNullable<Message["call"]>; mine: boolean }) {
  const video = call.type === "video";
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${mine ? "bg-bubble-mine text-white" : "bg-bubble-them"}`}>
      {video ? <Video size={22} /> : <Phone size={21} />}
      <div>
        <div className="font-semibold">{video ? "Video call" : "Voice call"}</div>
        <div className="text-xs opacity-75">{call.status === "missed" ? "Missed" : "Call started"}</div>
      </div>
    </div>
  );
}

function GiftBubble({ gift, mine }: { gift: NonNullable<Message["gift"]>; mine: boolean }) {
  return <div className={`flex min-w-[150px] flex-col items-center rounded-2xl px-5 py-4 text-center ${mine ? "bg-bubble-mine text-white" : "bg-bubble-them"}`}><span className="text-5xl drop-shadow-sm">{gift.emoji}</span><span className="mt-2 font-bold">{gift.name}</span><span className="mt-1 text-xs opacity-70">Gift · {gift.price} stars</span></div>;
}

function PollBubble({ poll, mine, onVote }: { poll: NonNullable<Message["poll"]>; mine: boolean; onVote: (option: number) => void }) {
  return <div className={`min-w-[230px] max-w-[320px] rounded-2xl px-4 py-3 ${mine ? "bg-bubble-mine text-white" : "bg-bubble-them"}`}>
    <div className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 size={18} />{poll.question}</div>
    <div className="space-y-2">{poll.options.map((option, index) => <button type="button" key={option.text} onClick={() => onVote(index)} className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm ${option.voted ? "border-link" : "border-current/20"}`}>
      <span className="relative z-10 flex items-center justify-between gap-2"><span>{option.text}</span><span className="text-xs opacity-70">{option.votes}</span></span>
      <span className={`absolute inset-y-0 left-0 ${mine ? "bg-white/15" : "bg-link/10"}`} style={{ width: `${poll.totalVotes ? Math.round((option.votes / poll.totalVotes) * 100) : 0}%` }} />
    </button>)}</div>
    <div className="mt-2 text-xs opacity-70">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</div>
  </div>;
}

function PollModal({ onClose, onCreate }: { onClose: () => void; onCreate: (question: string, options: string[]) => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  return <Modal onClose={onClose} showClose={false} className="w-[420px] max-w-full">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="font-semibold">Create poll</div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <form className="space-y-3 p-5" onSubmit={(event) => { event.preventDefault(); onCreate(question, options); }}>
      <input required maxLength={200} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question" className="w-full rounded-xl bg-field px-3 py-2 outline-none" autoFocus />
      {options.map((option, index) => <input required maxLength={100} key={index} value={option} onChange={(event) => setOptions((current) => current.map((item, i) => i === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} className="w-full rounded-xl bg-field px-3 py-2 outline-none" />)}
      {options.length < 10 && <button type="button" onClick={() => setOptions((current) => [...current, ""])} className="text-sm font-semibold text-link">+ Add option</button>}
      <button className="w-full rounded-xl bg-link px-4 py-2 font-semibold text-white">Post poll</button>
    </form>
  </Modal>;
}

function ForwardModal({ message, onClose, onDone }: { message: Message; onClose: () => void; onDone: () => void }) {
  const { data, loading, error } = useApi<{ conversations: Conversation[] }>("/api/conversations");
  return <Modal onClose={onClose} showClose={false} className="w-[420px] max-w-full">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="font-semibold">Forward message</div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <div className="max-h-[min(460px,70vh)] overflow-y-auto p-2">
      {loading && <div className="flex justify-center p-6"><Spinner /></div>}
      {error && <p className="p-4 text-sm text-danger">Couldn&apos;t load chats.</p>}
      {data?.conversations.map((conversation) => <button type="button" key={conversation.id} onClick={async () => { await api(`/api/messages/${message.id}/forward`, { method: "POST", body: { conversationId: conversation.id } }); onDone(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-hover"><Avatar src={conversation.other.avatar} size={44} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{conversation.title || conversation.other.name || conversation.other.username}</span><span className="block truncate text-xs text-muted">{conversation.kind === "group" ? `${conversation.memberCount} members` : `@${conversation.other.username}`}</span></span><Forward size={18} className="text-muted" /></button>)}
      {!loading && !error && !data?.conversations.length && <p className="p-6 text-center text-muted">No other chats yet.</p>}
    </div>
  </Modal>;
}

const QUICK_EMOJI = ["😂", "😍", "🥰", "😊", "😅", "😎", "🤔", "😢", "👍", "👌", "🙏", "👏", "💪", "🔥", "✨", "🎉", "❤️", "💕", "🤍", "✅", "📦", "👕", "☕", "🛍️"];

/** Messages are shown in time order; ids break ties. */
const byTime = (a: Message, b: Message) => a.createdAt - b.createdAt || a.id - b.id;

function Thread({ id }: { id: number }) {
  const { me, refreshUnread, toast } = useApp();
  const [other, setOther] = useState<UserLite | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [otherLastReadId, setOtherLastReadId] = useState(0);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [forwardFor, setForwardFor] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceStarted = useRef(0);
  const [recording, setRecording] = useState(false);
  const [chatTheme, setChatTheme] = useState("default");
  const [chatWallpaper, setChatWallpaper] = useState("default");
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [chatKind, setChatKind] = useState<"direct" | "group" | "channel">("direct");
  const [chatMemberCount, setChatMemberCount] = useState(2);
  const [outgoingKind, setOutgoingKind] = useState<"audio" | "video" | undefined>();
  const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const gifts = useApi<{ gifts: { id: number; name: string; emoji: string; price: number }[] }>(giftOpen ? "/api/gifts" : null);
  const isMuted = mutedUntil !== null;
  const bottom = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadedThread = useRef(false);
  // Phones: press and hold a message for its menu (iOS Safari doesn't fire contextmenu on touch).
  const holdToOpenMenu = (messageId: number) => {
    const cancel = () => clearTimeout(pressTimer.current);
    return {
      onTouchStart: () => {
        cancel();
        pressTimer.current = setTimeout(() => setMenuFor(messageId), 500);
      },
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        setMenuFor(messageId);
      },
    };
  };
  const lastId = useRef(0);

  useEffect(() => {
    // <Thread> is keyed by conversation id, so state starts fresh for each thread.
    let stop = false;
    const poll = async () => {
      try {
      const d = await api<{ other: UserLite; messages: Message[]; ids: number[]; otherLastReadId: number; theme?: string; wallpaper?: string; mutedUntil?: number | null; title?: string | null; kind?: "direct" | "group" | "channel"; members?: UserLite[] }>(
          `/api/conversations/${id}/messages?after=${lastId.current}`,
        );
        if (stop) return;
        loadedThread.current = true;
        setOther(d.other);
        if (d.theme) setChatTheme(d.theme);
        if (d.wallpaper) setChatWallpaper(d.wallpaper);
        setMutedUntil(d.mutedUntil ?? null);
        setChatTitle(d.title ?? null);
        if (d.kind) setChatKind(d.kind);
        if (d.members?.length) setChatMemberCount(d.members.length);
        setOtherLastReadId(d.otherLastReadId);
        // Drop messages that were unsent; anything newer than the server's list was just sent and is kept.
        const present = new Set(d.ids);
        const newest = d.ids.length ? Math.max(...d.ids) : 0;
        setMessages((m) => (m && m.some((x) => x.id <= newest && !present.has(x.id)) ? m.filter((x) => x.id > newest || present.has(x.id)) : m));
        const callState = await api<{ call: CallSignal | null }>(`/api/conversations/${id}/calls`).catch(() => ({ call: null }));
        if (callState.call && callState.call.initiator_id !== me.id && callState.call.status !== "ended") setIncomingCall(callState.call);
        if (d.messages.length) {
          lastId.current = Math.max(lastId.current, ...d.messages.map((x) => x.id));
          setMessages((m) => {
            const known = new Set((m ?? []).map((x) => x.id));
            return [...(m ?? []), ...d.messages.filter((x) => !known.has(x.id))].sort(byTime);
          });
          refreshUnread();
        } else setMessages((m) => m ?? []);
      } catch {
        // Keep an already loaded thread usable during a temporary network hiccup.
        if (!stop && !loadedThread.current) setError(true);
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, me.id, refreshUnread, retry]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const send = async (body: string) => {
    const t = body.trim();
    if (!t) return;
    setText("");
    try {
      const { message } = await api<{ message: Message }>(`/api/conversations/${id}/messages`, { body: { text: t, replyToId: replyTo?.id } });
      lastId.current = Math.max(lastId.current, message.id);
      setMessages((m) => (m?.some((x) => x.id === message.id) ? m : [...(m ?? []), message].sort(byTime)));
      setReplyTo(null);
    } catch (e) {
      toast((e as Error).message);
      setText(t);
    }
  };

  const edit = async (body: string) => {
    const t = body.trim();
    if (!t || !editing) return;
    try {
      await api(`/api/messages/${editing.id}`, { method: "PATCH", body: { text: t } });
      setMessages((m) => m?.map((x) => (x.id === editing.id ? { ...x, text: t, editedAt: Date.now() } : x)) ?? m);
      setEditing(null);
      setText("");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const react = async (messageId: number, emoji: string) => {
    try {
      await api(`/api/messages/${messageId}/reaction`, { method: "POST", body: { emoji } });
      setMessages((m) => m?.map((message) => {
        if (message.id !== messageId) return message;
        const current = message.reactions.find((r) => r.emoji === emoji);
        const reacted = !current?.reacted;
        const reactions = current
          ? message.reactions.map((r) => (r.emoji === emoji ? { ...r, count: Math.max(0, r.count + (reacted ? 1 : -1)), reacted } : r)).filter((r) => r.count > 0)
          : [...message.reactions, { emoji, count: 1, reacted: true }];
        return { ...message, reactions };
      }) ?? m);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cycleTheme = async () => {
    const themes = ["default", "midnight", "sunset", "forest", "ocean"];
    const next = themes[(themes.indexOf(chatTheme) + 1) % themes.length];
    setChatTheme(next);
    try {
      await api(`/api/conversations/${id}`, { method: "PATCH", body: { theme: next } });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cycleWallpaper = async () => {
    const wallpapers = ["default", "dots", "stars", "waves", "sunset"];
    const next = wallpapers[(wallpapers.indexOf(chatWallpaper) + 1) % wallpapers.length];
    setChatWallpaper(next);
    try { await api(`/api/conversations/${id}`, { method: "PATCH", body: { wallpaper: next } }); }
    catch (e) { toast((e as Error).message); }
  };

  const toggleMute = async () => {
    const muted = !(mutedUntil && mutedUntil > Date.now());
    setMutedUntil(muted ? Date.now() + 8 * 60 * 60 * 1000 : null);
    try { await api(`/api/conversations/${id}`, { method: "PATCH", body: { muted } }); }
    catch (e) { toast((e as Error).message); }
  };

  const pin = async (message: Message) => {
    setMenuFor(null);
    try {
      const result = await api<{ pinned: boolean }>(`/api/messages/${message.id}/pin`, { method: "POST" });
      setMessages((current) => current?.map((item) => item.id === message.id ? { ...item, pinnedAt: result.pinned ? Date.now() : null } : item) ?? current);
    } catch (e) { toast((e as Error).message); }
  };

  const searchChat = async () => {
    const needle = search.trim();
    if (!needle) { setSearchResults(null); return; }
    try {
      const result = await api<{ results: Message[] }>(`/api/conversations/${id}/messages?search=${encodeURIComponent(needle)}`);
      setSearchResults(result.results);
    } catch (e) { toast((e as Error).message); }
  };

  const sendGiftMessage = async (gift: { id: number; name: string; emoji: string; price: number }) => {
    try {
      const result = await api<{ message: Message }>(`/api/conversations/${id}/gifts`, { body: { giftId: gift.id } });
      if (result.message) { lastId.current = Math.max(lastId.current, result.message.id); setMessages((m) => [...(m ?? []), result.message].sort(byTime)); }
      setGiftOpen(false);
    } catch (e) { toast((e as Error).message); }
  };

  const sendPollMessage = async (question: string, options: string[]) => {
    try {
      const { message } = await api<{ message: Message }>(`/api/conversations/${id}/messages`, { body: { poll: { question, options } } });
      lastId.current = Math.max(lastId.current, message.id);
      setMessages((current) => current?.some((item) => item.id === message.id) ? current : [...(current ?? []), message].sort(byTime));
      setPollOpen(false);
    } catch (e) { toast((e as Error).message); }
  };

  const vote = async (messageId: number, option: number) => {
    try {
      await api(`/api/messages/${messageId}/poll`, { method: "POST", body: { option } });
      const refreshed = await api<{ messages: Message[] }>(`/api/conversations/${id}/messages?after=${messageId - 1}`);
      const updated = refreshed.messages.find((message) => message.id === messageId);
      if (updated) setMessages((current) => current?.map((message) => message.id === messageId ? updated : message) ?? current);
    } catch (e) { toast((e as Error).message); }
  };

  const unsend = async (messageId: number) => {
    setMenuFor(null);
    try {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((m) => m?.filter((x) => x.id !== messageId) ?? m);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const sendMedia = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    try {
      const { message } = await api<{ message: Message }>(`/api/conversations/${id}/media`, { body: form });
      if (message) {
        lastId.current = Math.max(lastId.current, message.id);
        setMessages((m) => (m?.some((x) => x.id === message.id) ? m : [...(m ?? []), message].sort(byTime)));
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/ogg";
      const current = new MediaRecorder(stream, { mimeType: mime });
      voiceChunks.current = [];
      voiceStarted.current = Date.now();
      current.ondataavailable = (event) => event.data.size && voiceChunks.current.push(event.data);
      current.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(voiceChunks.current, { type: mime });
        if (!blob.size) return;
        const form = new FormData();
        form.set("file", new File([blob], "voice.webm", { type: mime }));
        form.set("seconds", String(Math.max(1, Math.round((Date.now() - voiceStarted.current) / 1000))));
        try {
          const { message } = await api<{ message: Message }>(`/api/conversations/${id}/voice`, { body: form });
          if (message) {
            lastId.current = Math.max(lastId.current, message.id);
            setMessages((m) => (m?.some((x) => x.id === message.id) ? m : [...(m ?? []), message].sort(byTime)));
          }
        } catch (e) {
          toast((e as Error).message);
        }
      };
      recorder.current = current;
      current.start();
      setRecording(true);
    } catch (e) {
      toast((e as Error).message || "Microphone permission is required.");
    }
  };

  useEffect(() => {
    return () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted">
        <p>This conversation couldn&apos;t be loaded.</p>
        <div className="flex items-center gap-2">
          <Link href="/direct/inbox" className="rounded-lg bg-field px-4 py-2 text-sm font-semibold text-fg">Back to chats</Link>
          <button type="button" onClick={() => { lastId.current = 0; loadedThread.current = false; setMessages(null); setOther(null); setError(false); setRetry((value) => value + 1); }} className="rounded-lg bg-link px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      </div>
    );
  if (!other || !messages)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className={`chat-theme-${chatTheme} chat-wallpaper-${chatWallpaper} flex h-full flex-col`}>
      <header className="flex h-[75px] shrink-0 items-center gap-3 border-b border-separator bg-elevated/90 px-4 backdrop-blur-xl max-md:h-14">
        <Link href="/direct/inbox" className="rounded-full p-1 hover:bg-hover md:hidden" aria-label="Back">
          <ChevronLeft size={28} />
        </Link>
        <Link href={`/${other.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar src={other.avatar} size={44} />
          <div className="min-w-0">
            <div className="flex items-center truncate text-base font-semibold">
              {chatTitle || other.name || other.username}
              {!chatTitle && other.verified && <Verified />}
            </div>
            <div className="truncate text-xs text-muted">{chatKind === "group" ? `${chatMemberCount} members` : other.username}</div>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <button className="rounded-full p-2 hover:bg-hover" onClick={() => setOutgoingKind("audio")} aria-label="Audio call">
            <Phone size={24} />
          </button>
          <button className="rounded-full p-2 hover:bg-hover" onClick={() => setOutgoingKind("video")} aria-label="Video call">
            <Video size={26} />
          </button>
          <Link href={`/${other.username}`} className="rounded-full p-2 hover:bg-hover" aria-label="Conversation information">
            <Info size={24} />
          </Link>
          <button className="rounded-full p-2 hover:bg-hover" onClick={() => void cycleTheme()} aria-label="Change chat theme" title="Change chat theme">
            <Palette size={22} />
          </button>
          <button className="rounded-full p-2 hover:bg-hover" onClick={() => void cycleWallpaper()} aria-label="Change chat wallpaper" title="Change chat wallpaper">
            <Sticker size={21} />
          </button>
          <button className={`rounded-full p-2 hover:bg-hover ${isMuted ? "text-link" : ""}`} onClick={() => void toggleMute()} aria-label={isMuted ? "Unmute chat" : "Mute chat"} title={isMuted ? "Unmute chat" : "Mute chat"}>
            <MoreHorizontal size={22} />
          </button>
          <button className="rounded-full p-2 hover:bg-hover" onClick={() => setSearchOpen((value) => !value)} aria-label="Search in conversation" title="Search in conversation">
            <Search size={22} />
          </button>
        </div>
      </header>

      {searchOpen && <div className="flex shrink-0 items-center gap-2 border-b border-separator bg-elevated px-4 py-2"><Search size={17} className="text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchChat()} placeholder="Search this chat" className="min-w-0 flex-1 bg-transparent outline-none" autoFocus /><button type="button" onClick={() => void searchChat()} className="text-sm font-semibold text-link">Search</button>{searchResults && <button type="button" onClick={() => { setSearch(""); setSearchResults(null); }} className="text-sm text-muted">Clear</button>}</div>}

      <div className="chat-thread flex-1 overflow-y-auto px-3 py-5 md:px-8 md:py-6">
        {searchResults && <div className="mb-4 rounded-xl border border-link/20 bg-link/5 px-3 py-2 text-sm text-muted">Found {searchResults.length} message{searchResults.length === 1 ? "" : "s"} for “{search}”.</div>}
        <div className="mb-8 flex flex-col items-center pt-4 text-center">
          <Avatar src={other.avatar} size={96} />
          <div className="mt-3 flex items-center text-xl font-semibold">
            {chatTitle || other.name || other.username}
            {!chatTitle && other.verified && <Verified size={14} />}
          </div>
        <div className="text-muted">{chatKind === "group" ? `${chatMemberCount} members · shalter` : `${other.username} · shalter`}</div>
          <Link href={`/${other.username}`} className="mt-4 rounded-lg bg-secondary px-4 py-[7px] font-semibold hover:bg-secondary-hover">
            View profile
          </Link>
        </div>

        {messages.map((m, i) => {
          const mine = m.senderId === me.id;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const showTime = !prev || m.createdAt - prev.createdAt > 60 * 60 * 1000;
          const lastOfGroup = !next || next.senderId !== m.senderId || next.createdAt - m.createdAt > 60 * 60 * 1000;
          const bigEmoji = /^\p{Extended_Pictographic}{1,3}$/u.test(m.text);
              const canInteract = m.kind !== "invoice" && m.kind !== "receipt";
          return (
            <div key={m.id}>
              {showTime && (
                <div className="my-4 text-center text-xs text-muted">
                  {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              )}
              <div
                className={`group mb-0.5 flex items-end gap-2 max-md:select-none ${mine ? "justify-end" : ""} ${lastOfGroup ? "mb-2" : ""}`}
                {...(canInteract ? holdToOpenMenu(m.id) : {})}
              >
                {!mine && <span className="w-7 shrink-0">{lastOfGroup && <Avatar src={other.avatar} size={28} />}</span>}
                {canInteract && (
                  <button
                    className="self-center p-1 text-muted opacity-0 hover:text-fg group-hover:opacity-100 max-md:hidden"
                    onClick={() => setMenuFor(m.id)}
                    aria-label="Message options"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
                <div className="flex max-w-[92%] flex-col md:max-w-[76%]">
                {m.replyTo && (
                  <div className={`mb-1 max-w-[260px] rounded-xl border-l-2 px-3 py-1 text-xs ${mine ? "border-link bg-link/10" : "border-muted bg-secondary"}`}>
                    <span className="font-semibold">Replying to a message</span>
                    <div className="truncate text-muted">{m.replyTo.text}</div>
                  </div>
                )}
                {m.invoice ? (
                  <InvoiceCardView invoice={m.invoice} />
                ) : m.kind === "voice" ? (
                  <VoiceBubble seconds={m.voiceSeconds ?? 0} mine={mine} url={m.voiceUrl} />
                ) : m.media ? (
                  <MediaBubble media={m.media} mine={mine} />
                ) : m.call ? (
                  <CallBubble call={m.call} mine={mine} />
                ) : m.gift ? (
                  <GiftBubble gift={m.gift} mine={mine} />
                ) : m.poll ? (
                  <PollBubble poll={m.poll} mine={mine} onVote={(option) => void vote(m.id, option)} />
                ) : m.post ? (
                  <SharedPostBubble post={m.post} mine={mine} />
                ) : bigEmoji ? (
                  <span className="text-[40px] leading-[48px]">{m.text}</span>
                ) : (
                  <span
                    dir="auto"
                    title={new Date(m.createdAt).toLocaleString()}
                    className={`min-w-[84px] max-w-full whitespace-pre-wrap break-words rounded-[20px] px-4 py-3 text-[15px] leading-5 shadow-sm ${
                      mine ? "bg-bubble-mine text-white" : "bg-bubble-them"
                    }`}
                  >
                    {m.text}
                  </span>
                )}
                {m.editedAt && <span className="mt-0.5 text-[10px] text-muted">edited</span>}
                {m.pinnedAt && <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><Pin size={10} />Pinned</span>}
                {m.reactions.length > 0 && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                    {m.reactions.map((reaction) => (
                      <button key={reaction.emoji} type="button" onClick={() => react(m.id, reaction.emoji)} className={`rounded-full border px-1.5 py-0.5 text-xs ${reaction.reacted ? "border-link bg-link/10" : "border-border"}`}>
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                  </div>
                )}
                </div>
              </div>
              {mine && !next && (
                <div className="-mt-1 mb-2 text-right text-xs text-muted">
                  {otherLastReadId >= m.id ? "Seen" : "Sent"}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {menuFor !== null && (
        (() => {
          const selected = messages.find((m) => m.id === menuFor);
          if (!selected) return null;
          return (
            <OptionsMenu
              onClose={() => setMenuFor(null)}
              options={[
                { label: "Reply", onClick: () => (setReplyTo(selected), setMenuFor(null)) },
                { label: "Forward", onClick: () => (setForwardFor(selected), setMenuFor(null)) },
                { label: selected.pinnedAt ? "Unpin message" : "Pin message", onClick: () => void pin(selected) },
                ...QUICK_EMOJI.slice(0, 8).map((emoji) => ({ label: `React ${emoji}`, onClick: () => (void react(selected.id, emoji), setMenuFor(null)) })),
                ...(selected.senderId === me.id && selected.kind === "text" ? [{ label: "Edit", onClick: () => (setEditing(selected), setText(selected.text), setMenuFor(null)) }] : []),
                ...(selected.senderId === me.id && !["invoice", "receipt", "welcome"].includes(selected.kind) ? [{ label: "Unsend", danger: true, onClick: () => unsend(selected.id) }] : []),
              ]}
            />
          );
        })()
      )}
      {forwardFor && <ForwardModal message={forwardFor} onClose={() => setForwardFor(null)} onDone={() => { setForwardFor(null); toast("Message forwarded"); }} />}

      <form
        className="relative mx-3 mb-[calc(12px+env(safe-area-inset-bottom))] flex min-h-[52px] items-center gap-2 rounded-[26px] border border-border bg-field px-3 py-2 shadow-sm md:mx-auto md:mb-5 md:w-[calc(100%-2rem)] md:max-w-[880px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (editing) void edit(text);
          else void send(text);
        }}
      >
        {(replyTo || editing) && (
          <div className="absolute bottom-[52px] left-0 right-0 flex items-center justify-between rounded-xl border border-border bg-elevated px-3 py-2 text-xs shadow-lg">
            <div className="min-w-0"><span className="font-semibold">{editing ? "Editing message" : "Replying"}</span><div className="truncate text-muted">{(editing ?? replyTo)?.text}</div></div>
            <button type="button" onClick={() => { setReplyTo(null); setEditing(null); setText(""); }} className="p-1" aria-label="Cancel"><X size={16} /></button>
          </div>
        )}
        {emojiOpen && (
          <div className="absolute bottom-[52px] left-0 grid grid-cols-8 gap-1 rounded-xl bg-elevated p-2 shadow-lg">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded p-1 text-2xl hover:bg-hover"
                onClick={() => {
                  setText((t) => t + e);
                  setEmojiOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {giftOpen && <div className="absolute bottom-[52px] right-0 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-elevated p-3 shadow-xl">{gifts.loading ? <Spinner size={22} /> : gifts.data?.gifts.map((gift) => <button type="button" key={gift.id} onClick={() => void sendGiftMessage(gift)} className="flex w-20 flex-col items-center rounded-xl p-2 hover:bg-hover"><span className="text-3xl">{gift.emoji}</span><span className="mt-1 truncate text-xs font-semibold">{gift.name}</span><span className="text-[10px] text-muted">{gift.price} stars</span></button>)}</div>}
        <button type="button" onClick={() => setEmojiOpen((o) => !o)} aria-label="Choose an emoji">
          <Smile size={24} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
          dir="auto"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none placeholder:text-muted"
          maxLength={1000}
          autoFocus
        />
        {text.trim() ? (
          <button className="font-semibold text-link hover:text-link-text">{editing ? "Save" : "Send"}</button>
        ) : (
          <>
            <button type="button" onClick={() => void toggleRecording()} aria-label={recording ? "Stop recording" : "Record voice message"} className={recording ? "text-danger" : ""}>
              {recording ? <Square size={20} className="fill-current" /> : <Mic size={24} />}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void sendMedia(file);
              }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} aria-label="Add photo or video">
              <ImageIcon size={24} />
            </button>
            <button type="button" onClick={() => send("❤️")} aria-label="Send a heart">
              <Sticker size={24} />
            </button>
            <button type="button" onClick={() => setPollOpen(true)} aria-label="Create poll" title="Create poll">
              <BarChart3 size={23} />
            </button>
            <button type="button" onClick={() => setGiftOpen((open) => !open)} aria-label="Send a gift" title="Send a gift">
              <Gift size={23} />
            </button>
          </>
        )}
      </form>
      {pollOpen && <PollModal onClose={() => setPollOpen(false)} onCreate={(question, options) => void sendPollMessage(question, options)} />}
      {(outgoingKind || incomingCall) && <CallOverlay conversationId={id} meId={me.id} other={other} startKind={outgoingKind} incoming={incomingCall} onClose={() => { setOutgoingKind(undefined); setIncomingCall(null); }} />}
    </div>
  );
}

/** Instagram Direct: conversation list on the left, open thread on the right (one at a time on phones). */
export function Inbox({ selectedId }: { selectedId: number | null }) {
  const [composing, setComposing] = useState(false);
  if (selectedId !== null && (!Number.isInteger(selectedId) || selectedId <= 0)) {
    return <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-muted">Invalid chat link. <Link href="/direct/inbox" className="ml-1 text-link underline">Open chats</Link></div>;
  }
  return (
    <div className={`flex md:h-screen ${selectedId ? "h-dvh" : "h-[calc(100dvh-var(--nav-h))]"}`}>
      <div
        className={`w-full shrink-0 border-r border-separator md:w-[108px] min-[62.5rem]:w-[397px] ${selectedId ? "max-md:hidden" : ""}`}
      >
        <div className="h-full md:hidden min-[62.5rem]:flex min-[62.5rem]:flex-col">
          <ConversationList selectedId={selectedId} />
        </div>
        <CompactList selectedId={selectedId} />
      </div>
      <div className={`min-w-0 flex-1 ${selectedId ? "" : "max-md:hidden"}`}>
        {selectedId ? (
          <Thread key={selectedId} id={selectedId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-fg">
              <Send size={44} strokeWidth={1.3} />
            </span>
            <h2 className="mt-1 text-xl">Your messages</h2>
            <p className="text-muted">Send private photos and messages to a friend or group.</p>
            <PrimaryButton onClick={() => setComposing(true)}>Send message</PrimaryButton>
          </div>
        )}
      </div>
      {composing && <NewMessageModal onClose={() => setComposing(false)} />}
    </div>
  );
}

/** Avatar-only conversation list for medium screens. */
function CompactList({ selectedId }: { selectedId: number | null }) {
  const { data, error, reload } = useApi<{ conversations: Conversation[] }>("/api/conversations");
  return (
    <div className="hidden h-full flex-col items-center gap-2 overflow-y-auto pt-9 md:flex min-[62.5rem]:hidden">
      {error ? <button type="button" onClick={reload} className="px-2 text-center text-xs font-semibold text-link" title={error}>Retry</button> : data?.conversations.map((c) => (
        <Link key={c.id} href={`/direct/t/${c.id}`} className={`relative rounded-full p-1 ${selectedId === c.id ? "bg-hover" : ""}`}>
          <Avatar src={c.other.avatar} size={56} />
          {c.unread && <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-bg bg-link" />}
        </Link>
      ))}
    </div>
  );
}
