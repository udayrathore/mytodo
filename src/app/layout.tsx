import type { Metadata, Viewport } from "next";
import "./globals.css";
import { IconTooltips } from "@/components/icon-tooltips";
import { PwaProvider } from "@/components/pwa-provider";
export const metadata: Metadata = {
  title: "Tasks",
  description: "Task management",
  robots: { index: false, follow: false },
  applicationName: "Tasks",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tasks" },
  icons: {
    icon: [
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#202020",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PwaProvider>
          {children}
          <IconTooltips />
        </PwaProvider>
      </body>
    </html>
  );
}
