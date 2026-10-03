import { api } from "../api.js";

const known = new Map();
const inFlight = new Map();

export function cachedUser(id) {
  return known.get(id);
}

export async function fetchUsers(ids) {
  const wanted = [...new Set(ids)].filter((id) => typeof id === "string" && id && !id.startsWith("c_") && !known.has(id));
  if (!wanted.length) return false;
  const results = await Promise.all(
    wanted.map((id) => {
      if (!inFlight.has(id)) {
        const p = api
          .getUser(id)
          .then((res) => {
            if (res?.user) known.set(id, res.user);
            return !!res?.user;
          })
          .catch((err) => {
            if (err?.message === "not found") {
              known.set(id, { id, name: "Удалённый аккаунт", deleted: true });
              return true;
            }
            return false;
          })
          .finally(() => inFlight.delete(id));
        inFlight.set(id, p);
      }
      return inFlight.get(id);
    })
  );
  return results.some(Boolean);
}

export function rememberUser(user) {
  if (user?.id && known.has(user.id)) known.set(user.id, { ...known.get(user.id), ...user });
}

export function forgetUser(id) {
  known.delete(id);
}
