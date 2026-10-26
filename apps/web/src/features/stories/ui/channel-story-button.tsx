import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { storyQueries } from "@/entities/story";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { postStory } from "../model/post-story";

import { StoryEditor } from "./story-editor";

/**
 * «Добавить историю канала» из правки канала (storyInput в editChatDialog.js): выбор фото и видео,
 * фото — через редактор. Сама строка — снаружи (render получает открытие выбора и прогресс).
 */
export function ChannelStoryButton({ chatId, children }: { chatId: string; children: (open: () => void, progress: string | null) => ReactNode }) {
  const client = useQueryClient();
  // Поле выбора файлов — через состояние: открывать его зовут из render-функции.
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ file: File; resolve: (f: File | null) => void } | null>(null);

  const open = () => input?.click();

  const pick = async (files: File[]) => {
    try {
      const posted = await postStory(files, { channelId: chatId, edit: (file) => new Promise((resolve) => setEditing({ file, resolve })), progress: setProgress });
      if (!posted) return;
      toast("История опубликована");
      await client.invalidateQueries({ queryKey: storyQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось выложить историю"), { error: true });
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      {children(open, progress)}
      <input
        ref={setInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void pick(files);
        }}
      />
      {editing ? (
        <StoryEditor
          key={editing.file.name + editing.file.lastModified}
          file={editing.file}
          onDone={(result) => {
            setEditing(null);
            editing.resolve(result);
          }}
        />
      ) : null}
    </>
  );
}
