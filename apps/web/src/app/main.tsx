import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installEmojiCopy } from "@/shared/lib/emoji-images";

import { App } from "./app";

const root = document.getElementById("root");
if (!root) throw new Error("Нет корневого узла #root");

installEmojiCopy();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
