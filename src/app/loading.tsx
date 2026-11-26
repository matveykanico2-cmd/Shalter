import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted" aria-label="Loading">
      <Spinner />
    </div>
  );
}
