import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AgroVision | Sistema inteligente de monitoreo agrícola",
  description:
    "Analiza tus cultivos, registra el trabajo de campo y compara tratamientos en un solo lugar.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
