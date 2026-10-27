import { Injectable } from "@nestjs/common";
import type { ClientSocket } from "../model/domain.js";

// Открытые сокеты по пользователям. Живут в памяти процесса — поэтому на один каталог
// data/ ровно один процесс API.
@Injectable()
export class SocketRegistry {
  private readonly byUser = new Map<string, Set<ClientSocket>>();

  /** Добавляет сокет; true — до этого у пользователя сокетов не было (он только что вошёл в сеть). */
  public add(ws: ClientSocket): boolean {
    let set = this.byUser.get(ws.uid);
    const first = !set;
    if (!set) this.byUser.set(ws.uid, (set = new Set()));
    set.add(ws);
    return first;
  }

  /** Убирает сокет; true — это был последний сокет пользователя. */
  public remove(ws: ClientSocket): boolean {
    const set = this.byUser.get(ws.uid);
    if (!set) return false;
    set.delete(ws);
    if (set.size > 0) return false;
    this.byUser.delete(ws.uid);
    return true;
  }

  public has(uid: string): boolean {
    return this.byUser.has(uid);
  }

  public socketsOf(uid: string): ReadonlySet<ClientSocket> | undefined {
    return this.byUser.get(uid);
  }

  public onlineUserIds(): string[] {
    return [...this.byUser.keys()];
  }

  public all(): IterableIterator<ReadonlySet<ClientSocket>> {
    return this.byUser.values();
  }

  public get userCount(): number {
    return this.byUser.size;
  }
}
