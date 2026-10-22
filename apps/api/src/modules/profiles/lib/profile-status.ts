import type { User } from "../../users/model/domain.js";

// Слоты и проверка картинки статуса — как server/lib/profileStatus.js (avatars.spec.ts сверяет их).

const FREE_SLOTS = 1;
const PREMIUM_SLOTS = 5;
const MAX_IMAGE_BYTES = 80 * 1024;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function slotsFor(user: Pick<User, "isPremium"> | undefined): number {
  return user?.isPremium ? PREMIUM_SLOTS : FREE_SLOTS;
}

export function validateImage(raw: unknown): { image: string; error?: undefined } | { error: string } {
  const image = String(raw ?? "");
  if (!IMAGE_RE.test(image)) return { error: "Некорректное изображение" };
  if (image.length > MAX_IMAGE_BYTES) return { error: "Картинка слишком большая" };
  return { image };
}
