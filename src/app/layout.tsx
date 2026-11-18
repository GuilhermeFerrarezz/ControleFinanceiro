import type { Metadata } from "next";
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import "./globals.css";

export const metadata: Metadata = {
  title: "Saldo da Casa | Seu restaurante, mais organizado",
  description: "Organize seu restaurante e conecte sua equipe. Uma nova receita para cuidar das finanças de quem vive a gastronomia.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The HTML scripts must use the nonce of this response, including on public pages.
  await connection();
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
