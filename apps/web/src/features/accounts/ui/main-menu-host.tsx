import type { SelfUser } from "@/entities/session";
import { openUserProfile } from "@/entities/user";

import { Menu, type MenuItem } from "@/shared/ui";

import { closeMainMenu, useMainMenuAt } from "../model/main-menu-store";
import { useMainMenu } from "../model/use-main-menu";

type Props = {
  me: SelfUser;
  /** Пункты разделов со своим окном (игры, загрузки) — их подключает оболочка. */
  extra?: readonly MenuItem[];
};

/** Главное меню (openSidebarMenu в public/js/components/sidebarMenu.js), открытое через openMainMenu. */
export function MainMenuHost({ me, extra }: Props) {
  const at = useMainMenuAt();
  const items = useMainMenu({ me, onOpenProfile: () => openUserProfile(me.id), extra });
  return at ? <Menu at={at} items={items} label="Меню" onClose={closeMainMenu} /> : null;
}
