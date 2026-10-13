
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroVisión | Monitoreo del cultivo de rabanito",
  description:
    "Plataforma de seguimiento del cultivo de rabanito. Registra observaciones de campo, consulta mediciones y compara tratamientos de fertilización.",
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
