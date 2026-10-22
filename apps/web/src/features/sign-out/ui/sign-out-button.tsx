import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { Button } from "@/shared/ui";

import { signOut } from "../api/sign-out";

export function SignOutButton({ uid }: { uid: string }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => {
      // Сокет закрываем сами: 4001 от сервера после выхода — не «сеанс завершён».
      ws.stop();
      return signOut(uid);
    },
    // Не вышли — остаёмся в приложении, сокет нужен снова.
    onError: () => ws.start(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueries.baseKey });
      // Чаты прежнего аккаунта не должны достаться следующему.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQueries.baseKey[0] });
    },
  });
  return (
    <Button variant="link" onClick={() => logout.mutate()} disabled={logout.isPending}>
      Выйти
    </Button>
  );
}
