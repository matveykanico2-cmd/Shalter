"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "@/components/nav";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  useEffect(() => { const token = new URLSearchParams(window.location.search).get("token") ?? ""; api("/api/auth/verify-email", { body: { token } }).then(() => setState("done")).catch(() => setState("error")); }, []);
  return <div className="w-full max-w-[390px]"><div className="border-separator px-8 py-10 text-center sm:border"><Logo className="mb-8 justify-center text-[46px]" />{state === "loading" && <p className="text-muted">Verifying your email…</p>}{state === "done" && <><h1 className="text-xl font-bold">Email verified</h1><p className="mt-3 text-sm text-muted">Your shalter account is now verified.</p></>}{state === "error" && <><h1 className="text-xl font-bold">Link expired</h1><p className="mt-3 text-sm text-muted">Request a new verification email from your account settings.</p></>}</div><div className="mt-3 border-separator py-5 text-center sm:border"><Link href="/accounts/login" className="font-semibold text-link">Back to login</Link></div></div>;
}
