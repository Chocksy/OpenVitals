import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "OpenVitals",
  description: "Personal biomarker tracker",
};

/**
 * Nothing but the shell. The nav lives in the (app) layout so it always renders
 * after a login redirect instead of waiting for a full page load.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable, "antialiased")}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
