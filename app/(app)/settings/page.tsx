"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/icons";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import { api } from "@/lib/client/api";
import { fileToAvatarDataUrl } from "@/lib/client/image";

export default function ProfileSettingsPage() {
  const me = useCurrentUser();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [avatarImage, setAvatarImage] = useState(me.avatarImage);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function save() {
    await api.updateProfile(me.id, { name, username, bio });
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatarImage(dataUrl);
      await api.updateProfile(me.id, { avatarImage: dataUrl });
      router.refresh();
    } catch {
      alert("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative"
          title="Изменить фото"
          disabled={uploading}
        >
          <Avatar name={name || "?"} color={me.avatarColor} image={avatarImage} size={72} />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-contrast">
            <Icon.Edit size={12} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        <div>
          <p className="font-serif text-xl font-semibold">{name || "Без имени"}</p>
          <p className="font-mono text-sm text-muted">{me.phone || me.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Имя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Юзернейм</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">О себе</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <button onClick={save} className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
