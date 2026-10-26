// Движок анимаций старого клиента: сцены, персонажи, рисунки, Lottie, свои эмодзи.
// Функции строят DOM-узлы; в React их ставит shared/ui/DomNode.
import "./anim.css";

export { renderScene, SCENES } from "./anim-scenes";
export { emojiCode, hasAnimatedEmoji, renderAnimatedEmoji, showReactionBurst } from "./animated-emoji";
export { type AnimatorEditor, createAnimatorEditor } from "./animator-editor";
export {
  blankScene,
  CE_ANIMS,
  CE_MAX_KEYS,
  CE_MAX_LAYERS,
  CE_SHAPES,
  type CustomScene,
  renderCustomScene,
  sampleLayerAt,
  sanitizeCustomScene,
  type Layer as SceneLayer,
  sceneSummaryEmoji,
} from "./custom-scene";
export { emojiArtName, lottieNameFor, type LottieOptions, renderEmojiArt, renderLottie } from "./lottie";
export { DRAWN_STICKERS, getSticker, renderSticker, type Sticker, STICKERS } from "./stickers";
