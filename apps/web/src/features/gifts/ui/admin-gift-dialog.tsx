import { useQueryClient } from "@tanstack/react-query";

import { giftApi } from "@/entities/gift";
import { userQueries } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { GiftPickerDialog } from "./gift-picker-dialog";

/**
 * «Выдать подарок (админ)» в профиле лички (deliverGiftToOther в chatView.js): подарок без оплаты,
 * сообщение о нём придёт в чат событием.
 */
export function AdminGiftDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const client = useQueryClient();
  return (
    <GiftPickerDialog
      title="Выдать подарок (админ)"
      onClose={onClose}
      onPick={(g) =>
        void giftApi.deliver(g.id, userId).then(
          () => client.invalidateQueries({ queryKey: userQueries.profile(userId).queryKey }),
          (err: unknown) => toast(errorText(err, "Не удалось выдать подарок"), { error: true })
        )
      }
    />
  );
}
