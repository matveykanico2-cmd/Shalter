const { test } = require("node:test");
const assert = require("node:assert/strict");
const { videoPreviewFor } = require("../server/lib/linkPreview");

test("YouTube: id из разных ссылок", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ]) {
    assert.equal(videoPreviewFor(url)?.video?.id, "dQw4w9WgXcQ", url);
  }
});

test("YouTube: заставки от большей к меньшей, все https", () => {
  const { video } = videoPreviewFor("https://youtu.be/dQw4w9WgXcQ");
  assert.deepEqual(video.images, [
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  ]);
  assert.equal(videoPreviewFor("https://youtu.be/dQw4w9WgXcQ").siteName, "YouTube");
});

test("Vimeo: только цифровой id", () => {
  assert.equal(videoPreviewFor("https://vimeo.com/76979871")?.video?.id, "76979871");
  assert.equal(videoPreviewFor("https://player.vimeo.com/video/76979871")?.video?.embedUrl, "https://player.vimeo.com/video/76979871");
  assert.equal(videoPreviewFor("https://vimeo.com/channels/staffpicks"), null);
});

test("остальные ссылки видео не распознаются", () => {
  for (const url of ["https://example.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/", "https://notyoutube.com.evil/watch?v=abc", "не ссылка"]) {
    assert.equal(videoPreviewFor(url), null, url);
  }
});