import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  description: "Sistem Laporan dan Mapping Telekolekting KC Tondano - BPJS Kesehatan",
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    title: "Telekolekting KC Tondano",
    description: "Sistem Laporan dan Mapping Telekolekting KC Tondano",
    url: "https://laporan-telekolekting-u1ui.vercel.app",
    siteName: "Telekolekting KC Tondano",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 800,
        alt: "Logo BPJS Kesehatan",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
