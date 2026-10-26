const DAY = 24 * 3600_000;

/** Бустить можно раз в сутки: last — время своего прошлого буста из chat.votes. */
export const boostedWithinDay = (last: unknown, now = Date.now()) => typeof last === "string" && now - new Date(last).getTime() < DAY;
