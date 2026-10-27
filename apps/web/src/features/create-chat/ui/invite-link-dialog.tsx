import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Button, Dialog } from "@/shared/ui";

import { inviteLink } from "../api/create-chat";

import styles from "./create-chat.module.css";

/** Частный чат создан — его пригласительная ссылка (inviteLinkDialog.js). */
export function InviteLinkDialog({ chat, onClose }: { chat: { id: string; type: string }; onClose: () => void }) {
  const link = useQuery({ queryKey: ["invite", chat.id], queryFn: () => inviteLink(chat.id), staleTime: Infinity, retry: false });
  const [note, setNote] = useState("");
  const url = link.data ? publicUrl(`/join/${link.data.code}`) : "";
  const channel = chat.type === "channel";
  return (
    <Dialog title={channel ? "Канал создан" : "Группа создана"} onClose={onClose}>
      <p className={styles.hint}>Это частный чат — вступить можно только по ссылке. Отправьте её тем, кого зовёте; отозвать её можно в настройках чата.</p>
      <input className={`${styles.search} ${styles.mono}`} readOnly aria-label="Пригласительная ссылка" value={link.isPending ? "Получаем ссылку…" : url} />
      {link.isError ? <p className={styles.hint}>{errorText(link.error, "Не удалось создать ссылку — её можно получить в настройках чата")}</p> : null}
      {note ? <p className={styles.hint}>{note}</p> : null}
      <Button
        disabled={!url}
        onClick={() =>
          void navigator.clipboard?.writeText(url).then(
            () => setNote("Ссылка скопирована ✓"),
            () => setNote("Скопируйте ссылку вручную — буфер обмена недоступен")
          )
        }
      >
        Скопировать ссылку
      </Button>
      <Button variant="link" onClick={onClose}>
        Готово
      </Button>
    </Dialog>
  );
}
