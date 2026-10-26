import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { useBan } from "@/shared/api";
import { AskHost, BrowserHost, Toaster } from "@/shared/ui";

import { createQueryClient } from "./providers/query-client";
import { BanScreen } from "./ui/ban-screen";
import { createRouter } from "./router";

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);
  const ban = useBan();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Заблокированному — только экран блокировки: приложения под ним нет вовсе. */}
      {ban ? <BanScreen ban={ban} /> : <RouterProvider router={router} />}
      <BrowserHost />
      <Toaster />
      <AskHost />
    </QueryClientProvider>
  );
}
