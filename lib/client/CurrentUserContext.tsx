"use client";

import { createContext, useContext } from "react";
import type { PublicUser } from "../types";

interface AccountState {
  user: PublicUser;
  accounts: PublicUser[];
}

const CurrentUserContext = createContext<AccountState | null>(null);

export function CurrentUserProvider({
  user,
  accounts,
  children,
}: {
  user: PublicUser;
  accounts: PublicUser[];
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={{ user, accounts }}>{children}</CurrentUserContext.Provider>;
}

function useAccountState(): AccountState {
  const state = useContext(CurrentUserContext);
  if (!state) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return state;
}

export function useCurrentUser(): PublicUser {
  return useAccountState().user;
}

export function useAccounts(): PublicUser[] {
  return useAccountState().accounts;
}
