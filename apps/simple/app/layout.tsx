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
const THEME_SCRIPT = `(function(){
  var m = matchMedia("(prefers-color-scheme: dark)");
  function apply(){
    var pref = localStorage.getItem("theme");
    var dark = pref === "dark" || (pref !== "light" && m.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  apply(); m.addEventListener("change", apply);
  window.__applyTheme = apply;
})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable, "antialiased")}
      suppressHydrationWarning
    >
      <head>
        {/* Resolve the theme before first paint to avoid a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
