"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronLeft, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { api, useApi } from "@/lib/client";
import type { Me } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { Avatar, OptionsMenu, PrimaryButton } from "@/components/ui";

export default function EditProfilePage() {
  const { me, setMe, toast } = useApp();
  const router = useRouter();
  const [form, setForm] = useState({ name: me.name, lastName: me.lastName, username: me.username, website: me.website, bio: me.bio, email: me.email, phone: me.phone ?? "" });
  const [privacy, setPrivacy] = useState({ privateAccount: me.privateAccount, showActivity: me.showActivity, allowMessages: me.allowMessages });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const sessions = useApi<{ sessions: { id: string; current: boolean; createdAt: number }[] }>("/api/auth/sessions");
  const [saving, setSaving] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const changed = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== me[k]) || Object.keys(privacy).some((k) => privacy[k as keyof typeof privacy] !== me[k as keyof typeof me]);

  const send = async (fd: FormData) => {
    const { user } = await api<{ user: Me }>("/api/me", { method: "PATCH", body: fd });
    setMe(user);
    return user;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      Object.entries(privacy).forEach(([k, v]) => fd.append(k, v ? "1" : "0"));
      const user = await send(fd);
      toast("Profile saved.");
      if (user.username !== me.username) router.replace(`/${user.username}`);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      await send(fd);
      toast("Profile photo added.");
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const changePassword = async () => {
    if (passwords.next !== passwords.confirm) {
      toast("New passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword: passwords.current, newPassword: passwords.next } });
      setPasswords({ current: "", next: "", confirm: "" });
      toast("Password changed.");
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushStatus(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push notifications are not supported in this browser.");
      const config = await api<{ configured: boolean; publicKey: string | null }>("/api/push/config");
      if (!config.configured || !config.publicKey) throw new Error("Push is not configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(config.publicKey) });
      await api("/api/push/subscribe", { body: subscription.toJSON() });
      setPushStatus("Push notifications enabled.");
    } catch (error) { setPushStatus((error as Error).message); }
    finally { setPushBusy(false); }
  };

  const field = (key: keyof typeof form, label: string, help?: string, multiline = false) => (
    <label className="block">
      <span className="mb-2 block text-base font-bold">{label}</span>
      {multiline ? (
        <div className="relative">
          <textarea
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value.slice(0, 150) })}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-fg/50"
          />
          <span className="absolute bottom-3 right-4 text-xs text-muted">{form[key].length} / 150</span>
        </div>
      ) : (
        <input
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-xl border border-border bg-transparent px-4 py-3 outline-none focus:border-fg/50"
        />
      )}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );

  return (
    <div className="mx-auto max-w-[700px] px-4 pb-10 md:px-8 md:pt-9">
      <header className="-mx-4 mb-4 flex h-11 items-center border-b border-separator px-2 md:hidden">
        <button onClick={() => router.back()} aria-label="Back">
          <ChevronLeft size={28} />
        </button>
        <h1 className="flex-1 pr-7 text-center text-base font-semibold">Edit profile</h1>
      </header>
      <h1 className="mb-8 hidden text-xl font-bold md:block">Edit profile</h1>

      <div className="mb-8 flex items-center gap-4 rounded-2xl bg-secondary p-4">
        <Avatar src={me.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{me.username}</div>
          <div className="truncate text-muted">{me.name}</div>
        </div>
        <PrimaryButton onClick={() => (me.avatar ? setPhotoMenu(true) : fileInput.current?.click())}>Change photo</PrimaryButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            uploadPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <form onSubmit={save} className="space-y-6">
        {field("name", "Name", "Help people discover your account by using the name you're known by.")}
        {field("lastName", "Last name", "Optional. This is shown next to your first name on your profile.")}
        {field("username", "Username")}
        {field("website", "Website")}
        {field("bio", "Bio", undefined, true)}
        {field("email", "Email", "Only you can see this.")}
        {field("phone", "Phone number", "Use the configured admin number to unlock the admin panel.")}
        <section className="rounded-2xl border border-border p-4">
          <h2 className="mb-1 text-base font-bold">Privacy and messaging</h2>
          <p className="mb-4 text-sm text-muted">Control who can see your activity and contact you.</p>
          {([
            ["privateAccount", "Private account", "Only approved followers can see your posts and stories."],
            ["showActivity", "Show activity status", "Let people you message see when you are active."],
            ["allowMessages", "Allow new messages", "People can start a conversation with you."],
          ] as const).map(([key, label, help]) => (
            <label key={key} className="flex items-center gap-3 border-t border-separator py-3">
              <input type="checkbox" checked={privacy[key]} onChange={(e) => setPrivacy({ ...privacy, [key]: e.target.checked })} className="h-4 w-4 accent-[var(--link)]" />
              <span><span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{help}</span></span>
            </label>
          ))}
        </section>
        <section className="rounded-2xl border border-border p-4">
          <div className="mb-1 flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} />Active sessions</div>
          <p className="mb-3 text-sm text-muted">Review where your account is signed in and close other sessions.</p>
          <div className="mb-3 space-y-2">{sessions.data?.sessions.map((session) => <div key={session.id} className="flex items-center gap-3 rounded-xl bg-field px-3 py-2 text-sm"><MonitorSmartphone size={17} className="text-muted" /><span className="min-w-0 flex-1">{session.current ? "This device" : "Other device"}<span className="ml-2 text-xs text-muted">{new Date(session.createdAt).toLocaleString()}</span></span>{session.current && <span className="text-xs font-semibold text-link">Active</span>}</div>)}</div>
          <PrimaryButton type="button" onClick={async () => { await api("/api/auth/sessions", { method: "DELETE" }); sessions.reload(); toast("Other sessions closed."); }}>Sign out other devices</PrimaryButton>
        </section>
        <section className="rounded-2xl border border-border p-4">
          <h2 className="mb-1 text-base font-bold">Notifications</h2>
          <p className="mb-3 text-sm text-muted">Get messages, reactions and follows even when shalter is not open.</p>
          <PrimaryButton type="button" onClick={() => void enablePush()} disabled={pushBusy}>{pushBusy ? "Enabling..." : "Enable push notifications"}</PrimaryButton>
          {pushStatus && <p className="mt-2 text-sm text-muted">{pushStatus}</p>}
        </section>
        <section className="rounded-2xl border border-border p-4">
          <h2 className="mb-1 text-base font-bold">Password and security</h2>
          <p className="mb-4 text-sm text-muted">Use a unique password to keep your account safe.</p>
          <div className="space-y-2">
            <input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} placeholder="Current password" autoComplete="current-password" className="w-full rounded-lg bg-field px-3 py-2 outline-none" />
            <input minLength={8} type="password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} placeholder="New password" autoComplete="new-password" className="w-full rounded-lg bg-field px-3 py-2 outline-none" />
            <input minLength={8} type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} placeholder="Repeat new password" autoComplete="new-password" className="w-full rounded-lg bg-field px-3 py-2 outline-none" />
            <PrimaryButton type="button" onClick={() => void changePassword()} disabled={passwordBusy || passwords.next.length < 8} className="mt-2">{passwordBusy ? "Updating..." : "Change password"}</PrimaryButton>
          </div>
        </section>
        <div className="flex justify-end">
          <PrimaryButton disabled={!changed || saving} className="w-full px-12 py-3 md:w-auto">
            {saving ? "Saving..." : "Submit"}
          </PrimaryButton>
        </div>
      </form>

      {photoMenu && (
        <OptionsMenu
          onClose={() => setPhotoMenu(false)}
          options={[
            { label: "Upload Photo", bold: true, onClick: () => (setPhotoMenu(false), fileInput.current?.click()) },
            {
              label: "Remove Current Photo",
              danger: true,
              onClick: async () => {
                setPhotoMenu(false);
                const fd = new FormData();
                fd.append("removeAvatar", "1");
                await send(fd);
                toast("Profile photo removed.");
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
