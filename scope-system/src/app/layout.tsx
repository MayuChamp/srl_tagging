import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Heebo } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "@/components/layout/LayoutClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Hebrew face. globals.css applies var(--font-hebrew) to [dir="rtl"] and
// :lang(he) blocks; Latin UI text keeps Geist.
const heebo = Heebo({
  variable: "--font-hebrew",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

// Pre-paint theme: light is the default; only a saved "ates-theme" of "dark"
// keeps the dark tokens. Runs before the first paint so nobody sees a theme
// flash on hard loads. LayoutClient's effect stays the source of truth after
// hydration (it adds or removes .light and persists the value).
const themeScript = `(function(){var d=document.documentElement;try{if(localStorage.getItem("ates-theme")!=="dark")d.classList.add("light")}catch(e){d.classList.add("light")}})()`;

export const metadata: Metadata = {
  title: "SCOPE — SRL Video Analysis",
  description: "Multimodal Video Analysis and Tagging for Self-Regulated Learning",
};

// Mobile browser chrome matches the always-dark app chrome (sidebar drawer and
// mobile header use bg-sidebar in both themes): the --sidebar token values of
// the light (#18171a) and dark (#0e0d0c) palettes in globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#18171a" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${heebo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-full bg-background text-foreground overflow-hidden">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
