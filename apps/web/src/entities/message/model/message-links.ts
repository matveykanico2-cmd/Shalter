import { createContext } from "react";

/** Что делают @имя и #тег в тексте сообщения — решает экран чата (formatText: mention-link, hashtag-link). */
export type MessageLinkHandlers = { onMention?: (handle: string) => void; onHashtag?: (tag: string) => void };

export const MessageLinks = createContext<MessageLinkHandlers>({});
