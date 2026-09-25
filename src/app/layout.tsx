import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import "./globals.css";
import { t } from "@/lib/i18n";
import { AskLauncher } from "@/components/ask/AskLauncher";

// Open-licence grotesque with full Mongolian Cyrillic (Ө ө Ү ү) — close in tone to the SF Pro Display
// used on new.parliament.mn, which we cannot redistribute.
const golos = Golos_Text({
  subsets: ["cyrillic", "cyrillic-ext", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-golos",
  display: "swap",
});

export const metadata: Metadata = {
  title: t.meta.title,
  description: t.meta.description,
  robots: { index: false, follow: false }, // hackathon prototype — keep out of search results
};

export const viewport: Viewport = {
  themeColor: "#00379b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={golos.variable} suppressHydrationWarning>
      <head>
        {/* Marks JS as available so reveal animations may start hidden; without JS everything stays visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t.brand.skipToContent}
        </a>
        {children}
        <AskLauncher />
      </body>
    </html>
  );
}
