"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";

type Method = "phone" | "email";
type Step = "phone" | "code" | "profile" | "email";
type EmailMode = "login" | "register";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addMode = searchParams.get("add") === "1";

  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("phone");
  const [emailMode, setEmailMode] = useState<EmailMode>("login");

  const [phone, setPhone] = useState("+7 ");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addMode) return;
    api.session().then((r) => {
      if (r.user) router.replace("/");
    });
  }, [addMode, router]);

  function selectMethod(next: Method) {
    setMethod(next);
    setStep(next);
    setError(null);
  }

  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function goToApp() {
    router.push("/");
    router.refresh();
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.sendCode(phone);
      setStep("code");
      setResendIn(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  async function submitCode(value: string) {
    setError(null);
    setPending(true);
    try {
      const { user, isNew } = await api.verifyCode(phone, value);
      if (isNew) {
        setNewUserId(user.id);
        setStep("profile");
      } else {
        goToApp();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setCode("");
    } finally {
      setPending(false);
    }
  }

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserId || !name.trim()) return;
    setPending(true);
    try {
      await api.updateProfile(newUserId, { name: name.trim(), username: name.trim().toLowerCase().replace(/\s+/g, "_") });
      goToApp();
    } finally {
      setPending(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (emailMode === "register") {
        await api.registerEmail(name, email, password);
      } else {
        await api.loginEmail(email, password);
      }
      goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-accent flex items-center justify-center text-accent-contrast text-2xl font-serif font-semibold">
            М
          </div>
          <h1 className="font-serif text-2xl font-semibold text-text">
            {addMode ? "Добавить аккаунт" : "Вход в мессенджер"}
          </h1>
          <p className="text-sm text-muted mt-1">
            {step === "phone" && "Введите номер телефона"}
            {step === "code" && `Код отправлен на ${phone}`}
            {step === "profile" && "Расскажите немного о себе"}
            {step === "email" && (emailMode === "login" ? "Войдите по email и паролю" : "Создайте аккаунт по email")}
          </p>
        </div>

        {(step === "phone" || step === "email") && (
          <div className="mb-4 flex rounded-lg border border-border bg-surface-alt p-1">
            <button
              onClick={() => selectMethod("phone")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${method === "phone" ? "bg-surface text-text shadow-sm" : "text-muted"}`}
            >
              Телефон
            </button>
            <button
              onClick={() => selectMethod("email")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${method === "email" ? "bg-surface text-text shadow-sm" : "text-muted"}`}
            >
              Email
            </button>
          </div>
        )}

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          {step === "phone" && (
            <form onSubmit={submitPhone} className="flex flex-col gap-4">
              <input
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+7 900 000-00-00"
                className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                disabled={pending}
                className="w-full rounded-lg bg-accent text-accent-contrast py-3 font-medium disabled:opacity-60"
              >
                {pending ? "Отправка…" : "Продолжить"}
              </button>
            </form>
          )}

          {step === "code" && (
            <div className="flex flex-col gap-4">
              <input
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setCode(v);
                  if (v.length === 5) submitCode(v);
                }}
                inputMode="numeric"
                placeholder="•••••"
                className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-center text-2xl tracking-[0.5em] tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-xs text-muted text-center font-mono">демо-код: 00000</p>
              {error && <p className="text-sm text-danger text-center">{error}</p>}
              <button
                type="button"
                disabled={resendIn > 0}
                onClick={() => setResendIn(30)}
                className="text-sm text-accent disabled:text-muted text-center"
              >
                {resendIn > 0 ? `Отправить код повторно через ${resendIn}с` : "Отправить код повторно"}
              </button>
              <button type="button" onClick={() => setStep("phone")} className="text-sm text-muted text-center">
                Изменить номер
              </button>
            </div>
          )}

          {step === "email" && (
            <form onSubmit={submitEmail} className="flex flex-col gap-4">
              {emailMode === "register" && (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              )}
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Пароль"
                autoComplete={emailMode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {emailMode === "register" && (
                <p className="text-xs text-muted -mt-2">Не короче 6 символов. Пароль хранится только в виде хеша.</p>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                disabled={pending}
                className="w-full rounded-lg bg-accent text-accent-contrast py-3 font-medium disabled:opacity-60"
              >
                {pending ? "Проверка…" : emailMode === "login" ? "Войти" : "Зарегистрироваться"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailMode((m) => (m === "login" ? "register" : "login"));
                  setError(null);
                }}
                className="text-sm text-accent text-center"
              >
                {emailMode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
              </button>
            </form>
          )}

          {step === "profile" && (
            <form onSubmit={submitProfile} className="flex flex-col gap-4">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя"
                className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                disabled={pending || !name.trim()}
                className="w-full rounded-lg bg-accent text-accent-contrast py-3 font-medium disabled:opacity-60"
              >
                Готово
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
