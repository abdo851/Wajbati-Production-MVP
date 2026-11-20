import type { Metadata, Viewport } from "next";
import { Alexandria, Fraunces, Outfit } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import { AppToaster } from "@/components/toaster";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const alexandria = Alexandria({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-alexandria",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#9B1D2E",
};

export const metadata: Metadata = {
  title: {
    default: "Righ",
    template: "%s · Righ",
  },
  description: "أشهى الوجبات المنزلية تصلك إلى بابك",
  manifest: "/manifest.json",
  applicationName: "ريغ",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ريغ",
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
      className={`${outfit.variable} ${fraunces.variable} ${alexandria.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh min-h-screen flex-col pt-safe pr-safe pb-safe pl-safe">
        {/*
          SSR always starts as Arabic. LanguageProvider must keep the first
          client paint on `initial` and only sync cookie/localStorage after
          mount — otherwise LanguageMenu hydrates with a mismatched label.
          Do not read cookies() here: Cache Components prerender blocks on it.
        */}
        <LanguageProvider initial="ar">{children}</LanguageProvider>
        <AppToaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
