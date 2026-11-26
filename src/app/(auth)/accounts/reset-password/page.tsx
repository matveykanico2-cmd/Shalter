"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { AuthInput } from "@/components/auth-form";
import { Logo } from "@/components/nav";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(null); const token = new URLSearchParams(window.location.search).get("token") ?? ""; if (password !== confirm) { setError("Passwords do not match."); return; } try { await api("/api/auth/reset-password", { body: { token, password } }); setDone(true); } catch (e) { setError((e as Error).message); } };
  return <div className="w-full max-w-[350px]"><div className="border-separator px-10 pb-6 pt-10 sm:border"><h1 className="mb-8 text-center"><Logo className="text-[46px]" /></h1>{done ? <><h2 className="text-center text-lg font-semibold">Password updated</h2><p className="mt-3 text-center text-sm text-muted">You can now log in with your new password.</p></> : <form onSubmit={submit} className="flex flex-col gap-2"><h2 className="mb-3 text-center text-lg font-semibold">Choose a new password</h2><AuthInput label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" /><AuthInput label="Repeat password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" /><button disabled={password.length < 8} className="mt-2 rounded-lg bg-link py-2 text-sm font-semibold text-white disabled:opacity-60">Update password</button>{error && <p className="text-center text-sm text-danger">{error}</p>}</form>}</div><div className="mt-3 border-separator py-5 text-center sm:border"><Link href="/accounts/login" className="font-semibold text-link">Back to login</Link></div></div>;
}
