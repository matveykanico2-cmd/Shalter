import { useCloseSidePanel } from "@/shared/lib/side-panel";
import { Icon } from "@/shared/ui";

/** Раздел «Архив» — переносится в этапе 4, шаг 5. */
export function ArchiveView() {
  const close = useCloseSidePanel();
  return (
    <section aria-label="Архив">
      <button type="button" title="Назад" aria-label="Назад" onClick={close}>
        <Icon name="ChevronLeft" size={22} />
      </button>
      <h1>Архив</h1>
    </section>
  );
}
