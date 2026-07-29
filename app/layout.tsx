import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мессенджер",
  description: "Веб-мессенджер на Next.js с JSON-хранилищем",
};

// Applied before hydration so the stored theme choice paints immediately
// instead of flashing the OS default first.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
    var accent = localStorage.getItem("accent");
    if (accent) {
      document.documentElement.style.setProperty("--color-accent", accent);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
