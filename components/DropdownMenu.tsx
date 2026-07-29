"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuPos {
  x: number;
  y: number;
}

export function DropdownMenu({
  pos,
  onClose,
  children,
}: {
  pos: MenuPos;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(pos.x, vw - 220);
  const top = Math.min(pos.y, vh - 200);

  return createPortal(
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-lg"
    >
      {children}
    </div>,
    document.body
  );
}

export function MenuItem({
  onClick,
  danger,
  icon,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-alt ${
        danger ? "text-danger" : "text-text"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
