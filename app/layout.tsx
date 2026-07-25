import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto-Charcuterie",
  description: "Build a charcuterie board. Be judged for it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The board fills the screen, so the menu card and the debug strip need to
  // know where the rounded corners and the home indicator are.
  viewportFit: "cover",
  // Deliberately *not* setting userScalable: false. The canvas already opts out
  // of browser gestures via touch-action, and blocking pinch-zoom on the menu
  // text would take away the only way to enlarge it.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
