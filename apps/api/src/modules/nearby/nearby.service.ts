import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { UsersRepository } from "../users/users.repository.js";
import { bucketFor, coord, distanceKm, MAX_RADIUS_KM, PRESENCE_TTL_MS, roundCoord, validCoords } from "./lib/nearby-distance.js";
import { NearbyRepository } from "./nearby.repository.js";

// «Люди рядом» (/api/nearby) — как server/routes/nearby.js и data/nearby.js: только корзина
// расстояния, порядок внутри корзины случайный, заблокированные не видят друг друга.
@Injectable()
export class NearbyService {
  public constructor(
    private readonly nearby: NearbyRepository,
    private readonly users: UsersRepository
  ) {}

  /** Публикует своё место и возвращает людей рядом с ним. */
  public share(uid: string, rawLat: unknown, rawLng: unknown) {
    const [lat, lng] = this.coords(rawLat, rawLng);
    this.nearby.setLocation(uid, roundCoord(lat), roundCoord(lng));
    return { users: this.around(uid, lat, lng) };
  }

  /** Люди рядом с точкой, без публикации своего места. */
  public look(uid: string, rawLat: unknown, rawLng: unknown) {
    const [lat, lng] = this.coords(rawLat, rawLng);
    return { users: this.around(uid, lat, lng) };
  }

  public hide(uid: string) {
    this.nearby.clearLocation(uid);
    return { ok: true };
  }

  private coords(rawLat: unknown, rawLng: unknown): [number, number] {
    const lat = coord(rawLat);
    const lng = coord(rawLng);
    if (!validCoords(lat, lng)) throw new ApiError(400, "invalid coordinates");
    return [lat, lng];
  }

  private around(uid: string, lat: number, lng: number) {
    const vLat = roundCoord(lat);
    const vLng = roundCoord(lng);
    const viewerBlocked = new Set(this.users.findById(uid)?.blockedUserIds ?? []);
    const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();

    const withDistance = [];
    for (const r of this.nearby.listSharedSince(cutoff)) {
      if (r.id === uid || viewerBlocked.has(r.id)) continue;
      let theirBlocked: string[];
      try {
        theirBlocked = JSON.parse(r.blockedUserIds || "[]");
      } catch {
        theirBlocked = [];
      }
      if (theirBlocked.includes(uid)) continue;
      const km = distanceKm(vLat, vLng, r.nearbyLat!, r.nearbyLng!);
      if (!(km <= MAX_RADIUS_KM)) continue;
      withDistance.push({ id: r.id, name: r.name, username: r.username, avatarColor: r.avatarColor, avatarImage: r.avatarImage, ...bucketFor(km) });
    }

    for (let i = withDistance.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [withDistance[i], withDistance[j]] = [withDistance[j], withDistance[i]];
    }
    withDistance.sort((a, b) => a.order - b.order);
    return withDistance.map(({ order: _order, ...rest }) => rest);
  }
}
