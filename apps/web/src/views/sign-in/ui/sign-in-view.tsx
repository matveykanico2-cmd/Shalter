import { useNavigate, useSearchParams } from "react-router";

import { SignInForm } from "@/features/sign-in";

import styles from "./sign-in-view.module.css";

export function SignInView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Сюда приводит сокет, закрытый сервером (public/js/lib/wsClient.js — так же).
  const notice = params.get("reason") === "revoked" ? "Сеанс на этом устройстве был завершён — войдите снова." : undefined;
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <SignInForm notice={notice} onSignedIn={() => navigate("/", { replace: true })} />
      </div>
    </div>
  );
}
