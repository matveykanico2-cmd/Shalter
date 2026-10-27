import { type NewStoryItem, storyApi } from "@/entities/story";

import { uploadFile } from "@/shared/api";

import { fileToImageUpload } from "../lib/story-image";

// Длинная сторона фото истории. Было 1080 — вертикальное фото 1080×1920 ужималось до
// 608×1080 и выглядело мыльным; 2160 — полное качество для экрана телефона.
const MAX_STORY_DIMENSION = 2160;
const MAX_STORY_BYTES = 3 * 1024 ** 3; // история — до 3 ГБ

// История канала — как в editChatDialog.js: фото ужимается до 1080.
const MAX_CHANNEL_STORY_DIMENSION = 1080;

type Hooks = {
  /** Фото — через редактор: File (правленый или исходный) или null — это фото пропустить. */
  edit: (file: File) => Promise<File | null>;
  progress: (text: string) => void;
  /** История канала, а не своя. */
  channelId?: string;
};

/**
 * Выложить историю из выбранных файлов (postStory в storiesBar.js): фото — через редактор,
 * видео — как есть (сервер обработает его в фоне), всё одной историей. false — нечего выкладывать.
 */
export async function postStory(files: File[], { edit, progress, channelId }: Hooks) {
  const items: NewStoryItem[] = [];
  for (const [i, file] of files.entries()) {
    const isVideo = file.type.startsWith("video/");
    if (file.size > MAX_STORY_BYTES) throw new Error(`«${file.name}» больше 3 ГБ — для истории выберите файл поменьше`);
    let upload = file;
    if (!isVideo) {
      progress(`Редактируем ${i + 1} из ${files.length}…`);
      const edited = await edit(file);
      if (!edited) continue;
      upload = edited === file ? await fileToImageUpload(file, channelId ? MAX_CHANNEL_STORY_DIMENSION : MAX_STORY_DIMENSION) : edited;
    }
    progress(`Загружаем ${i + 1} из ${files.length}…`);
    const { url } = await uploadFile(upload, isVideo ? "video" : "image");
    items.push({ kind: isVideo ? "video" : "image", url });
  }
  if (!items.length) return false;
  await (channelId ? storyApi.postToChannel(channelId, items) : storyApi.post(items));
  return true;
}

/** Текстовая история: готовая картинка из редактора — как обычное фото одной историей. */
export async function postTextStory(image: File) {
  const { url } = await uploadFile(image, "image");
  await storyApi.post([{ kind: "image", url }]);
}
