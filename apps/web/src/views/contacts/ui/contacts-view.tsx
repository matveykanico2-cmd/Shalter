import { useCloseSidePanel } from "@/shared/lib/side-panel";
import { Icon } from "@/shared/ui";

/** Раздел «Контакты» — переносится в этапе 4, шаг 5. */
export function ContactsView() {
  const close = useCloseSidePanel();
  return (
    <section aria-label="Контакты">
      <button type="button" title="Назад" aria-label="Назад" onClick={close}>
        <Icon name="ChevronLeft" size={22} />
      </button>
      <h1>Контакты</h1>
    </section>
  );
}
