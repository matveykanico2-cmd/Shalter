/** Вложение-карточка игры для сообщения (gameAttachmentFor в games.js). */
export function gameAttachmentFor(g: { id: string; title: string; emoji?: string; description?: string }) {
  return { kind: "game" as const, meta: { gameId: g.id, title: g.title, emoji: g.emoji || "🎮", description: g.description || "" } };
}
