import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useNavigate } from "react-router";

import { communityQueries } from "../api/community-api";

// Открытая в колонке списка чатов панель сообщества — sidebarCommunity в public/js/state.js.
let current: string | null = null;
const listeners = new Set<() => void>();

export function setCommunityPanel(id: string | null) {
  if (current === id) return;
  current = id;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** id сообщества, чья панель открыта в списке чатов, или null. */
export const useCommunityPanel = () => useSyncExternalStore(subscribe, () => current);

/**
 * Открыть сообщество — openCommunityPanel в communityList.js: участник — панель в списке
 * чатов (на телефоне — к списку), иначе страница /community/:id, с неё можно вступить.
 */
export function useOpenCommunity() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return async (id: string) => {
    void client.invalidateQueries({ queryKey: communityQueries.detail(id).queryKey });
    const known = client.getQueryData(communityQueries.joined().queryKey)?.some((c) => c.id === id);
    const joined = known ? client.getQueryData(communityQueries.joined().queryKey) : await client.fetchQuery({ ...communityQueries.joined(), staleTime: 0 }).catch(() => []);
    if (known) void client.invalidateQueries({ queryKey: communityQueries.joined().queryKey });
    if (!joined?.some((c) => c.id === id)) {
      void navigate(`/community/${id}`);
      return;
    }
    setCommunityPanel(id);
    const narrow = typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 768px)").matches;
    if (narrow && window.location.pathname !== "/") void navigate("/");
  };
}
