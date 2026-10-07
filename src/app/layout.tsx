import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const DESCRIPTION = "CodeMind AI is an evidence-driven engineering platform: investigate bugs, trace root causes to real code, review fixes, and open pull requests only after human approval.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "CodeMind AI — Investigate. Understand. Fix. Validate.", template: "%s · CodeMind AI" },
  description: DESCRIPTION,
  applicationName: "CodeMind AI",
  keywords: ["AI engineering", "root cause analysis", "code investigation", "repository intelligence", "debugging", "pull request automation", "RAG", "developer tools"],
  authors: [{ name: "CodeMind AI" }],
  creator: "CodeMind AI",
  category: "technology",
  openGraph: { type: "website", siteName: "CodeMind AI", title: "CodeMind AI — Investigate. Understand. Fix. Validate.", description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "CodeMind AI — Investigate. Understand. Fix. Validate.", description: DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#090a0f" }, { media: "(prefers-color-scheme: light)", color: "#f4f5fa" }],
};

/** Runs before first paint so the saved (or system) theme never flashes. Static string, no user input. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("cm-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
