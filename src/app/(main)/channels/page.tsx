"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Plus, MessageCircle } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Avatar, Modal, PrimaryButton } from "@/components/ui";

type Channel = { id: number; title: string; discussionId: number | null; owner: { username: string; name: string; avatar: string | null; verified: boolean }; memberCount: number; joined: boolean; lastMessage: string | null };

function CreateChannel({ close, reload }: { close: () => void; reload: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return <Modal onClose={close} showClose={false} className="w-[440px] max-w-full"><form className="space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const r = await api<{ id: number }>("/api/channels", { body: { title } }); close(); reload(); router.push(`/direct/t/${r.id}`); } finally { setBusy(false); } }}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Create channel</h2><button type="button" onClick={close}>×</button></div><input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Channel name" className="w-full rounded-xl bg-field px-3 py-3 outline-none" /><p className="text-sm text-muted">Publish updates to followers in a focused, public space.</p><PrimaryButton disabled={busy} className="w-full">{busy ? "Creating…" : "Create channel"}</PrimaryButton></form></Modal>;
}

export default function ChannelsPage() {
  const { data, reload } = useApi<{ channels: Channel[] }>("/api/channels");
  const [create, setCreate] = useState(false);
  const join = async (channel: Channel) => { await api("/api/channels", { method: "POST", body: { action: channel.joined ? "leave" : "join", channelId: channel.id } }); reload(); };
  return <main className="mx-auto max-w-[980px] px-4 py-8 md:px-8"><div className="mb-8 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Channels</h1><p className="mt-1 text-muted">Follow creators and keep up with their updates.</p></div><PrimaryButton onClick={() => setCreate(true)}><span className="flex items-center gap-2"><Plus size={17} />Create</span></PrimaryButton></div><div className="grid gap-4 md:grid-cols-2">{data?.channels.map((c) => <article key={c.id} className="rounded-2xl border border-border bg-elevated p-5 shadow-sm"><div className="flex items-center gap-3"><Avatar src={c.owner.avatar} size={52} /><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold">{c.title}</h2><p className="truncate text-sm text-muted">@{c.owner.username} · {c.memberCount} subscribers</p></div><Radio size={20} className="text-link" /></div><p className="mt-4 min-h-10 text-sm text-muted">{c.lastMessage || "No updates yet. Be the first to follow this channel."}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/direct/t/${c.id}`} className="flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-xl bg-field px-3 py-2 text-sm font-semibold"><MessageCircle size={16} />Open</Link>{c.discussionId && <Link href={`/direct/t/${c.discussionId}`} className="flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold"><MessageCircle size={16} />Discussion</Link>}<button onClick={() => void join(c)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">{c.joined ? "Following" : "Follow"}</button></div></article>)}</div>{!data?.channels.length && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted">No channels yet.</div>}{create && <CreateChannel close={() => setCreate(false)} reload={reload} />}</main>;
}
