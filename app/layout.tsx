import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientLayout from "./client-layout"; // ✅ Tambahkan baris ini

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Telekolekting KC Tondano",
  description: "Sistem Laporan dan Mapping Telekolekting",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Gunakan ClientLayout agar bisa render komponen client seperti Toaster */}
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
