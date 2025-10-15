import type { Metadata } from "next";
import { Open_Sans, Special_Elite } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "VOTUS Recife — Consulta por Candidato",
  description: "Digite o Nome de Urna ou o Número para iniciar a consulta.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <body
        className={`${openSans.variable} ${specialElite.variable} antialiased bg-[#ffecc8]`}
        style={{ fontFamily: 'var(--font-open-sans)' }}
        suppressHydrationWarning
      >
        <header className="h-[70px] bg-[#00a0c1] w-full">
          <div className="max-w-[1366px] mx-auto h-full px-16 flex items-center">
            <a href="/" className="flex items-center gap-2">
              <span className={`${specialElite.className} text-[#caf1ff] text-[30px] leading-none`}>
                VOTUS
              </span>
              <span className={`${specialElite.className} text-white text-[16px] leading-none`}>
                Análise de Dados Eleitorais
              </span>
            </a>
          </div>
        </header>
        <div className="max-w-[1366px] mx-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
