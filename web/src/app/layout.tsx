import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: "variable" });
const mono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: { default: "HCC Production", template: "%s · HCC Production" },
  description: "Standard operating procedures and production tools for Hope Christian Church.",
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#08090a", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${mono.variable} h-full`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster theme="system" position="bottom-center" toastOptions={{ className: "!bg-surface-2 !text-fg-hi !border-line-2 !text-[13px]" }} />
      </body>
    </html>
  );
}
