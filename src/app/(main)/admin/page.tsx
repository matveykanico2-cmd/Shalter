"use client";

import { ShieldCheck, Trash2, UserCheck, Users, Image as ImageIcon, MessageCircle, Clapperboard, Mail, Radio, MessagesSquare, Globe2 } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { PrimaryButton, Verified } from "@/components/ui";

type Overview = {
  stats: { users: number; posts: number; stories: number; messages: number; conversations: number; channels: number; communities: number; live: number };
  users: { id: number; username: string; name: string; phone: string | null; verified: number; created_at: number }[];
  posts: { id: number; username: string; caption: string; type: string; created_at: number }[];
};
type ServerStatus = { status: string; node: string; uptimeSeconds: number; environment: string; database: { users: number; conversations: number; media: number }; integrations: { smtp: boolean; push: boolean } };

const date = (value: number) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function AdminPage() {
  const { data, loading, error, reload } = useApi<Overview>("/api/admin/overview");
  const server = useApi<ServerStatus>("/api/admin/server");
  const [email, setEmail] = useState("");
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  const removeUser = async (id: number, username: string) => {
    if (!window.confirm(`Delete @${username} and all of their content?`)) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    reload();
  };

  const removePost = async (id: number) => {
    if (!window.confirm("Delete this post?")) return;
    await api(`/api/admin/posts/${id}`, { method: "DELETE" });
    reload();
  };

  const toggleVerified = async (user: Overview["users"][number]) => {
    await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { verified: !user.verified } });
    reload();
  };

  const testMail = async () => {
    setMailStatus(null);
    try { const result = await api<{ to: string }>("/api/admin/email", { method: "POST", body: { to: email || undefined } }); setMailStatus(`Test email sent to ${result.to}`); }
    catch (e) { setMailStatus((e as Error).message); }
  };

  if (loading) return <div className="p-8 text-muted">Loading admin panel…</div>;
  if (error) return <div className="p-8 text-danger">{error}</div>;
  if (!data) return null;

  const cards = [
    [Users, "Users", data.stats.users],
    [ImageIcon, "Posts", data.stats.posts],
    [Clapperboard, "Active stories", data.stats.stories],
    [MessageCircle, "Messages", data.stats.messages],
    [MessagesSquare, "Chats", data.stats.conversations],
    [Globe2, "Communities", data.stats.communities],
    [Radio, "Live now", data.stats.live],
  ] as const;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-link text-white"><ShieldCheck size={24} /></span>
        <div><h1 className="text-2xl font-bold">Admin panel</h1><p className="text-muted">Manage users, content and activity</p></div>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([Icon, label, value]) => <div key={label} className="rounded-xl border border-border bg-elevated p-4"><Icon size={20} className="text-muted" /><div className="mt-3 text-2xl font-bold">{value}</div><div className="text-sm text-muted">{label}</div></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">Users</h2><UserCheck size={18} className="text-muted" /></div>
          <div className="divide-y divide-border">
            {data.users.map((user) => <div key={user.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1 truncate font-semibold">@{user.username} {user.verified ? <Verified size={14} /> : null}</div><div className="truncate text-xs text-muted">{user.name || "No name"} · {date(user.created_at)}</div></div>{user.phone && <span className="hidden text-xs text-muted sm:block">{user.phone}</span>}<button onClick={() => void toggleVerified(user)} aria-label={user.verified ? `Remove verification from ${user.username}` : `Verify ${user.username}`} title={user.verified ? "Remove verification" : "Verify account"} className={`rounded-lg px-2 py-1 text-xs font-semibold ${user.verified ? "bg-link/10 text-link" : "bg-field text-muted hover:text-fg"}`}>{user.verified ? "Verified" : "Verify"}</button><button onClick={() => void removeUser(user.id, user.username)} aria-label={`Delete ${user.username}`} className="rounded p-2 text-danger hover:bg-hover"><Trash2 size={17} /></button></div>)}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">Recent posts</h2><ImageIcon size={18} className="text-muted" /></div>
          <div className="divide-y divide-border">
            {data.posts.map((post) => <div key={post.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="font-semibold">@{post.username} <span className="font-normal text-muted">· {post.type}</span></div><div className="truncate text-sm text-muted">{post.caption || "No caption"}</div></div><button onClick={() => removePost(post.id)} aria-label={`Delete post ${post.id}`} className="rounded p-2 text-danger hover:bg-hover"><Trash2 size={17} /></button></div>)}
          </div>
        </section>
      </div>
      <div className="mt-6"><PrimaryButton type="button" onClick={reload}>Refresh</PrimaryButton></div>
      <section className="mt-6 rounded-xl border border-border bg-elevated p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><Mail size={18} />Email delivery</div><p className="mb-3 text-sm text-muted">Send a test through the configured Yandex SMTP mailbox.</p><div className="flex flex-col gap-2 sm:flex-row"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Recipient (empty = your account email)" className="min-w-0 flex-1 rounded-lg bg-field px-3 py-2 outline-none" /><PrimaryButton type="button" onClick={() => void testMail()}>Send test</PrimaryButton></div>{mailStatus && <p className="mt-3 text-sm text-muted">{mailStatus}</p>}</section>
      {server.data && <section className="mt-6 rounded-xl border border-border bg-elevated p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} />Server status</div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600">{server.data.status.toUpperCase()}</span></div><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><div className="text-muted">Environment</div><div className="font-semibold">{server.data.environment}</div></div><div><div className="text-muted">Node</div><div className="font-semibold">{server.data.node}</div></div><div><div className="text-muted">Uptime</div><div className="font-semibold">{Math.floor(server.data.uptimeSeconds / 60)} min</div></div><div><div className="text-muted">Database</div><div className="font-semibold">{server.data.database.users} users · {server.data.database.conversations} chats</div></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${server.data.integrations.smtp ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted"}`}>SMTP {server.data.integrations.smtp ? "ready" : "off"}</span><span className={`rounded-full px-2 py-1 ${server.data.integrations.push ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted"}`}>Push {server.data.integrations.push ? "ready" : "off"}</span></div></section>}
    </div>
  );
}
