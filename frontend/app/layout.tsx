import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Benela AI — Enterprise ERP",
  description: "The world's first AI-native enterprise ERP system",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}