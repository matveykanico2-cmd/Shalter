"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PrimaryButton } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the error boundary useful in production without exposing server details.
    console.error("Snapgram route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted">The page hit an unexpected problem. Try again or return to your feed.</p>
        <div className="mt-6 flex justify-center gap-3">
          <PrimaryButton type="button" onClick={() => reset()}>
            Try again
          </PrimaryButton>
          <Link href="/" className="rounded-lg bg-secondary px-4 py-[7px] text-sm font-semibold hover:bg-secondary-hover">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
