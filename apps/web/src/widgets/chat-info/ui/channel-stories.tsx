import { useQuery } from "@tanstack/react-query";

import { openStoryViewer, storyQueries } from "@/entities/story";

import { Button } from "@/shared/ui";

/** Истории канала используют ту же группу и просмотрщик, что и общая лента. */
export function ChannelStories({ chatId }: { chatId: string }) {
  const stories = useQuery(storyQueries.ofUser(chatId));
  const group = stories.data?.group;
  return (
    <section aria-label="Истории канала">
      <h3>Истории</h3>
      {stories.isPending ? <p>Загрузка историй…</p> : stories.isError ? (
        <Button onClick={() => void stories.refetch()}>Повторить загрузку историй</Button>
      ) : group?.stories.length ? (
        <Button onClick={() => openStoryViewer([group])}>Смотреть истории ({group.stories.length})</Button>
      ) : <p>Активных историй пока нет</p>}
    </section>
  );
}
