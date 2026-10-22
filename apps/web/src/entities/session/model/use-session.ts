import { useQuery } from "@tanstack/react-query";

import { sessionQueries } from "../api/session-queries";

export const useSession = () => useQuery(sessionQueries.current());
