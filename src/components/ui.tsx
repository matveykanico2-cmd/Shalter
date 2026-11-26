"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import type { UserLite } from "@/lib/types";

export function Avatar({
  src,
  size = 32,
  ring,
  className = "",
}: {
  src: string | null | undefined;
  size?: number;
  /** "unseen" = colorful story ring, "seen" = gray ring */
  ring?: "unseen" | "seen" | null;
  className?: string;
}) {
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />
  ) : (
    <DefaultAvatar />
  );
  if (!ring) {
    return (
      <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
        {img}
        <span className="pointer-events-none absolute inset-0 rounded-full border border-black/10 dark:border-white/10" />
      </span>
    );
  }
  const pad = size > 60 ? 3 : 2;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${ring === "unseen" ? "story-ring" : "bg-border"} ${className}`}
      style={{ width: size + pad * 2 + 2, height: size + pad * 2 + 2, padding: pad }}
    >
      <span className="block h-full w-full overflow-hidden rounded-full border-2 border-bg bg-bg">{img}</span>
    </span>
  );
}

function DefaultAvatar() {
  return (
    <svg viewBox="0 0 150 150" className="h-full w-full rounded-full" role="img" aria-label="Default avatar">
      <defs>
        <linearGradient id="shalter-avatar-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="150" height="150" rx="75" fill="url(#shalter-avatar-gradient)" />
      <circle cx="118" cy="30" r="34" fill="#fff" opacity="0.13" />
      <circle cx="32" cy="132" r="48" fill="#111827" opacity="0.12" />
      <path d="M43 80c13 12 51 12 64 0" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <path d="M51 60c8-12 20-17 31-17 12 0 23 5 31 17" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" opacity="0.92" />
    </svg>
  );
}

export function Verified({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="ml-1 inline-block shrink-0 align-[-1px]" aria-label="Verified">
      <path
        fill="#0095f6"
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z"
      />
    </svg>
  );
}

export function UserName({ user, className = "" }: { user: Pick<UserLite, "username" | "verified">; className?: string }) {
  return (
    <Link href={`/${user.username}`} className={`inline-flex items-center font-semibold hover:opacity-60 ${className}`}>
      <span className="truncate">{user.username}</span>
      {user.verified && <Verified />}
    </Link>
  );
}

export function Spinner({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ animation: "spin 0.8s steps(8) infinite" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="46"
          y="8"
          width="8"
          height="24"
          rx="4"
          fill="currentColor"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 50 50)`}
          className="text-muted"
        />
      ))}
    </svg>
  );
}

export function Modal({
  onClose,
  children,
  className = "",
  showClose = true,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showClose?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {showClose && (
        <button type="button" onClick={onClose} className="absolute right-3 top-3 p-2 text-white" aria-label="Close">
          <X size={28} />
        </button>
      )}
      <div className={`animate-modal overflow-hidden rounded-xl bg-elevated ${className}`}>{children}</div>
    </div>
  );
}

/** Instagram-style stacked option menu (e.g. the "..." menu on posts). */
export function OptionsMenu({
  options,
  onClose,
}: {
  options: { label: string; onClick: () => void; danger?: boolean; bold?: boolean }[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} showClose={false} className="w-[400px] max-w-full">
      <div className="flex flex-col">
        {[...options, { label: "Cancel", onClick: onClose }].map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={o.onClick}
            className={`min-h-12 px-2 py-1 text-sm active:bg-hover ${i > 0 ? "border-t border-border" : ""} ${
              "danger" in o && o.danger ? "font-bold text-danger" : "bold" in o && o.bold ? "font-bold" : ""
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function PrimaryButton({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-link px-4 py-[7px] text-sm font-semibold text-white hover:bg-link-hover disabled:opacity-70 ${className}`}
    />
  );
}

export function SecondaryButton({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-secondary px-4 py-[7px] text-sm font-semibold text-fg hover:bg-secondary-hover disabled:opacity-70 ${className}`}
    />
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="animate-fade fixed bottom-16 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-[#262626] px-4 py-3 text-sm text-white shadow-lg md:bottom-6">
      {message}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="px-10 py-10 text-center">
      <h2 className="mb-4 text-2xl font-semibold">Sorry, this page isn&apos;t available.</h2>
      <p className="text-base">
        The link you followed may be broken, or the page may have been removed.{" "}
        <Link href="/" className="text-link-text">
          Go back to shalter.
        </Link>
      </p>
    </div>
  );
}
