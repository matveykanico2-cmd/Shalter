import { Icon } from "@/components/icons";

export default function EmptyChatPage() {
  return (
    <div className="hidden h-full w-full flex-col items-center justify-center gap-3 text-center md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-alt text-muted">
        <Icon.Send size={28} />
      </div>
      <p className="font-serif text-lg text-text">Выберите чат</p>
      <p className="max-w-xs text-sm text-muted">
        Или начните новый — найдите человека во вкладке «Контакты» и нажмите «Написать».
      </p>
    </div>
  );
}
