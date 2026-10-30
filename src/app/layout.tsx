import type { Metadata } from "next";
import type { ReactNode } from 'react';
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle Financeiro | Seu restaurante, mais organizado",
  description: "Organize seu restaurante e conecte sua equipe. Uma nova receita para cuidar das finanças de quem vive a gastronomia.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
