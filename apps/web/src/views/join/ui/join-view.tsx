import { useParams } from "react-router";

import { JoinInviteScreen } from "@/features/open-profile";

/** /join/код — вступление по пригласительной ссылке. */
export function JoinView() {
  const { code = "" } = useParams();
  return <JoinInviteScreen key={code} code={code} />;
}
