"use client";

import Link from "next/link";
import { useState } from "react";
import { api, BASE_PATH } from "@/lib/client";
import { AuthInput, Divider } from "@/components/auth-form";
import { Logo } from "@/components/nav";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { login, password } });
      window.location.replace(`${BASE_PATH}/`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[350px]">
      <div className="mb-2.5 border-separator px-10 pb-6 pt-10 sm:border">
        <h1 className="mb-8 mt-2 text-center">
          <Logo className="text-[46px]" />
        </h1>
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <AuthInput label="Phone number, username, or email" value={login} onChange={setLogin} autoComplete="username" />
          <AuthInput label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button
            disabled={!login || password.length < 6 || busy}
            className="mt-2.5 rounded-lg bg-link py-[7px] text-sm font-semibold text-white hover:bg-link-hover disabled:opacity-70"
          >
            {busy ? "Logging in..." : "Log in"}
          </button>
        </form>
        <Divider />
        {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
        <Link href="/accounts/forgot-password" className="mt-4 block text-center text-xs text-link-text">Forgot password?</Link>
      </div>
      <div className="border-separator py-5 text-center sm:border">
        Don&apos;t have an account?{" "}
        <Link href="/accounts/emailsignup" className="font-semibold text-link">
          Sign up
        </Link>
      </div>
    </div>
  );
}
