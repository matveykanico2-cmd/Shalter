import { createContext } from "react";

import type { KeyboardButton } from "../lib/keyboard";

import type { Message } from "./types";

/**
 * Что делают @имя и #тег в тексте сообщения и кнопки бота под ним — решает экран чата
 * (formatText: mention-link, hashtag-link; messageBubble: onKeyboardAction, onKeyboardApp).
 */
export type MessageLinkHandlers = {
  onMention?: (handle: string) => void;
  onHashtag?: (tag: string) => void;
  onKeyboard?: (message: Message, button: KeyboardButton) => void;
};

export const MessageLinks = createContext<MessageLinkHandlers>({});
