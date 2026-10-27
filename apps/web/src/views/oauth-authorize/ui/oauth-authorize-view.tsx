import type { appInfoBody, authorizeBody } from "@shalter/shared/schemas/oauth";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { z } from "zod";

import { AuthFrame, SignInForm } from "@/features/sign-in";

import { type SelfUser, useSession } from "@/entities/session";

import { http } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button } from "@/shared/ui";

import styles from "./confirm.module.css";

type Params = { clientId: string; redirectUri: string; state: string | null };

/**
 * «Войти через Shalter» — экран согласия /oauth/authorize (public/js/views/oauthAuthorize.js):
 * название приложения, чей аккаунт и что оно получит; без входа — форма входа прямо здесь.
 */
export function OAuthAuthorizeView() {
  const search = new URLSearchParams(window.location.search);
  const clientId = search.get("client_id");
  const redirectUri = search.get("redirect_uri");
  return (
    <AuthFrame>
      {clientId && redirectUri ? (
        <Consent params={{ clientId, redirectUri, state: search.get("state") }} />
      ) : (
        <Failure text="Ссылка неполная — не хватает client_id или redirect_uri." />
      )}
    </AuthFrame>
  );
}

function Failure({ text }: { text: string }) {
  return (
    <div className={styles.panel}>
      <p className={styles.error}>{text}</p>
      <a href="/" className={styles.link}>
        На главную
      </a>
    </div>
  );
}

function Consent({ params }: { params: Params }) {
  const session = useSession();
  // GET /api/oauth/app-info открыт и без входа: гостю тоже видно, куда он входит.
  const app = useQuery({
    queryKey: ["oauth", "app-info", params.clientId, params.redirectUri],
    queryFn: ({ signal }) =>
      http.get<z.infer<typeof appInfoBody>>(
        `/api/oauth/app-info?client_id=${encodeURIComponent(params.clientId)}&redirect_uri=${encodeURIComponent(params.redirectUri)}`,
        signal
      ),
    retry: false,
  });
  if (app.isError) return <Failure text={errorText(app.error, "Приложение не найдено")} />;
  if (app.isPending || session.isPending) return null;
  const user = session.data?.user;
  if (!user) {
    return (
      <div className={styles.panel}>
        <p className={styles.instructions}>{`Чтобы войти в «${app.data.name}» через Shalter, сначала войдите в свой аккаунт.`}</p>
        <div className={styles.embedded}>
          {/* Вошли — сессия перечитается, и здесь появится согласие. */}
          <SignInForm embedded onSignedIn={() => {}} />
        </div>
      </div>
    );
  }
  return <Approve params={params} appName={app.data.name} user={user} />;
}

function Approve({ params, appName, user }: { params: Params; appName: string; user: SelfUser }) {
  const approve = useMutation({
    mutationFn: async () => {
      const { redirectUrl } = await http.post<z.infer<typeof authorizeBody>>("/api/oauth/authorize", {
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        state: params.state,
      });
      // Только http(s): javascript:-адрес выполнился бы в origin Shalter.
      if (!/^https?:$/.test(new URL(redirectUrl).protocol)) throw new Error("Недопустимый redirect_uri");
      window.location.href = redirectUrl;
    },
  });
  return (
    <div className={styles.panel}>
      <p className={styles.title}>{`«${appName}» хочет войти через Shalter`}</p>
      <div className={styles.account}>
        <Avatar name={user.name} color={user.avatarColor} image={user.avatarImage} size={56} />
        <div>
          <p className={styles.name}>{user.name || "Без имени"}</p>
          <p className={styles.sub}>{user.username ? `@${user.username}` : ""}</p>
        </div>
      </div>
      <p className={styles.instructions}>
        Приложение получит только имя, юзернейм и фото профиля — ничего больше (ни переписку, ни телефон, ни звёзды).
      </p>
      {approve.isError && <p className={styles.error}>{errorText(approve.error, "Не удалось подтвердить вход")}</p>}
      {/* После успеха браузер уже уходит на redirect_uri — кнопка остаётся «Входим…». */}
      <Button className={styles.submit} disabled={approve.isPending || approve.isSuccess} onClick={() => approve.mutate()}>
        {approve.isPending || approve.isSuccess ? "Входим…" : "Разрешить"}
      </Button>
      <a href="/" className={styles.link}>
        Отмена
      </a>
    </div>
  );
}
