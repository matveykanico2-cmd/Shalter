import { useQuery } from "@tanstack/react-query";

import { settingsQueries } from "../api/settings-queries";

export const useSettings = () => useQuery(settingsQueries.current());
