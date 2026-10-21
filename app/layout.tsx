
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerraNova | Monitoreo inteligente de cultivos",
  description:
    "TerraNova: plataforma de monitoreo inteligente de cultivos. Registra observaciones de campo, consulta mediciones y compara tratamientos de fertilización.",
  icons: { icon: "/terranova-icon.png" },
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
