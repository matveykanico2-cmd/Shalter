import ClientPage from "./page-client";

// A server component (not a bare re-export), so Next reads generateStaticParams from this file.
export default function Page() {
  return <ClientPage />;
}
