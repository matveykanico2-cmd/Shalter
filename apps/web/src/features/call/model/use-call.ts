import { useSyncExternalStore } from "react";

import { getCall, subscribeCall } from "./call-store";

/** Идущий звонок вкладки (или null). */
export const useCall = () => useSyncExternalStore(subscribeCall, getCall);
