// Иконки — те же контуры, что в public/js/icons.js (24×24, обводка currentColor).
const PATHS = {
  Archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/>',
  BellOff: '<path d="M6 9a6 6 0 0 1 9.9-4.5M18 9c0 4 1.5 5.5 1.5 5.5H8"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/><path d="M3 3l18 18"/>',
  Bookmark: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15.5L12 16.5l-6.5 4V5a1 1 0 0 1 1-1Z"/>',
  Check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  CheckCheck: '<path d="M2 12.5l4.5 4.5L16 7"/><path d="M8 12.5l4.5 4.5L22 7"/>',
  ChevronDown: '<path d="M5 9l7 7 7-7"/>',
  ChevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  Edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
  Filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8Z"/>',
  Forward: '<path d="M15 8l5 4-5 4"/><path d="M20 12H11a6 6 0 0 0-6 6v1"/>',
  Lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  Phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z"/>',
  Pin: '<path d="M9 4h6"/><path d="M10 4l-.7 6.2L6 13h12l-3.3-2.8L14 4"/><path d="M12 13v7"/>',
  Reply: '<path d="M9 8 4 12l5 4"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
  Send: '<path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20Z"/>',
  Verified:
    '<path d="M12 2.5l2.2 1.7 2.7-.3 1 2.6 2.4 1.3-.6 2.7.6 2.7-2.4 1.3-1 2.6-2.7-.3L12 21.5l-2.2-1.7-2.7.3-1-2.6L3.7 16l.6-2.7-.6-2.7 2.4-1.3 1-2.6 2.7.3Z" fill="currentColor" stroke="none"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="var(--color-surface)" stroke-width="2"/>',
  Video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M21 8.5l-5 3 5 3v-6Z"/>',
  X: '<path d="M6 6l12 12M18 6L6 18"/>',
} as const;

export type IconName = keyof typeof PATHS;

type Props = { name: IconName; size?: number; className?: string };

export function Icon({ name, size = 20, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // Контуры — постоянные строки из PATHS, не данные пользователя.
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
