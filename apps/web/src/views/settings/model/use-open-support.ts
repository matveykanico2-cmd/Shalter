import { useNavigate } from "react-router";

import { openServiceChat } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

/** «Поддержка — Hugo»: сервер находит или создаёт личку с Hugo — открываем её (openSupport). */
export function useOpenSupport() {
  const navigate = useNavigate();
  return () =>
    void openServiceChat("support").then(
      ({ chatId }) => void navigate(`/chat/${chatId}`),
      (err: unknown) => toast(errorText(err, "Не удалось открыть поддержку"), { error: true })
    );
}
