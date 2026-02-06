import type React from "react";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Suspense } from "react";
import { Providers } from "@/providers/chain-provider";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Maelstrom",
  description:
    "Experience fluid, innovative DeFi trading with advanced liquidity mechanics and seamless user experience.",
  generator: "maelstrom-ui",
  keywords: ["DeFi", "trading", "liquidity", "blockchain", "swap", "tokens"],
  authors: [{ name: "Maelstrom Team" }],
  icons: {
    icon: [{ url: "/logo_maelstrom.svg", type: "image/svg+xml" }],
    shortcut: "/logo_maelstrom.svg",
    apple: "/logo_maelstrom.svg",
  },
  openGraph: {
    title: "Maelstrom",
    description:
      "Experience fluid, innovative DeFi trading with advanced liquidity mechanics.",
    type: "website",
    images: ["/logo_maelstrom.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maelstrom",
    description:
      "Experience fluid, innovative DeFi trading with advanced liquidity mechanics.",
    images: ["/logo_maelstrom.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased overflow-x-hidden`}>
        <Suspense fallback={null}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            forcedTheme="dark"
            disableTransitionOnChange
          >
            <Providers>
              <div>
                <Header />
                <main>{children}</main>
                <Footer />
              </div>
            </Providers>
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
