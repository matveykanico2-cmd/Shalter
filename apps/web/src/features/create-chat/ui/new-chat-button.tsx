import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";
import type { Contact } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { Icon, Menu, toast } from "@/shared/ui";

import { createChannel, createGroup, type NewChatFields } from "../api/create-chat";

import styles from "./create-chat.module.css";
import { CreateChatDialog } from "./create-chat-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { PickPeopleDialog } from "./pick-people-dialog";

type Step =
  | { kind: "menu"; at: { x: number; y: number } }
  | { kind: "dm" }
  | { kind: "members" }
  | { kind: "details"; chat: "group" | "channel"; people: Contact[]; adminIds: string[] }
  | { kind: "subscribers"; fields: Omit<NewChatFields, "memberIds" | "adminIds"> }
  | { kind: "invite"; chat: { id: string; type: string } }
  | null;

/**
 * Круглая кнопка «Новый чат» в списке — openNewChatMenu в public/js/views/chatList.js.
 * «Новое сообщество» — окно другого слайса (features/community-editor), его открывает список.
 */
export function NewChatButton({ me, onNewCommunity, onNewBot }: { me: SelfUser; onNewCommunity?: () => void; onNewBot?: () => void }) {
  const [step, setStep] = useState<Step>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const open = async (chatId: string) => {
    await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
    void navigate(`/chat/${chatId}`);
  };
  const startDm = async (u: { id: string; name: string; avatarColor?: string | null }) => {
    try {
      const { chat } = await openDm(u.id, u.name, u.avatarColor);
      setStep(null);
      await open(chat.id);
    } catch (err) {
      toast(errorText(err, "Не удалось открыть чат"), { error: true });
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        title="Новый чат"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setStep({ kind: "menu", at: { x: r.left, y: r.top - 8 } });
        }}
      >
        <Icon name="Edit" size={22} />
      </button>
      {step?.kind === "menu" ? (
        <Menu
          at={step.at}
          label="Новый чат"
          items={[
            { icon: "User", label: "Новый чат", onClick: () => setStep({ kind: "dm" }) },
            { icon: "Bookmark", label: "Себе (сохранённые)", onClick: () => void startDm({ id: me.id, name: "Себе", avatarColor: me.avatarColor }) },
            // Как в tweb: у группы сначала участники, у канала — сначала название, подписчиков можно пропустить.
            { icon: "Users", label: "Новая группа", onClick: () => setStep({ kind: "members" }) },
            { icon: "Send", label: "Новый канал", onClick: () => setStep({ kind: "details", chat: "channel", people: [], adminIds: [] }) },
            ...(onNewCommunity ? [{ icon: "Users" as const, label: "Новое сообщество", onClick: onNewCommunity }] : []),
            // «Новый бот» — окно features/my-bots, его тоже открывает список.
            ...(onNewBot ? [{ icon: "Code" as const, label: "Новый бот", onClick: onNewBot }] : []),
            { icon: "Search", label: "Публичные каналы", onClick: () => void navigate("/discover-channels") },
          ]}
          onClose={() => setStep((s) => (s?.kind === "menu" ? null : s))}
        />
      ) : null}
      {step?.kind === "dm" ? <PickPeopleDialog title="Новый чат" submitLabel="" single exclude={[me.id]} onPick={({ people }) => void startDm(people[0]!)} onClose={() => setStep(null)} /> : null}
      {step?.kind === "members" ? (
        <PickPeopleDialog
          title="Добавить участников"
          submitLabel="Далее"
          allowRoles
          exclude={[me.id]}
          onPick={({ people, adminIds }) => setStep({ kind: "details", chat: "group", people, adminIds })}
          onClose={() => setStep(null)}
        />
      ) : null}
      {step?.kind === "details" ? (
        <CreateChatDialog
          kind={step.chat}
          members={step.people}
          onClose={() => setStep(null)}
          onSubmit={async (fields) => {
            if (step.chat === "channel") return setStep({ kind: "subscribers", fields });
            const { chat } = await createGroup({ ...fields, memberIds: step.people.map((u) => u.id), adminIds: step.adminIds });
            setStep(fields.isPublic ? null : { kind: "invite", chat: { id: chat.id, type: chat.type } });
            await open(chat.id);
          }}
        />
      ) : null}
      {step?.kind === "subscribers" ? (
        <PickPeopleDialog
          title="Добавить подписчиков"
          submitLabel="Создать канал"
          allowRoles
          exclude={[me.id]}
          onPick={({ people, adminIds }) =>
            void (async () => {
              try {
                const { chat } = await createChannel({ ...step.fields, memberIds: people.map((u) => u.id), adminIds });
                setStep(step.fields.isPublic ? null : { kind: "invite", chat: { id: chat.id, type: chat.type } });
                await open(chat.id);
              } catch (err) {
                toast(errorText(err, "Не удалось создать канал"), { error: true });
              }
            })()
          }
          onClose={() => setStep(null)}
        />
      ) : null}
      {step?.kind === "invite" ? <InviteLinkDialog chat={step.chat} onClose={() => setStep(null)} /> : null}
    </>
  );
}
