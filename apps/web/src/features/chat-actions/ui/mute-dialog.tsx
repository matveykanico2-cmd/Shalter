import { ChoiceDialog } from "@/shared/ui";

import type { MuteOptions } from "../api/chat-actions";
import { MUTE_DURATIONS } from "../lib/mute";

/** «Отключить уведомления» — срок, как openMuteDurationDialog (public/js/lib/muteDurations.js). */
export function MuteDialog({ onMute, onClose }: { onMute: (opts: MuteOptions) => void; onClose: () => void }) {
  return (
    <ChoiceDialog
      title="Отключить уведомления"
      choices={[...MUTE_DURATIONS.map((d) => ({ label: d.label, onClick: () => onMute({ hours: d.hours }) })), { label: "Навсегда", onClick: () => onMute({ forever: true }) }]}
      onClose={onClose}
    />
  );
}
