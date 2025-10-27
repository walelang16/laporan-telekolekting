"use client";

import { Toaster } from "sonner";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {/* Komponen Toaster agar notifikasi muncul di semua halaman */}
      <Toaster richColors position="top-center" />
    </>
  );
}
