import { createElement, lazy, type ReactElement, Suspense, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { ProfileQrDialog } from "@/features/profile-qr";

import { type SelfUser, useSession } from "@/entities/session";

import { useCloseSidePanel } from "@/shared/lib/side-panel";
import { Icon, Menu, useSettingsSubpageState } from "@/shared/ui";

import { canSeeSection, SETTINGS_SECTIONS } from "../config/sections";
import { useOpenSupport } from "../model/use-open-support";

import { SettingsMenu } from "./settings-menu";
import styles from "./settings-view.module.css";

// Каждый раздел — свой чанк: React.lazy один раз на раздел, загрузка — при первом открытии.
const SECTION_ELEMENTS = new Map<string, ReactElement>(SETTINGS_SECTIONS.map((s) => [s.id, createElement(lazy(s.load))]));

/** /settings и /settings/:section — SettingsView в public/js/views/settings/index.js. */
export function SettingsView() {
  const me = useSession().data?.user;
  return me ? <Settings me={me} /> : null;
}

function Settings({ me }: { me: SelfUser }) {
  const { section: sectionId = "" } = useParams();
  const navigate = useNavigate();
  const closePanel = useCloseSidePanel();
  const subpage = useSettingsSubpageState();
  const openSupport = useOpenSupport();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const known = SETTINGS_SECTIONS.find((s) => s.id === sectionId);
  // Чужой раздел администрирования — обратно в меню.
  if (known && !canSeeSection(known, me)) return <Navigate to="/settings" replace />;
  const isMenu = !known;

  const back = () => {
    if (subpage) subpage.back();
    else if (isMenu) closePanel();
    else void navigate("/settings");
  };
  const title = subpage?.title ?? known?.label ?? "Настройки";
  const section = known ? SECTION_ELEMENTS.get(known.id) : undefined;

  return (
    <section className={styles.panel} aria-label="Настройки">
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} title="Назад" aria-label="Назад" onClick={back}>
          <Icon name="ChevronLeft" size={22} />
        </button>
        <h2 className={styles.title}>{title}</h2>
        {isMenu ? (
          <div className={styles.actions}>
            {me.username ? (
              <button type="button" className={styles.iconButton} title="QR-код профиля" aria-label="QR-код профиля" onClick={() => setQrOpen(true)}>
                <Icon name="Qrcode" size={19} />
              </button>
            ) : null}
            <button type="button" className={styles.iconButton} title="Изменить профиль" aria-label="Изменить профиль" onClick={() => void navigate("/settings/profile")}>
              <Icon name="Edit" size={19} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              title="Ещё"
              aria-label="Ещё"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenuAt({ x: r.left - 140, y: r.bottom + 6 });
              }}
            >
              <Icon name="More" size={19} />
            </button>
          </div>
        ) : null}
      </header>
      <div className={styles.content}>
        {section ? (
          <Suspense key={known?.id} fallback={<p className={styles.loading}>Загрузка…</p>}>
            {section}
          </Suspense>
        ) : (
          <SettingsMenu me={me} onSupport={openSupport} />
        )}
      </div>
      {menuAt ? (
        <Menu
          at={menuAt}
          label="Ещё"
          onClose={() => setMenuAt(null)}
          items={[
            { icon: "Edit", label: "Изменить профиль", onClick: () => void navigate("/settings/profile") },
            { icon: "Accounts", label: "Аккаунты и выход", onClick: () => void navigate("/settings/accounts") },
            { icon: "Info", label: "Поддержка — Hugo", onClick: openSupport },
          ]}
        />
      ) : null}
      {qrOpen ? <ProfileQrDialog user={me} onClose={() => setQrOpen(false)} /> : null}
    </section>
  );
}
