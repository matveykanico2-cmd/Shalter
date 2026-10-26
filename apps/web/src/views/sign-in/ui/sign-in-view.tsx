import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { AuthFrame, SignInForm, type SignInMode } from "@/features/sign-in";

/** /login; /login?add=1 — ещё один аккаунт на этом устройстве, с «назад» в приложение. */
export function SignInView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<SignInMode>("login");
  const addMode = params.get("add") === "1";
  // Сюда приводит сокет, закрытый сервером (public/js/lib/wsClient.js — так же).
  const notice = params.get("reason") === "revoked" ? "Сеанс на этом устройстве был завершён — войдите снова." : undefined;
  return (
    <AuthFrame
      title={addMode ? "Добавить аккаунт" : "Shalter"}
      subtitle={mode === "login" ? "Рады видеть вас снова" : "Быстро, красиво и по-настоящему безопасно"}
      onBack={addMode ? () => window.location.assign("/") : undefined}
    >
      <SignInForm
        notice={notice}
        onModeChange={setMode}
        // Добавленный аккаунт — полная перезагрузка: кэш прежнего не должен в нём остаться.
        onSignedIn={() => (addMode ? window.location.assign("/") : void navigate("/", { replace: true }))}
      />
    </AuthFrame>
  );
}
