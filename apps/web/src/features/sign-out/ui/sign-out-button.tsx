import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionQueries } from "@/entities/session";

import { Button } from "@/shared/ui";

import { signOut } from "../api/sign-out";

export function SignOutButton({ uid }: { uid: string }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => signOut(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueries.baseKey }),
  });
  return (
    <Button variant="link" onClick={() => logout.mutate()} disabled={logout.isPending}>
      Выйти
    </Button>
  );
}
