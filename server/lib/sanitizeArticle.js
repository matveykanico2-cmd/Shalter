function sanitizeArticle(input) {
  if (!input || typeof input !== "object") return undefined;
  const article = {};

  // Title - max 256 chars
  if (typeof input.title === "string") {
    article.title = input.title.trim().slice(0, 256);
    if (!article.title) article.title = null;
  }

  // Text - max 50000 chars
  if (typeof input.text === "string") {
    article.text = input.text.trim().slice(0, 50000);
    if (!article.text) article.text = null;
  }

  // Cover URL - validate if provided
  if (typeof input.cover === "string" && input.cover.trim()) {
    const url = input.cover.trim();
    // Only allow relative upload URLs or https
    if (/^\/uploads\//.test(url) || /^https?:\/\//.test(url)) {
      article.cover = url.slice(0, 500);
    }
  }

  // Custom emojis - array of sanitized scenes
  if (Array.isArray(input.customEmoji)) {
    const { sanitizeScene } = require("./sanitizeScene");
    article.customEmoji = input.customEmoji
      .slice(0, 24)
      .map((scene) => sanitizeScene(scene, { requireLayers: true }))
      .filter(Boolean);
    if (!article.customEmoji.length) article.customEmoji = null;
  }

  // URL - optional link to full article
  if (typeof input.url === "string" && input.url.trim()) {
    const url = input.url.trim();
    if (/^https?:\/\//.test(url)) {
      article.url = url.slice(0, 500);
    }
  }

  // Only return if there's at least title or text
  if (!article.title && !article.text) return undefined;

  return article;
}

module.exports = { sanitizeArticle };