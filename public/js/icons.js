// Vanilla-JS port of components/icons.tsx: same paths, plain SVG markup strings.
const PATHS = {
  Search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  Pin: '<path d="M12 2l1.5 5.5L19 9l-4.5 3 1 6-3.5-3-3.5 3 1-6L5 9l5.5-1.5z"/>',
  Bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>',
  BellOff:
    '<path d="M6 9a6 6 0 0 1 9.9-4.5M18 9c0 4 1.5 5.5 1.5 5.5H8"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/><path d="M3 3l18 18"/>',
  Archive:
    '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/>',
  Settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  Users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.2 3.2 0 0 1 0 6.3"/><path d="M15.5 14.2a6.5 6.5 0 0 1 6 5.8"/>',
  Phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z"/>',
  Video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M21 8.5l-5 3 5 3v-6Z"/>',
  Send: '<path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20Z"/>',
  Paperclip:
    '<path d="M20 12.5 11.5 21a4.5 4.5 0 0 1-6.4-6.4L13.6 6a3 3 0 0 1 4.3 4.2L9.4 18.7a1.5 1.5 0 0 1-2.1-2.1l7.8-7.9"/>',
  Smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10.5h.01M15.5 10.5h.01"/><path d="M8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2"/>',
  Mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  Check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  CheckCheck: '<path d="M2 12.5l4.5 4.5L16 7"/><path d="M8 12.5l4.5 4.5L22 7"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  Lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  Reply: '<path d="M9 8 4 12l5 4"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
  Forward: '<path d="M15 8l5 4-5 4"/><path d="M20 12H11a6 6 0 0 0-6 6v1"/>',
  Edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
  Trash:
    '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  More: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  ChevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  X: '<path d="M6 6l12 12M18 6L6 18"/>',
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  Play: '<path d="M7 5l12 7-12 7V5Z"/>',
  Download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  Accounts: '<circle cx="9" cy="9" r="5"/><path d="M15 6a5 5 0 0 1 0 9.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>',
  FlipCamera:
    '<path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5"/><path d="M20 5v3.5h-3.5"/><path d="M20 12a8 8 0 0 1-13.6 5.7L4 15.5"/><path d="M4 19v-3.5h3.5"/><circle cx="12" cy="12" r="2.3"/>',
  LogOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  Crown:
    '<path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8Z"/><path d="M5 21h14"/>',
  Gift:
    '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 9h16v4H4z"/><path d="M12 9v11"/><path d="M12 9C10.5 9 8 8 8 5.8A2.2 2.2 0 0 1 12 4.5"/><path d="M12 9c1.5 0 4-1 4-3.2A2.2 2.2 0 0 0 12 4.5"/>',
  Copy:
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  Qrcode:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1v1h-1z"/><path d="M14 20h1v1h-1z"/><path d="M17 17h1v1h-1z"/><path d="M20 20h1v1h-1z"/>',
  Globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/>',
  Code:
    '<path d="M9 8 4 12l5 4"/><path d="M15 8l5 4-5 4"/>',
  Star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z"/>',
  Zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  Shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
  Sticker:
    '<path d="M4 6a2 2 0 0 1 2-2h8l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M14 4v4a2 2 0 0 0 2 2h4"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M8.5 16.5a4 4 0 0 0 6 0"/>',
};

export function iconSvg(name, size = 20, extraClass = "") {
  const inner = PATHS[name] ?? "";
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
