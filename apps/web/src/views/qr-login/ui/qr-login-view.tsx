import { useMutation } from "@tanstack/react-query";

import { AuthFrame, SignInForm } from "@/features/sign-in";

import { type SelfUser, useSession } from "@/entities/session";

import { http } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button } from "@/shared/ui";

import styles from "./confirm.module.css";

/**
 * /qr-login?token=… — телефон подтверждает вход по QR-коду с другого устройства
 * (public/js/views/qrLoginConfirm.js). Без входа — сначала форма входа прямо здесь.
 */
export function QrLoginView() {
  const token = new URLSearchParams(window.location.search).get("token");
  const session = useSession();
  return <AuthFrame>{token ? session.isPending ? null : <Content token={token} user={session.data?.user ?? null} /> : <BadLink />}</AuthFrame>;
}

function BadLink() {
  return (
    <div className={styles.panel}>
      <p className={styles.error}>Ссылка неполная или повреждена — токен не найден.</p>
      <a href="/login" className={styles.link}>
        Перейти ко входу
      </a>
    </div>
  );
}

function Content({ token, user }: { token: string; user: SelfUser | null }) {
  if (!user) {
    return (
      <div className={styles.panel}>
        <p className={styles.instructions}>Чтобы подтвердить вход на другом устройстве, сначала войдите в свой аккаунт.</p>
        <div className={styles.embedded}>
          {/* Вошли — сессия перечитается, и здесь появится подтверждение. */}
          <SignInForm embedded onSignedIn={() => {}} />
        </div>
      </div>
    );
  }
  return <Confirm token={token} user={user} />;
}

function Confirm({ token, user }: { token: string; user: SelfUser }) {
  const confirm = useMutation({ mutationFn: () => http.post<{ ok: true }>("/api/auth/qr/confirm", { token }) });
  if (confirm.isSuccess) {
    return (
      <div className={styles.panel}>
        <p className={styles.title}>Готово ✓</p>
        <p className={styles.instructions}>Вход подтверждён — вернитесь к другому устройству, оно уже открыло Shalter.</p>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <p className={styles.title}>Подтвердить вход в Shalter?</p>
      <div className={styles.account}>
        <Avatar name={user.name} color={user.avatarColor} image={user.avatarImage} size={56} />
        <div>
          <p className={styles.name}>{user.name || "Без имени"}</p>
          <p className={styles.sub}>{user.phone || user.email}</p>
        </div>
      </div>
      <p className={styles.instructions}>Этот код запросило другое устройство. Подтверждайте, только если вход инициировали вы сами.</p>
      {confirm.isError && <p className={styles.error}>{errorText(confirm.error)}</p>}
      <Button className={styles.submit} disabled={confirm.isPending} onClick={() => confirm.mutate()}>
        {confirm.isPending ? "Подтверждаем…" : "Подтвердить вход"}
      </Button>
      <a href="/" className={styles.link}>
        Отмена
      </a>
    </div>
  );
}
