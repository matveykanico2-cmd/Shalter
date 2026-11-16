import { useQueryClient } from "@tanstack/react-query";

import { openDm } from "@/entities/chat";
import { useSession } from "@/entities/session";
import { closeContactEditor, useContactEditor, useOpenedProfile, userQueries } from "@/entities/user";

import { EditContactDialog } from "./edit-contact-dialog";
import { UserProfilePanel } from "./user-profile-panel";

/** Панель профиля, открытая через openUserProfile(id) откуда угодно, — одна на приложение. */
export function UserProfileHost() {
  const userId = useOpenedProfile();
  const editor = useContactEditor();
  const me = useSession().data?.user;
  const client = useQueryClient();
  if (!me) return null;
  // key: другой человек — своё состояние (вкладка, окна поверх).
  return (
    <>
      {userId ? <UserProfilePanel key={userId} userId={userId} me={me} /> : null}
      {editor ? (
        <EditContactDialog
          user={editor.user}
          contactName={editor.localName}
          note={null}
          photo={null}
          openDm={async () => (await openDm(editor.user.id, editor.user.name, editor.user.avatarColor)).chat.id}
          onSaved={() => {
            closeContactEditor();
            void client.invalidateQueries({ queryKey: userQueries.contacts().queryKey });
            void client.invalidateQueries({ queryKey: userQueries.profile(editor.user.id).queryKey });
          }}
          onClose={closeContactEditor}
        />
      ) : null}
    </>
  );
}
