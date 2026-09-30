import { openChoiceDialog } from "../components/confirmDialog.js";

// Telegram's own set of durations — "тихо на час" is the common case, and a
// permanent switch is a chore you have to remember to undo. Shared by the
// chat list's "…" menu and an open chat's header menu (chatView.js) so a
// group, channel, bot or person can all be silenced from either place with
// the same choices, on top of api.muteChat's generic {hours} support.
export const MUTE_DURATIONS = [
  { label: "На 1 час", hours: 1 },
  { label: "На 8 часов", hours: 8 },
  { label: "На 16 часов", hours: 16 },
  { label: "На 24 часа", hours: 24 },
  { label: "На неделю", hours: 24 * 7 },
  { label: "На месяц", hours: 24 * 30 },
];

// onPick receives the same {hours}/{forever} shape api.muteChat expects.
export function openMuteDurationDialog(onPick) {
  openChoiceDialog("Отключить уведомления", [
    ...MUTE_DURATIONS.map((d) => ({ label: d.label, onClick: () => onPick({ hours: d.hours }) })),
    { label: "Навсегда", onClick: () => onPick({ forever: true }) },
  ]);
}
