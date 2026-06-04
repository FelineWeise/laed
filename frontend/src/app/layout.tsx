import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAED",
  description: "LAED v2 — project workspace",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "LAED" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#F2F0EC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased pb-[env(safe-area-inset-bottom)]">
        {children}
      </body>
    </html>
  );
}
