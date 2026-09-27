import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocalGPT",
  description: "A private, local AI assistant running on your machine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f6f7f9] text-slate-950">
        {children}
      </body>
    </html>
  );
}
