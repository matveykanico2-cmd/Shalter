import { Button } from "./button";
import { Dialog } from "./dialog";

export type Choice = { label: string; danger?: boolean; onClick: () => void };

type Props = { title: string; choices: readonly Choice[]; onClose: () => void };

/** Окно выбора из нескольких вариантов — как openChoiceDialog в public/js/components/confirmDialog.js. */
export function ChoiceDialog({ title, choices, onClose }: Props) {
  return (
    <Dialog title={title} onClose={onClose}>
      {choices.map((c) => (
        <Button
          key={c.label}
          variant={c.danger ? "danger" : "secondary"}
          onClick={() => {
            onClose();
            c.onClick();
          }}
        >
          {c.label}
        </Button>
      ))}
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
