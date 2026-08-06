import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { NavTape } from "@/components/NavTape";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "stellar-ramp · Yield-bearing ramp SDK for Stellar",
  description:
    "PIX → USDC → TESOURO. A yield-bearing ramp SDK for Stellar: regional fiat ⇄ USDC + auto-park into Etherfuse Stablebonds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${syne.variable} ${jetbrains.variable}`}
    >
      <body className="ledger min-h-screen bg-base text-ink antialiased">
        <header className="fixed inset-x-0 top-0 z-50">
          <NavTape />
          <Nav />
        </header>
        <main className="pt-20">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
