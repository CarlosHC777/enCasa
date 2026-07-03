import type { Metadata, Viewport } from "next";
import { ProfileProvider } from "@/context/ProfileContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "enCasa",
  description: "Organiza las tareas diarias de la casa en familia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <ProfileProvider>{children}</ProfileProvider>
      </body>
    </html>
  );
}
