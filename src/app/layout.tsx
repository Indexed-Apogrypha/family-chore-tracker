import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Chore Tracker",
  description: "AI photo-based family chore verification.",
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
