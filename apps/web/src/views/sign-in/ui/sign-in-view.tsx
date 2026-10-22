import { useNavigate } from "react-router";

import { SignInForm } from "@/features/sign-in";

import styles from "./sign-in-view.module.css";

export function SignInView() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <SignInForm onSignedIn={() => navigate("/", { replace: true })} />
      </div>
    </div>
  );
}
