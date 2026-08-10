import type { AppProps } from "next/app";
import Head from "next/head";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import "@/styles/globals.css";
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

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${syne.variable} ${jetbrains.variable}`}>
      <Head>
        <title>stellar-ramp · Yield-bearing ramp SDK for Stellar</title>
        <meta
          name="description"
          content="PIX → USDC → TESOURO. A yield-bearing ramp SDK for Stellar: regional fiat ⇄ USDC + auto-park into Etherfuse Stablebonds."
        />
      </Head>
      <header className="fixed inset-x-0 top-0 z-50">
        <NavTape />
        <Nav />
      </header>
      <main className="pt-20">
        <Component {...pageProps} />
      </main>
      <Footer />
    </div>
  );
}
