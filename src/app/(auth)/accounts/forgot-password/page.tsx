"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { AuthInput } from "@/components/auth-form";
import { Logo } from "@/components/nav";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitIdentity = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(null); try { const result = await api<{ resetToken: string }>("/api/auth/forgot-password", { body: { email, phone } }); setToken(result.resetToken); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const submitPassword = async (e: React.FormEvent) => { e.preventDefault(); if (password !== confirm) { setError("Passwords do not match."); return; } setBusy(true); setError(null); try { await api("/api/auth/reset-password", { method: "POST", body: { token, password } }); setDone(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="w-full max-w-[350px]"><div className="border-separator px-10 pb-6 pt-10 sm:border"><h1 className="mb-8 text-center"><Logo className="text-[46px]" /></h1>{done ? <><h2 className="text-center text-lg font-semibold">Password updated</h2><p className="mt-3 text-center text-sm text-muted">You can now sign in with your new password.</p></> : !token ? <><h2 className="mb-2 text-center text-lg font-semibold">Reset password</h2><p className="mb-5 text-center text-sm text-muted">Enter the email and phone number saved on your account.</p><form onSubmit={submitIdentity}><AuthInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" /><AuthInput label="Phone number" value={phone} onChange={setPhone} autoComplete="tel" /><button disabled={!email || !phone || busy} className="mt-3 w-full rounded-lg bg-link py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Checking…" : "Continue"}</button>{error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}</form></> : <><h2 className="mb-2 text-center text-lg font-semibold">Choose a new password</h2><form onSubmit={submitPassword}><AuthInput label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" /><AuthInput label="Repeat password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" /><button disabled={password.length < 8 || busy} className="mt-3 w-full rounded-lg bg-link py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Updating…" : "Update password"}</button>{error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}</form></>}</div><div className="mt-3 border-separator py-5 text-center sm:border"><Link href="/accounts/login" className="font-semibold text-link">Back to login</Link></div></div>;
}
