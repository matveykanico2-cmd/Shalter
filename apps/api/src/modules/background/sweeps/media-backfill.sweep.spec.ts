// Обход media-backfill: ставит задачи на превью старым вложениям — не больше 20 за проход,
// каждому сообщению один раз, а дойдя до самых старых, больше не сканирует базу.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackfillCandidate, MediaBackfillRepository } from "../media-backfill.repository.js";

const queueJob = vi.fn();
vi.mock("../../../legacy/legacy.js", () => ({ queueJob: (...args: unknown[]) => queueJob(...args) }));
const { MediaBackfillSweep } = await import("./media-backfill.sweep.js");

const NAME = "image_0123456789abcdef.png";
const needs = JSON.stringify([{ kind: "image", url: `/uploads/${NAME}` }]);
const ready = JSON.stringify([{ kind: "image", url: `/uploads/${NAME}`, thumbUrl: "/uploads/x" }]);

function fakeRepo(rows: BackfillCandidate[]) {
  const queued = new Set<string>();
  const scans: (number | null)[] = [];
  const repo = {
    candidates: (before: number | null, _createdBefore: string, limit: number) => {
      scans.push(before);
      return rows.filter((r) => before === null || r.rowid < before).slice(0, limit);
    },
    queuedOf: (ids: string[]) => new Set(ids.filter((id) => queued.has(id))),
    markQueued: (id: string) => void queued.add(id),
  };
  return { repo: repo as unknown as MediaBackfillRepository, queued, scans };
}

const row = (n: number, attachments = needs): BackfillCandidate => ({ rowid: n, id: `m_${n}`, attachments });

beforeEach(() => queueJob.mockClear());

describe("media-backfill", () => {
  it("ставит задачу только тем, кому нужно, не больше 20 за проход, от новых к старым", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(100 - i, i % 3 === 0 ? ready : needs));
    const { repo } = fakeRepo(rows);
    const sweep = new MediaBackfillSweep(repo);
    sweep.once(new Date());
    expect(queueJob).toHaveBeenCalledTimes(20);
    expect(queueJob.mock.calls[0]).toEqual(["message-media", { messageId: "m_99" }]);
    sweep.once(new Date());
    expect(queueJob).toHaveBeenCalledTimes(20); // все 20 нуждавшихся уже поставлены
  });

  it("каждому сообщению — один раз; дойдя до конца, больше не сканирует", () => {
    const { repo, scans } = fakeRepo([row(3), row(2, "not json"), row(1)]);
    const sweep = new MediaBackfillSweep(repo);
    sweep.once(new Date());
    expect(queueJob.mock.calls.map((c) => (c[1] as { messageId: string }).messageId)).toEqual(["m_3", "m_1"]);
    const scanned = scans.length;
    sweep.once(new Date());
    expect(scans.length).toBe(scanned);
    // После перезапуска (новый экземпляр) уже поставленные не повторяются.
    const again = new MediaBackfillSweep(repo);
    again.once(new Date());
    expect(queueJob).toHaveBeenCalledTimes(2);
  });
});
