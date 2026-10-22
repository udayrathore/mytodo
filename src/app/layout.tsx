import type { Metadata } from "next";
import "./globals.css";
import { IconTooltips } from "@/components/icon-tooltips";
export const metadata: Metadata = {
  title: "Tasks",
  description: "Task management",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <IconTooltips />
      </body>
    </html>
  );
}
