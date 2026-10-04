import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/lib/theme-provider";
import { QueryProvider } from "@/lib/query-provider";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { BackendGate } from "@/components/server-waking";
import { SESSION_HINT_SCRIPT } from "@/lib/session-hint";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-serif",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const TITLE = "Lodestar — Find your direction.";
const DESCRIPTION =
  "Find research internships, fellowships and scholarships you actually qualify for, who to contact, and what to send.";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s · Lodestar" },
  description: DESCRIPTION,
  applicationName: "Lodestar",
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Lodestar", type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans")} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_HINT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Skip to content
            </a>
            <Nav />
            <main id="main" tabIndex={-1} className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-6xl px-4 py-6 outline-none">
              <BackendGate>{children}</BackendGate>
            </main>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
