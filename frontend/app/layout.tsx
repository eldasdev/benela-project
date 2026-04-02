import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import ChunkReloadGuard from "@/components/runtime/ChunkReloadGuard";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";
import PostHogBridge from "@/components/analytics/PostHogBridge";

export const metadata: Metadata = {
  title: "Benela AI — Enterprise ERP",
  description: "The AI-native enterprise ERP system",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ChunkReloadGuard />
        <PostHogBridge />
        <LanguageProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
