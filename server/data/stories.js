const { readCollection, updateCollection } = require("./store");

const FILE = "stories";
const TTL_MS = 24 * 60 * 60 * 1000;

async function listAllStories() {
  const stories = await readCollection(FILE);
  const now = Date.now();
  // Expiry is filter-on-read (same approach as listMessages' chatClears
  // overlay), not a cleanup job — nothing else in this app runs on a timer,
  // and a story that's 25h old is equally "gone" whether or not a sweep
  // has gotten to it yet.
  return stories.filter((s) => new Date(s.expiresAt).getTime() > now);
}

async function listStoriesForUsers(userIds) {
  const all = await listAllStories();
  return all.filter((s) => userIds.includes(s.userId));
}

async function addStory(story) {
  await updateCollection(FILE, (stories) => [...stories, story]);
  return story;
}

async function markViewed(id, viewerId) {
  let updated;
  await updateCollection(FILE, (stories) =>
    stories.map((s) => {
      if (s.id !== id) return s;
      updated = s.viewedByIds.includes(viewerId) ? s : { ...s, viewedByIds: [...s.viewedByIds, viewerId] };
      return updated;
    })
  );
  return updated;
}

async function deleteStory(id, userId) {
  let removed = false;
  await updateCollection(FILE, (stories) => {
    const next = stories.filter((s) => !(s.id === id && s.userId === userId));
    removed = next.length !== stories.length;
    return next;
  });
  return removed;
}

module.exports = { TTL_MS, listAllStories, listStoriesForUsers, addStory, markViewed, deleteStory };
