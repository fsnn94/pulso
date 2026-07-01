import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Header } from "@/components/Header";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { VerificationBanner } from "@/components/VerificationBanner";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Pulso — mercados de predicción",
  description:
    "Operá posiciones YES/NO sobre preguntas del futuro con créditos virtuales. Pulso es una plataforma de mercados de predicción — sin dinero real, no es apuestas ni una casa de bolsa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white dark:bg-ink-950 text-ink-900 dark:text-ink-100">
        <ThemeProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <DisclaimerBanner />
              <VerificationBanner />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
