import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Icon, SettingsPage, SettingsSection, SettingsRow, TextField, toast } from "@/shared/ui";

import { createPartner, deletePartner, listPartners, updatePartner } from "../../partners/api/partners";

/** Админ: управление партнёрами — добавлять, редактировать, удалять партнёров и их публичные страницы. */
export function PartnersAdminSection() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<{ id: string; username: string; name: string; bio: string; linkUrl: string } | null>(null);
  const partners = useQuery<{ id: string; userId: string; username: string; name: string; bio: string; avatarUrl?: string | null; bannerUrl?: string | null; linkUrl?: string | null; createdBy: string; createdAt: string; updatedAt: string }[]>({
    queryKey: ["partners", "admin-list"],
    queryFn: listPartners,
  });

  const create = async () => {
    const userId = prompt("ID пользователя (партнёра):");
    if (!userId) return;
    const username = prompt("Имя пользователя (латиница, цифры, _):");
    if (!username) return;
    const name = prompt("Отображаемое имя:");
    if (!name) return;
    try {
      await createPartner({ userId, username, name });
      await client.invalidateQueries({ queryKey: ["partners", "admin-list"] });
      toast("Партнёр добавлен");
    } catch (err) {
      toast(errorText(err, "Не удалось добавить партнёра"), { error: true });
    }
  };

  const save = async (item: { id: string; username: string; name: string; bio: string; linkUrl: string }) => {
    try {
      await updatePartner(item.id, { username: item.username, name: item.name, bio: item.bio, linkUrl: item.linkUrl });
      setEditing(null);
      await client.invalidateQueries({ queryKey: ["partners", "admin-list"] });
      toast("Партнёр обновлён");
    } catch (err) {
      toast(errorText(err, "Не удалось обновить партнёра"), { error: true });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить партнёра?")) return;
    try {
      await deletePartner(id);
      await client.invalidateQueries({ queryKey: ["partners", "admin-list"] });
      toast("Партнёр удалён");
    } catch (err) {
      toast(errorText(err, "Не удалось удалить партнёра"), { error: true });
    }
  };

  return (
    <SettingsPage>
      <SettingsSection title="Партнёры" caption="Админ добавляет партнёров — у каждого своя публичная страница /partners/<username>.">
        <Button variant="secondary" onClick={create}>
          <Icon name="Plus" size={16} />
          Добавить партнёра
        </Button>
        {partners.data?.map((p) => (
          <SettingsRow
            key={p.id}
            title={p.name}
            subtitle={`@${p.username} · ${p.bio || "без описания"} · ${p.linkUrl || "без ссылки"}`}
            right={
              <>
                <Button variant="secondary" onClick={() => setEditing({ id: p.id, username: p.username, name: p.name, bio: p.bio, linkUrl: p.linkUrl ?? "" })}>
                  <Icon name="Edit" size={14} />
                </Button>
                <Button variant="danger" onClick={() => void remove(p.id)}>
                  <Icon name="Trash" size={14} />
                </Button>
              </>
            }
          />
        ))}
      </SettingsSection>

      {editing && (
        <SettingsSection title="Редактировать партнёра">
          <label>
            <span>Имя пользователя</span>
            <TextField value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
          </label>
          <label>
            <span>Отображаемое имя</span>
            <TextField value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label>
            <span>Описание</span>
            <TextField value={editing.bio} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} />
          </label>
          <label>
            <span>Ссылка</span>
            <TextField value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Отмена
            </Button>
            <Button onClick={() => void save(editing!)}>Сохранить</Button>
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
