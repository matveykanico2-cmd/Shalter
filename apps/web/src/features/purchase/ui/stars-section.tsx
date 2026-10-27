import { SettingsPage } from "@/shared/ui";

import { StarsPanel } from "./stars-panel";

/** «Настройки → Звёзды» (renderStars) — то же, что окно звёзд. */
export function StarsSection() {
  return (
    <SettingsPage>
      <StarsPanel />
    </SettingsPage>
  );
}
