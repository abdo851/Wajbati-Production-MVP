import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Naskh_Arabic, Outfit } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import { AppToaster } from "@/components/toaster";
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
  themeColor: "#B85C3E",
};

export const metadata: Metadata = {
  title: {
    default: "Wajbati",
    template: "%s · Wajbati",
  },
  description: "أشهى الوجبات المنزلية تصلك إلى بابك",
  manifest: "/manifest.json",
  applicationName: "وجبتي",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "وجبتي",
  },
  icons: {
    icon: "/favicon.ico",
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${outfit.variable} ${fraunces.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh min-h-screen flex-col pt-safe pr-safe pb-safe pl-safe">
        <LanguageProvider initial="ar">{children}</LanguageProvider>
        <AppToaster />
      </body>
    </html>
  );
}
