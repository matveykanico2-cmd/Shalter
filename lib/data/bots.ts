import { readCollection } from "./store";
import type { Bot } from "../types";

const FILE = "bots";

export async function listBots(): Promise<Bot[]> {
  return readCollection<Bot>(FILE);
}

export async function getBotByUserId(userId: string): Promise<Bot | undefined> {
  const bots = await listBots();
  return bots.find((b) => b.userId === userId);
}
