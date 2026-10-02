import { getState } from "../state.js";

export function isServerModerator() {
  const me = getState().user;
  return !!me && (!!me.isDeveloper || (me.adminSections ?? []).includes("moderation"));
}
