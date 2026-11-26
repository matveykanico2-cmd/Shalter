import type { Metadata, Viewport } from "next";
import { Grand_Hotel } from "next/font/google";
import "./globals.css";

const grandHotel = Grand_Hotel({ variable: "--font-grand-hotel", weight: "400", subsets: ["latin"] });

// Applies the saved theme (or the system one) before the first paint, so there's no flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("snapgram:theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}`;

export const metadata: Metadata = {
  title: "shalter",
  description: "Share photos, videos and stories with your friends.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1014" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grandHotel.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Browser extensions (e.g. ColorZilla) add attributes to <body>; ignore those mismatches. */}
      <body className="min-h-full font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
