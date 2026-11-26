import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-6xl font-semibold">404</p>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted">The link may be broken, or the page may have been removed.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-link px-4 py-2 text-sm font-semibold text-white hover:bg-link-hover">
          Go to shalter
        </Link>
      </div>
    </main>
  );
}
