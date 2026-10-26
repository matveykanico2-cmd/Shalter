// Иконки — те же контуры, что в public/js/icons.js (24×24, обводка currentColor).
const PATHS = {
  Accounts: '<circle cx="9" cy="9" r="5"/><path d="M15 6a5 5 0 0 1 0 9.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>',
  Archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/>',
  At: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1"/>',
  BarChart: '<path d="M6 20V10"/><path d="M12 20V4"/><path d="M18 20v-7"/>',
  Bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>',
  BellOff: '<path d="M6 9a6 6 0 0 1 9.9-4.5M18 9c0 4 1.5 5.5 1.5 5.5H8"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/><path d="M3 3l18 18"/>',
  Bookmark: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15.5L12 16.5l-6.5 4V5a1 1 0 0 1 1-1Z"/>',
  Camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.5"/>',
  Check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  CheckCheck: '<path d="M2 12.5l4.5 4.5L16 7"/><path d="M8 12.5l4.5 4.5L22 7"/>',
  ChevronDown: '<path d="M5 9l7 7 7-7"/>',
  ChevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  ChevronRight: '<path d="M9 5l7 7-7 7"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  Code: '<path d="M9 8 4 12l5 4"/><path d="M15 8l5 4-5 4"/>',
  Copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  Crown: '<path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8Z"/><path d="M5 21h14"/>',
  Download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  Edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
  Eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  EyeOff:
    '<path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5"/><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  File: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  Filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8Z"/>',
  FlipCamera: '<path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5"/><path d="M20 5v3.5h-3.5"/><path d="M20 12a8 8 0 0 1-13.6 5.7L4 15.5"/><path d="M4 19v-3.5h3.5"/><circle cx="12" cy="12" r="2.3"/>',
  Folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  Forward: '<path d="M15 8l5 4-5 4"/><path d="M20 12H11a6 6 0 0 0-6 6v1"/>',
  Gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 9h16v4H4z"/><path d="M12 9v11"/><path d="M12 9C10.5 9 8 8 8 5.8A2.2 2.2 0 0 1 12 4.5"/><path d="M12 9c1.5 0 4-1 4-3.2A2.2 2.2 0 0 0 12 4.5"/>',
  Globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/>',
  Image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  Info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  Link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  Lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  LogOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  MapPin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  MessageSquare: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  Mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  Monitor: '<rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M12 16v4"/><path d="M8.5 20h7"/>',
  MoreVertical: '<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
  More: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  Paperclip: '<path d="M20 12.5 11.5 21a4.5 4.5 0 0 1-6.4-6.4L13.6 6a3 3 0 0 1 4.3 4.2L9.4 18.7a1.5 1.5 0 0 1-2.1-2.1l7.8-7.9"/>',
  PauseFill:
    '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  Phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z"/>',
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Pin: '<path d="M9 4h6"/><path d="M10 4l-.7 6.2L6 13h12l-3.3-2.8L14 4"/><path d="M12 13v7"/>',
  Play: '<path d="M7 5l12 7-12 7V5Z"/>',
  PlayFill: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/>',
  Reply: '<path d="M9 8 4 12l5 4"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
  RotateCw: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
  Search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  Send: '<path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20Z"/>',
  Shield: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5Z"/>',
  Smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10.5h.01M15.5 10.5h.01"/><path d="M8.5 16.5s1.2-2 3.5-2 3.5 2 3.5 2"/>',
  Star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z"/>',
  Sticker:
    '<path d="M4 6a2 2 0 0 1 2-2h8l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v4a2 2 0 0 0 2 2h4"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M8.5 16.5a4 4 0 0 0 6 0"/>',
  Trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  User: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  Users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.2 3.2 0 0 1 0 6.3"/><path d="M15.5 14.2a6.5 6.5 0 0 1 6 5.8"/>',
  Verified:
    '<path d="M12 2.5l2.2 1.7 2.7-.3 1 2.6 2.4 1.3-.6 2.7.6 2.7-2.4 1.3-1 2.6-2.7-.3L12 21.5l-2.2-1.7-2.7.3-1-2.6L3.7 16l.6-2.7-.6-2.7 2.4-1.3 1-2.6 2.7.3Z" fill="currentColor" stroke="none"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="var(--color-surface)" stroke-width="2"/>',
  Video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M21 8.5l-5 3 5 3v-6Z"/>',
  Volume: '<path d="M4 9.5h3.4L12 5.5v13L7.4 14.5H4z"/><path d="M15.8 9.2a4 4 0 0 1 0 5.6"/><path d="M18.6 6.4a8 8 0 0 1 0 11.2"/>',
  VolumeOff: '<path d="M4 9.5h3.4L12 5.5v13L7.4 14.5H4z"/><path d="M16 10l4.5 4.5"/><path d="M20.5 10L16 14.5"/>',
  X: '<path d="M6 6l12 12M18 6L6 18"/>',
  Zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
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
