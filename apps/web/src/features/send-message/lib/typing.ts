/** «Печатает» не чаще раза в interval: время нового пинга или null, если рано. */
export const typingPingDue = (last: number, interval: number, now = Date.now()) => (now - last > interval ? now : null);
