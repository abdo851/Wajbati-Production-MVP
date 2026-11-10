import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Naskh_Arabic, Outfit } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const naskh = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["500", "600", "700"],
  variable: "--font-naskh",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Wajbati",
    template: "%s · Wajbati",
  },
  description:
    "Order today's home-cooked meals from independent kitchens. Portions are limited and update live.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${outfit.variable} ${fraunces.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <LanguageProvider initial="ar">{children}</LanguageProvider>
      </body>
    </html>
  );
}
