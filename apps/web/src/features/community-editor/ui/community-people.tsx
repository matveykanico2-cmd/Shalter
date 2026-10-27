import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { chatsCountLabel, type Community, type CommunityAdmin, communityApi, type CommunityMember, type CommunityRights } from "@/entities/community";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Button, Dialog, TextField, toast,Toggle } from "@/shared/ui";

import { RIGHTS, rightsSummary } from "../lib/options";
import { useCommunityActions } from "../model/use-community-actions";

import styles from "./community-editor.module.css";
import { ChatLine, Empty, Row, UserLine } from "./parts";

type Base = { community: Community; onChanged: () => void; onClose: () => void };
type Person = Pick<CommunityMember, "id" | "name" | "avatarColor" | "avatarImage"> & { badge?: string | null; title?: string | null; role?: "owner" | "admin" | "member" };

const peopleKey = (id: string, what: string) => ["communities", "people", id, what] as const;

/** Администраторы сообщества и их права — openCommunityAdmins. */
export function AdminsDialog({ community, meId, onChanged, onClose }: Base & { meId: string }) {
  const client = useQueryClient();
  const admins = useQuery({ queryKey: peopleKey(community.id, "admins"), queryFn: () => communityApi.admins(community.id).then((r) => r.admins), staleTime: 0 });
  const canAdd = community.rights.addAdmins;
  const [step, setStep] = useState<{ kind: "pick" } | { kind: "rights"; user: Person; current: CommunityRights | null } | null>(null);
  const [badgeUser, setBadgeUser] = useState<Person | null>(null);
  const done = () => {
    void client.invalidateQueries({ queryKey: peopleKey(community.id, "admins") });
    onChanged();
  };

  if (step?.kind === "pick") {
    return (
      <MemberPicker
        community={community}
        meId={meId}
        title="Новый администратор"
        filter={(u) => u.role === "member"}
        onPick={(user) => setStep({ kind: "rights", user, current: null })}
        onClose={() => setStep(null)}
      />
    );
  }
  if (step?.kind === "rights") return <AdminRightsDialog community={community} user={step.user} current={step.current} onDone={done} onClose={() => setStep(null)} />;

  return (
    <>
      <Dialog title="Администраторы" onClose={onClose}>
        <div className={styles.list}>
          {admins.isError ? <Empty>{errorText(admins.error, "Не удалось загрузить")}</Empty> : null}
          {admins.isPending ? <Empty>Загрузка…</Empty> : null}
          {admins.data ? (
            <>
              {canAdd ? <Row icon="UserPlus" title="Добавить администратора" accent onClick={() => setStep({ kind: "pick" })} /> : null}
              <Row icon="Smile" title="Значки и подписи участников" accent onClick={() => setBadgeUser(null)} />
              {admins.data.map((a: CommunityAdmin) => (
                <UserLine
                  key={a.id}
                  user={{ ...a, badge: a.badge ?? null, title: a.title ?? null }}
                  subtitle={a.role === "owner" ? "Владелец" : rightsSummary(a.rights)}
                  onClick={a.role !== "owner" && (canAdd || a.id === meId) ? () => setStep({ kind: "rights", user: { ...a, badge: a.badge ?? null, title: a.title ?? null }, current: a.rights }) : undefined}
                />
              ))}
            </>
          ) : null}
        </div>
        <p className={styles.caption}>Администраторы помогают управлять сообществом. Права каждого настраиваются отдельно.</p>
        <Button variant="link" onClick={onClose}>
          Назад
        </Button>
      </Dialog>
      {badgeUser ? <BadgeTitleDialog community={community} user={badgeUser} onClose={() => setBadgeUser(null)} onDone={done} /> : null}
    </>
  );
}

function AdminRightsDialog({ community, user, current, onDone, onClose }: { community: Community; user: Person; current: CommunityRights | null; onDone: () => void; onClose: () => void }) {
  const mine = community.rights;
  const [rights, setRights] = useState<CommunityRights>(() => {
    const base = { ...(current ?? { editInfo: true, editChats: true, ban: true, addAdmins: false }) };
    for (const r of RIGHTS) if (!mine[r.key]) base[r.key] = false;
    return base;
  });
  const [badge, setBadge] = useState(user.badge ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await communityApi.setAdmin(community.id, user.id, rights);
      await communityApi.setAdminBadge(community.id, user.id, badge || null, title || null);
      toast(current ? "Права сохранены" : `${user.name} теперь администратор`);
      onClose();
      onDone();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };
  const dismiss = async () => {
    if (!(await askConfirm(`Снять ${user.name} с должности администратора сообщества?`, { okLabel: "Снять", danger: true }))) return;
    try {
      await communityApi.removeAdmin(community.id, user.id);
      onClose();
      onDone();
    } catch (err) {
      toast(errorText(err, "Не удалось снять администратора"), { error: true });
    }
  };

  return (
    <Dialog title={current ? "Права администратора" : "Новый администратор"} onClose={onClose}>
      <UserLine
        user={user}
        subtitle={current ? rightsSummary(rights) : (user.role === "owner" ? "Владелец" : rightsSummary(current ?? mine))}
        right={
          <>
            {user.badge ? <span className={styles.badge}>{user.badge}</span> : null}
            {user.title ? <span className={styles.title}>{user.title}</span> : null}
          </>
        }
      />
      <p className={styles.sectionName}>Что может этот администратор</p>
      <div>
        {RIGHTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="switch"
            aria-checked={rights[r.key]}
            disabled={!mine[r.key]}
            className={styles.row}
            onClick={() => setRights((prev) => ({ ...prev, [r.key]: !prev[r.key] }))}
          >
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{r.title}</span>
              <span className={styles.rowSub}>{r.sub}</span>
            </span>
            <Toggle checked={rights[r.key]} />
          </button>
        ))}
      </div>
      <p className={styles.sectionName}>Значок и подпись рядом с именем</p>
      <label className={styles.field}>
        <span>Значок (эмодзи)</span>
        <TextField value={badge} maxLength={20} placeholder="Например: 🚲" onChange={(e) => setBadge(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>Подпись</span>
        <TextField value={title} maxLength={40} placeholder="Например: велосипед" onChange={(e) => setTitle(e.target.value)} />
      </label>
      {current ? <Row icon="ShieldOff" title="Снять с должности" danger onClick={() => void dismiss()} /> : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        {mine.addAdmins ? (
          <Button disabled={busy} onClick={() => void save()}>
            Сохранить
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

type PickerProps = { community: Community; meId: string; title: string; filter: (u: CommunityMember) => boolean; onPick: (u: CommunityMember) => void; onClose: () => void };

/** Участник сообщества с поиском — openCommunityMemberPicker. */
function MemberPicker({ community, meId, title, filter, onPick, onClose }: PickerProps) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const members = useQuery({ queryKey: [...peopleKey(community.id, "members"), query], queryFn: () => communityApi.members(community.id, query).then((r) => r.users), staleTime: 0 });
  const shown = (members.data ?? []).filter((u) => u.id !== meId && filter(u));
  return (
    <Dialog title={title} onClose={onClose}>
      <TextField value={search} placeholder="Поиск участников" aria-label="Поиск участников" autoFocus onChange={(e) => setSearch(e.target.value)} />
      <div className={styles.list}>
        {members.isError ? (
          <Empty>{errorText(members.error, "Не удалось загрузить участников")}</Empty>
        ) : !members.data ? (
          <Empty>Загрузка…</Empty>
        ) : shown.length ? (
          shown.map((u) => (
            <UserLine
              key={u.id}
              user={u}
              subtitle={u.username ? `@${u.username}` : null}
              onClick={() => {
                onClose();
                onPick(u);
              }}
            />
          ))
        ) : (
          <Empty>{query ? "Никого не нашлось" : "Подходящих участников нет"}</Empty>
        )}
      </div>
      <Button variant="link" onClick={onClose}>
        Назад
      </Button>
    </Dialog>
  );
}

/** Выдать значок и подпись любому участнику сообщества (не только админу). */
function BadgeTitleDialog({ community, user, onClose, onDone }: { community: Community; user: Person; onClose: () => void; onDone: () => void }) {
  const [badge, setBadge] = useState(user.badge ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await communityApi.setAdminBadge(community.id, user.id, badge || null, title || null);
      toast(`Значок и подпись для ${user.name} сохранены`);
      onClose();
      onDone();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  return (
    <Dialog title={`Значок и подпись — ${user.name}`} onClose={onClose}>
      <UserLine user={user} />
      <p className={styles.sectionName}>Значок (эмодзи) и подпись рядом с именем</p>
      <label className={styles.field}>
        <span>Значок</span>
        <TextField value={badge} maxLength={20} placeholder="Например: 🚲" onChange={(e) => setBadge(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>Подпись</span>
        <TextField value={title} maxLength={40} placeholder="Например: велосипед" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </Dialog>
  );
}

/** Удалённые пользователи — openCommunityBans и banUser. */
export function BansDialog({ community, meId, onChanged, onClose }: Base & { meId: string }) {
  const client = useQueryClient();
  const actions = useCommunityActions();
  const bans = useQuery({ queryKey: peopleKey(community.id, "bans"), queryFn: () => communityApi.bans(community.id).then((r) => r.users), staleTime: 0 });
  const [picking, setPicking] = useState(false);
  const done = () => {
    void client.invalidateQueries({ queryKey: peopleKey(community.id, "bans") });
    onChanged();
  };
  const ban = async (user: Person) => {
    const owned = await communityApi.banPreview(community.id, user.id).then(
      (r) => r.chats,
      () => []
    );
    const warning = owned.length ? ` Вместе с ним из сообщества уберутся ${chatsCountLabel(owned.length)}, которыми он владеет: ${owned.map((c) => `«${c.title}»`).join(", ")}.` : "";
    if (!(await askConfirm(`Удалить ${user.name} из сообщества «${community.title}»?${warning}`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await communityApi.ban(community.id, user.id);
      toast(`${user.name} удалён из сообщества`);
      void actions.refresh(community.id);
      done();
    } catch (err) {
      toast(errorText(err, "Не удалось удалить пользователя"), { error: true });
    }
  };
  const unban = async (user: Person) => {
    try {
      await communityApi.unban(community.id, user.id);
      toast(`${user.name} может снова вступить в сообщество`);
      done();
    } catch (err) {
      toast(errorText(err, "Не удалось разблокировать"), { error: true });
    }
  };

  if (picking) {
    return (
      <MemberPicker
        community={community}
        meId={meId}
        title="Удалить из сообщества"
        filter={(u) => u.role !== "owner" && (community.isOwner || u.role !== "admin")}
        onPick={(u) => void ban(u)}
        onClose={() => setPicking(false)}
      />
    );
  }
  return (
    <Dialog title="Удалённые пользователи" onClose={onClose}>
      <div className={styles.list}>
        <Row icon="UserX" title="Удалить пользователя" danger onClick={() => setPicking(true)} />
        {bans.isError ? (
          <Empty>{errorText(bans.error, "Не удалось загрузить")}</Empty>
        ) : !bans.data ? (
          <Empty>Загрузка…</Empty>
        ) : bans.data.length ? (
          bans.data.map((u) => (
            <UserLine
              key={u.id}
              user={u}
              subtitle={`Удалён ${new Date(u.bannedAt).toLocaleDateString("ru-RU")}`}
              right={
                <Button variant="secondary" className={styles.small} onClick={() => void unban(u)}>
                  Вернуть
                </Button>
              }
            />
          ))
        ) : (
          <Empty>Удалённых пользователей нет</Empty>
        )}
      </div>
      <p className={styles.caption}>Удалённые пользователи не видят сообщество и не могут вернуться в него, пока вы их не разблокируете. Из самих чатов они не удаляются.</p>
      <Button variant="link" onClick={onClose}>
        Назад
      </Button>
    </Dialog>
  );
}

const kindWord = (type: string) => (type === "channel" ? "канал" : "группу");

/** Заявки на добавление чатов — openCommunityRequests. */
export function RequestsDialog({ community, onChanged, onClose }: Base) {
  const client = useQueryClient();
  const actions = useCommunityActions();
  const requests = useQuery({ queryKey: peopleKey(community.id, "requests"), queryFn: () => communityApi.requests(community.id).then((r) => r.requests), staleTime: 0 });
  const list = requests.data ?? [];
  const resolve = async (requestId: string, approve: boolean, confirmText?: string) => {
    if (confirmText && !(await askConfirm(confirmText, { okLabel: approve ? "Добавить" : "Отклонить", danger: !approve }))) return;
    try {
      const res = await communityApi.resolveRequest(community.id, requestId, approve);
      toast(approve ? (res.added > 1 ? `Добавлено чатов: ${res.added}` : "Чат добавлен в сообщество") : res.declined > 1 ? `Отклонено заявок: ${res.declined}` : "Заявка отклонена");
      void actions.refresh(community.id);
      onChanged();
      void client.invalidateQueries({ queryKey: peopleKey(community.id, "requests") });
    } catch (err) {
      toast(errorText(err, "Не удалось обработать заявку"), { error: true });
    }
  };
  return (
    <Dialog title="Заявки на добавление" onClose={onClose} className={styles.wide}>
      <p className={styles.caption}>Пока в сообществе включён режим «Только администраторы», чаты участников добавляются после одобрения.</p>
      {list.length > 1 ? (
        <div className={styles.buttons}>
          <Button className={styles.small} onClick={() => void resolve("all", true, `Добавить в сообщество все ${list.length} чатов из заявок?`)}>
            Добавить все
          </Button>
          <Button variant="secondary" className={styles.small} onClick={() => void resolve("all", false, `Отклонить все ${list.length} заявок?`)}>
            Отклонить все
          </Button>
        </div>
      ) : null}
      <div className={styles.list}>
        {requests.isError ? (
          <Empty>{errorText(requests.error, "Не удалось загрузить заявки")}</Empty>
        ) : !requests.data ? (
          <Empty>Загрузка…</Empty>
        ) : list.length ? (
          list.map((r) => (
            <div key={r.id} className={styles.request}>
              <ChatLine chat={r.chat} />
              <p className={styles.caption}>{`${r.suggestedBy?.name ?? "Кто-то"} предлагает ${kindWord(r.chat.type)}${r.visible ? "" : " (скрытый)"}`}</p>
              <div className={styles.buttons}>
                <Button className={styles.small} onClick={() => void resolve(r.id, true)}>
                  Добавить
                </Button>
                <Button variant="secondary" className={styles.small} onClick={() => void resolve(r.id, false)}>
                  Отклонить
                </Button>
              </div>
            </div>
          ))
        ) : (
          <Empty>Новых заявок нет</Empty>
        )}
      </div>
      <Button variant="link" onClick={onClose}>
        Назад
      </Button>
    </Dialog>
  );
}
