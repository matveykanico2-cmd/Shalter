import { readCollection, updateCollection } from "./store";
import type { CallSignal } from "../types";

const FILE = "signals";

export async function addSignal(input: Omit<CallSignal, "id" | "seq" | "createdAt">): Promise<CallSignal> {
  let signal!: CallSignal;
  await updateCollection<CallSignal>(FILE, (all) => {
    const seq = all.reduce((max, s) => Math.max(max, s.seq), 0) + 1;
    signal = {
      ...input,
      id: `sig_${Date.now()}_${seq}`,
      seq,
      createdAt: new Date().toISOString(),
    };
    const next = [...all, signal];
    // Signaling is transient — trim old entries so signals.json doesn't grow unbounded.
    return next.length > 500 ? next.slice(next.length - 500) : next;
  });
  return signal;
}

export async function listSignalsFor(callId: string, forUserId: string, after: number): Promise<CallSignal[]> {
  const all = await readCollection<CallSignal>(FILE);
  return all
    .filter((s) => s.callId === callId && s.toUserId === forUserId && s.seq > after)
    .sort((a, b) => a.seq - b.seq);
}
