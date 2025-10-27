// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";
import { MoreVertical } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* UI components (simple Tailwind-based components located in src/components/ui/) */
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ---------------------------- Constants ---------------------------- */
const DEFAULT_AVATAR = "/default-avatar.png";
const STORAGE_KEY = "telekolekting_reports_final_v1";
const MAPPING_STORAGE_KEY = "telekolekting_mapping_final_v1";
const USERS_STORAGE_KEY = "telekolekting_users_v1";
const IDB_NAME = "telekolekting_db_v1";
const IDB_STORE = "mapping_images";

/* Kabupaten/Kota list */
const KABUPATEN = [
  "Minahasa",
  "Bolmong",
  "Minsel",
  "Tomohon",
  "Kota Mobagu",
  "Mitra",
  "Bolmut",
  "Bolsel",
  "Boltim",
];

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];

/* ---------------------------- Helper functions ---------------------------- */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function imgUrlToDataUrl(src: string, maxHeight = 200) {
  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const ratio = img.width / img.height;
      const h = Math.min(img.height, maxHeight);
      const w = h * ratio;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(c.toDataURL("image/jpeg"));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* New helper: read & resize image -> dataURL (jpeg) */
async function fileToResizedDataUrl(file: File, maxSide = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (Math.max(w, h) > maxSide) {
          const ratio = w / h;
          if (w > h) {
            w = maxSide;
            h = Math.round(maxSide / ratio);
          } else {
            h = maxSide;
            w = Math.round(maxSide * ratio);
          }
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        // quality 0.7 to reduce size — you can tweak
        const dataUrl = c.toDataURL("image/jpeg", 0.7);
        resolve(dataUrl);
      };
      img.onerror = (e) => reject(e);
      img.src = String(reader.result);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/* -------------------- IndexedDB simple helper -------------------- */
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: Blob | string) {
  const db = await openIdb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const r = store.put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function idbGet(key: string): Promise<Blob | string | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbDelete(key: string) {
  const db = await openIdb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const r = store.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/* helper key builder for mapping images */
function imageKey(year: string, month: string, regionIndex: number, photoIndex: number) {
  return `mapping:${year}:${month}:r${regionIndex}:p${photoIndex}`;
}

/* ---------------------------- Component ---------------------------- */
export default function TeamReportDashboard() {
  const now = new Date();
  const defaultMonth = MONTHS[now.getMonth()];
  const defaultYear = String(now.getFullYear());

  /* Auth state */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  /* UI state */
  const [activeTab, setActiveTab] = useState<"anggota" | "laporan" | "mapping">(
    "anggota"
  );
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [progress, setProgress] = useState(0);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /* Data state */
  const defaultUsers = [
    { username: "Tian16", password: "Walelang16", role: "Admin", name: "Admin", photo: null },
    { username: "tim1", password: "tim123", role: "Anggota", name: "Anggota 1", photo: null },
    { username: "tim2", password: "tim123", role: "Anggota", name: "Anggota 2", photo: null },
    { username: "tim3", password: "tim123", role: "Anggota", name: "Anggota 3", photo: null },
  ];

  const [users, setUsers] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(USERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : defaultUsers;
    } catch (e) {
      console.error("load users", e);
      return defaultUsers;
    }
  });

  const [reports, setReports] = useState<Record<string, any>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });

  const [pendingUploads, setPendingUploads] = useState<Record<string, string>>({});

  /* mapping storage structure: mappingStorage[year][month] = array of regions */
  const [mappingStorage, setMappingStorage] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });

  const [mappingData, setMappingData] = useState(
    KABUPATEN.map((name) => ({ region: name, photos: Array(23).fill(null) }))
  );

  /* admin modals */
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; username: string; password: string; photo: string | null }>(
    {
      name: "",
      username: "",
      password: "",
      photo: null,
    }
  );
  const [newMember, setNewMember] = useState({ name: "", username: "", password: "" });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, username: null as string | null });
  const [confirmSend, setConfirmSend] = useState({ open: false, username: null as string | null, filename: null as string | null });

  /* --- persist users/reports/mapping to localStorage on change --- */
  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      console.error("save users", e);
      toast.error("Gagal menyimpan data anggota ke localStorage");
    }
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (e) {}
  }, [reports]);

  useEffect(() => {
    try {
      localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mappingStorage));
    } catch (e) {}
  }, [mappingStorage]);

  /* when month/year/mappingStorage change -> set mappingData (and load blobs from IDB) */
  useEffect(() => {
    const monthData = mappingStorage?.[year]?.[month];
    if (monthData && Array.isArray(monthData) && monthData.length === KABUPATEN.length) {
      (async () => {
        try {
          const built = await Promise.all(monthData.map(async (r: any, regionIndex: number) => {
            const photosSlots = Array(23).fill(null);
            for (let i = 0; i < 23; i++) {
              if (r.photos?.[i]) {
                try {
                  const key = imageKey(year, month, regionIndex, i);
                  const blob = await idbGet(key);
                  if (blob) {
                    const url = typeof blob === "string" ? blob : URL.createObjectURL(blob as Blob);
                    photosSlots[i] = url;
                  } else {
                    photosSlots[i] = null;
                  }
                } catch (e) {
                  photosSlots[i] = null;
                }
              } else {
                photosSlots[i] = null;
              }
            }
            return { region: r.region || KABUPATEN[regionIndex], photos: photosSlots };
          }));
          setMappingData(built);
          const uploaded = built.reduce((a: number, r: any) => a + (r.photos?.filter(Boolean).length || 0), 0);
          setProgress((uploaded / (KABUPATEN.length * 23)) * 100);
        } catch (e) {
          console.error("load mapping from idb", e);
          setMappingData(monthData);
          const uploaded = monthData.reduce((a: number, r: any) => a + (r.photos?.filter(Boolean).length || 0), 0);
          setProgress((uploaded / (KABUPATEN.length * 23)) * 100);
        }
      })();
    } else {
      setMappingData(KABUPATEN.map((name) => ({ region: name, photos: Array(23).fill(null) })));
      setProgress(0);
    }
  }, [year, month, mappingStorage]);

  /* ---------------- Auth ---------------- */
  const handleLogin = () => {
    const u = users.find((x) => x.username === username && x.password === password);
    if (u) {
      setIsLoggedIn(true);
      setCurrentUser(u);
      toast.success(`Selamat datang, ${u.name || u.username}`);
    } else {
      toast.error("Username atau password salah!");
    }
  };
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    toast.success("Berhasil logout");
  };

  /* ---------------- Members (admin) ---------------- */
  const handleAddMember = () => {
    if (!newMember.name || !newMember.username || !newMember.password) {
      toast.error("Isi semua kolom untuk menambahkan anggota!");
      return;
    }
    if (users.find((u) => u.username === newMember.username)) {
      toast.error("Username sudah ada");
      return;
    }
    const user = { username: newMember.username, password: newMember.password, role: "Anggota", name: newMember.name, photo: null };
    setUsers((p) => [...p, user]);
    setNewMember({ name: "", username: "", password: "" });
    toast.success(`Anggota ${user.name} ditambahkan`);
  };

  const openEditModal = (user: any) => {
    setEditTarget(user.username);
    setEditForm({ name: user.name || "", username: user.username, password: user.password || "", photo: user.photo || null });
    setIsEditOpen(true);
    setOpenMenu(null);
  };

  const handleEditPhotoChange = async (e: any) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { // profil boleh sedikit lebih besar
      toast.error("Ukuran foto maksimal 5 MB");
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(f, 800);
      setEditForm((p) => ({ ...p, photo: dataUrl }));
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat foto profil");
    }
  };

  const handleSaveEdit = () => {
    setUsers((p) => p.map((u) => (u.username === editTarget ? { ...u, ...editForm } : u)));
    if (currentUser?.username === editTarget) setCurrentUser((p: any) => ({ ...p, ...editForm }));
    setIsEditOpen(false);
    toast.success("Perubahan profil tersimpan");
  };

  const handleDeleteConfirm = (usernameToDelete: string) => {
    setConfirmDelete({ open: true, username: usernameToDelete });
    setOpenMenu(null);
  };
  const doDeleteConfirmed = () => {
    setUsers((p) => p.filter((u) => u.username !== confirmDelete.username));
    setReports((p) => {
      const copy = { ...p };
      delete copy[confirmDelete.username as string];
      return copy;
    });
    toast.success(`Anggota ${confirmDelete.username} dihapus`);
    setConfirmDelete({ open: false, username: null });
  };

  /* ---------------- Mapping ---------------- */
  const saveMappingForCurrentPeriod = (data: any) => {
    setMappingStorage((prev: any) => {
      const copy = { ...prev };
      if (!copy[year]) copy[year] = {};
      copy[year][month] = data;
      return copy;
    });
  };

  /* ---------------- UPDATED handleUpload: store blobs in IDB + metadata in localStorage ---------------- */
  const handleUpload = async (event: any, regionIndex: number) => {
    const files: File[] = Array.from(event.target.files || []);
    if (files.some((f) => f.size > 8 * 1024 * 1024)) {
      toast.error("Ukuran foto maksimal 8 MB per file.");
      return;
    }

    try {
      // Reserve slots and persist metadata first
      setMappingData((prev: any) => {
        const updated = prev.map((r: any) => ({ ...r, photos: [...r.photos] }));
        let insertIndex = 0;
        files.forEach(() => {
          while (insertIndex < 23 && updated[regionIndex].photos[insertIndex]) insertIndex++;
          if (insertIndex < 23) {
            updated[regionIndex].photos[insertIndex] = null; // placeholder
            insertIndex++;
          }
        });
        saveMappingForCurrentPeriod(updated);
        return updated;
      });

      for (const file of files) {
        const dataUrl = await fileToResizedDataUrl(file, 1200);
        const res = await fetch(dataUrl);
        const blob = await res.blob();

        // find next available slot index for this region
        let slot = -1;
        setMappingData((prev: any) => {
          const updated = prev.map((r: any) => ({ ...r, photos: [...r.photos] }));
          let idx = 0;
          while (idx < 23 && updated[regionIndex].photos[idx]) idx++;
          if (idx < 23) {
            slot = idx;
            updated[regionIndex].photos[idx] = null; // placeholder
          }
          saveMappingForCurrentPeriod(updated);
          return updated;
        });

        if (slot === -1) break; // region full

        const key = imageKey(year, month, regionIndex, slot);
        await idbPut(key, blob);

        const objectUrl = URL.createObjectURL(blob);

        setMappingData((prev: any) => {
          const updated = prev.map((r: any) => ({ ...r, photos: [...r.photos] }));
          updated[regionIndex].photos[slot] = objectUrl;
          saveMappingForCurrentPeriod(updated);
          const uploaded = updated.reduce((a: number, r: any) => a + r.photos.filter(Boolean).length, 0);
          setProgress((uploaded / (KABUPATEN.length * 23)) * 100);
          return updated;
        });
      }

      toast.success("Upload foto berhasil!");
    } catch (err) {
      console.error("upload error", err);
      toast.error("Gagal mengunggah foto");
    }
  };

  const handleSaveMapping = () => {
    saveMappingForCurrentPeriod(mappingData);
    toast.success("Data mapping tersimpan untuk periode ini");
  };

  const handleDeleteAllMapping = async () => {
    // revoke object URLs currently in mappingData
    mappingData.forEach((r: any, regionIndex: number) => {
      r.photos.forEach((p: string | null, i: number) => {
        try {
          if (p && p.startsWith("blob:")) URL.revokeObjectURL(p);
        } catch (e) {}
      });
    });

    // delete IDB entries for current period
    try {
      for (let regionIndex = 0; regionIndex < KABUPATEN.length; regionIndex++) {
        for (let i = 0; i < 23; i++) {
          const key = imageKey(year, month, regionIndex, i);
          // eslint-disable-next-line no-await-in-loop
          await idbDelete(key);
        }
      }
    } catch (e) {
      console.error("delete idb entries", e);
    }

    const empty = KABUPATEN.map((name) => ({ region: name, photos: Array(23).fill(null) }));
    setMappingData(empty);
    setMappingStorage((prev: any) => {
      const copy = { ...prev };
      if (copy[year]) {
        copy[year] = { ...copy[year] };
        delete copy[year][month];
      }
      return copy;
    });
    setProgress(0);
    toast.success("Semua data mapping dihapus untuk periode ini");
  };

  /* ---------------- Report (laporan) ---------------- */
  const getReport = (usernameKey: string, y: string, m: string) => reports?.[usernameKey]?.[y]?.[m] || null;

  const handleReportFileChoose = (e: any, memberUsername: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingUploads((p) => ({ ...p, [memberUsername]: f.name }));
  };

  const openSendConfirm = (memberUsername: string) => {
    const filename = pendingUploads[memberUsername];
    if (!filename) {
      toast.error("Pilih file terlebih dahulu");
      return;
    }
    setConfirmSend({ open: true, username: memberUsername, filename });
  };

  const doSendConfirmed = () => {
    const u = confirmSend.username as string;
    const filename = confirmSend.filename as string;
    setReports((prev) => {
      const copy = { ...prev };
      if (!copy[u]) copy[u] = {};
      if (!copy[u][year]) copy[u][year] = {};
      copy[u][year][month] = { filename, status: "Terkirim" };
      return copy;
    });
    setPendingUploads((p) => {
      const c = { ...p };
      delete c[u];
      return c;
    });
    toast.success(`Laporan ${filename} berhasil dikirim untuk ${u}`);
    setConfirmSend({ open: false, username: null, filename: null });
  };

  const handleReplaceReport = (e: any, memberUsername: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReports((prev) => {
      const copy = { ...prev };
      if (!copy[memberUsername]) copy[memberUsername] = {};
      if (!copy[memberUsername][year]) copy[memberUsername][year] = {};
      copy[memberUsername][year][month] = { filename: f.name, status: "Terkirim" };
      return copy;
    });
    setPendingUploads((p) => {
      const c = { ...p };
      delete c[memberUsername];
      return c;
    });
    toast.success("Laporan berhasil diganti dan dikirim langsung");
  };

  /* ---------------- Export Laporan (Excel & PDF) ---------------- */
  const handleDownloadExcel = () => {
    try {
      const rows = users.map((u) => {
        const info = reports?.[u.username]?.[year]?.[month];
        return { "Nama Anggota": u.name, "Status Laporan": info?.status || "Belum Dikirim", "File": info?.filename || "-" };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${month}_${year}`);
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      downloadBlob(blob, `Laporan_${month}_${year}.xlsx`);
      toast.success(`Laporan ${month} ${year} berhasil diunduh!`);
    } catch (e) {
      console.error(e);
      toast.error("Gagal mengekspor Excel");
    }
  };

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFont("times", "normal");
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginTop = 40;
      const title = "LAPORAN BULANAN TELEKOLEKTING KC TONDANO";
      const subTitle = `PERIODE: ${month.toUpperCase()} ${year}`;
      doc.setFontSize(16);
      doc.text(title, pageWidth / 2, marginTop + 20, { align: "center" });
      doc.setFontSize(12);
      doc.text(subTitle, pageWidth / 2, marginTop + 40, { align: "center" });

      const rows = users.map((u) => {
        const info = reports?.[u.username]?.[year]?.[month];
        return [u.name, info?.status || "Belum Dikirim", info?.filename || "-"];
      });

      autoTable(doc, {
        startY: marginTop + 70,
        head: [["Nama Anggota", "Status Laporan", "File"]],
        body: rows,
        styles: { font: "times", fontSize: 11, cellPadding: 6 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
        theme: "grid",
        margin: { left: 40, right: 40 },
      });

      doc.save(`Laporan_${month}_${year}.pdf`);
      toast.success(`Laporan ${month} ${year} berhasil diunduh!`);
    } catch (e) {
      console.error(e);
      toast.error("Gagal mengekspor PDF");
    }
  };

  /* ---------------- Export Bukti Mapping (Excel & PDF) ---------------- */
  const handleDownloadMappingExcel = () => {
    try {
      const rows = mappingData.map((row: any) => ({ "Kabupaten/Kota": row.region, "Jumlah Foto": `${row.photos.filter(Boolean).length}/23` }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${month}_${year}`);
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      downloadBlob(blob, `BuktiMapping_${month}_${year}.xlsx`);
      toast.success(`Bukti Mapping ${month} ${year} berhasil diunduh!`);
    } catch (e) {
      console.error(e);
      toast.error("Gagal mengekspor Bukti Mapping");
    }
  };

  const handleDownloadMappingPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFont("times", "normal");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginTop = 40;
      const leftMargin = 40;
      const usableWidth = pageWidth - leftMargin * 2;
      const colGap = 12;
      const cols = 3;
      const colWidth = (usableWidth - colGap * (cols - 1)) / cols;

      const title = "BUKTI MAPPING TELEKOLEKTING KC TONDANO";
      const subTitle = `PERIODE: ${month.toUpperCase()} ${year}`;
      doc.setFontSize(16);
      doc.text(title, pageWidth / 2, marginTop + 20, { align: "center" });
      doc.setFontSize(12);
      doc.text(subTitle, pageWidth / 2, marginTop + 40, { align: "center" });

      let y = marginTop + 70;

      for (let r = 0; r < mappingData.length; r++) {
        const region = mappingData[r];
        doc.setFontSize(12);
        doc.setFont("times", "bold");
        doc.text(region.region, leftMargin, y);
        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.text(`${region.photos.filter(Boolean).length}/23 Foto`, leftMargin + 240, y);
        y += 18;

        const photos = region.photos.filter(Boolean);
        if (photos.length > 0) {
          for (let i = 0; i < photos.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = leftMargin + col * (colWidth + colGap);
            const yy = y + row * (120 + 8);

            if (yy + 120 > pageHeight - 60) {
              doc.addPage();
              y = marginTop + 70;
            }

            // eslint-disable-next-line no-await-in-loop
            const dataUrl = await imgUrlToDataUrl(photos[i], 120);
            if (dataUrl) {
              const imgProps = doc.getImageProperties(dataUrl);
              const imgRatio = imgProps.width / imgProps.height;
              const imgH = Math.min(120, imgProps.height);
              const imgW = imgH * imgRatio;
              const offsetX = x + (colWidth - imgW) / 2;
              doc.addImage(dataUrl, "JPEG", offsetX, yy, imgW, imgH);
            }
          }
          const rowsUsed = Math.ceil(photos.length / cols);
          y += rowsUsed * (120 + 8) + 8;
        } else {
          y += 8;
        }

        if (y + 20 > pageHeight - 60) {
          doc.addPage();
          y = marginTop + 70;
        }
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(leftMargin, y, pageWidth - leftMargin, y);
        y += 14;
      }

      doc.save(`BuktiMapping_${month}_${year}.pdf`);
      toast.success(`Bukti Mapping ${month} ${year} berhasil diunduh!`);
    } catch (e) {
      console.error(e);
      toast.error("Gagal mengekspor Bukti Mapping");
    }
  };

  /* ---------------- Derived helpers ---------------- */
  const isAdmin = currentUser?.role === "Admin";

  /*/* ---------------- Render login or app ---------------- */
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-6">
        <Card className="w-full max-w-md shadow-xl p-6">
          <CardHeader className="text-center">
            {/* Logo BPJS */}
            <img src="/logo.png" alt="Logo BPJS Kesehatan" className="w-24 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-blue-700 mb-2">Login Telekolekting KC Tondano</h1>
            <p className="text-gray-500">Masukkan akun Anda untuk melanjutkan</p>
          </CardHeader>

          <CardContent>
            <Input
              placeholder="Username"
              className="mb-3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              placeholder="Password"
              type="password"
              className="mb-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button className="w-full bg-blue-600 text-white" onClick={handleLogin}>
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <Toaster />
      <header className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-700">📸 TELEKOLEKTING KC TONDANO</h1>
          <p className="text-sm text-gray-500">Sistem Upload Data Foto Regional</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setActiveTab("anggota")}>🏠 Home</Button>
          <Button variant="outline" onClick={() => setActiveTab("laporan")}>📑 Laporan</Button>
          <Button variant="outline" onClick={() => setActiveTab("mapping")}>🗺️ Mapping</Button>
          <Button className="bg-red-500 text-white" onClick={handleLogout}>Logout</Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="flex flex-wrap gap-2 mb-6">
          <TabsTrigger value="anggota">👥 Anggota</TabsTrigger>
          <TabsTrigger value="laporan">📑 Laporan</TabsTrigger>
          <TabsTrigger value="mapping">🗺️ Mapping</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {activeTab === "anggota" && (
            <motion.div key="anggota" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="shadow-md">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-blue-600">👥 Daftar Anggota Tim</h2>
                  <p className="text-gray-500">Berikut anggota Telekolekting KC Tondano</p>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    {users.filter((u) => u.role === "Anggota").map((user) => (
                      <div key={user.username} className="relative text-center bg-white rounded-xl shadow p-4">
                        {isAdmin && (
                          <div className="absolute top-3 right-3" tabIndex={0} onBlur={() => setOpenMenu(null)}>
                            <button onClick={() => setOpenMenu(openMenu === user.username ? null : user.username)} className="p-1 rounded-full hover:bg-gray-100">
                              <MoreVertical size={18} />
                            </button>
                            <AnimatePresence>
                              {openMenu === user.username && (
                                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute right-0 mt-2 bg-white shadow-lg rounded-md py-1 w-44 z-50">
                                  <button onClick={() => openEditModal(user)} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">✏️ Edit Profil</button>
                                  <button onClick={() => handleDeleteConfirm(user.username)} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100">🗑️ Hapus Anggota</button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                        <img src={user.photo || DEFAULT_AVATAR} alt={user.name} className="w-24 h-24 mx-auto object-cover rounded-full mb-2 border" />
                        <h3 className="font-semibold text-gray-800">{user.name}</h3>
                        <p className="text-gray-500 text-sm">Telekolekting KC Tondano</p>
                      </div>
                    ))}
                  </div>

                  {isAdmin && (
                    <div className="bg-gray-100 p-4 rounded-lg border-t border-gray-300">
                      <h3 className="text-lg font-semibold text-blue-600 mb-2">➕ Tambah Anggota Baru</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <Input placeholder="Nama Lengkap" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                        <Input placeholder="Username" value={newMember.username} onChange={(e) => setNewMember({ ...newMember, username: e.target.value })} />
                        <Input placeholder="Password" type="password" value={newMember.password} onChange={(e) => setNewMember({ ...newMember, password: e.target.value })} />
                      </div>
                      <Button className="bg-green-600 text-white" onClick={handleAddMember}>Tambah Anggota</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "laporan" && (
            <motion.div key="laporan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="shadow-md">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-blue-600">📑 Upload Laporan Bulanan</h2>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <label className="font-medium text-gray-600">Pilih Bulan:</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className="border p-2 rounded-md">
                      {MONTHS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <select value={year} onChange={(e) => setYear(e.target.value)} className="border p-2 rounded-md">
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>

                  {users.filter((u) => u.role === "Anggota").map((member) => {
                    const r = getReport(member.username, year, month);
                    const pending = pendingUploads[member.username];
                    return (
                      <div key={member.username} className="flex items-center justify-between mb-4 bg-white rounded-md shadow p-3">
                        <div>
                          <div className="font-semibold text-gray-700">Laporan {member.name}</div>
                          <div className="text-sm text-gray-500">{r ? `File: ${r.filename}` : (pending ? `File siap: ${pending}` : 'Belum upload')}</div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => handleReportFileChoose(e, member.username)} />

                          {pending ? (
                            <Button className="bg-blue-600 text-white" onClick={() => openSendConfirm(member.username)}>Kirim Laporan</Button>
                          ) : (
                            <label className="cursor-pointer">
                              <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => handleReplaceReport(e, member.username)} />
                              <Button className="bg-gray-200">Upload & Kirim Langsung</Button>
                            </label>
                          )}

                          <div className="text-sm">
                            {r ? <span className="text-green-600">🟢 Terkirim</span> : <span className="text-yellow-500">🟡 Belum dikirim</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex gap-3 mt-4">
                    <Button className="bg-green-500 text-white" onClick={handleDownloadExcel}>Download Excel</Button>
                    <Button className="bg-blue-500 text-white" onClick={handleDownloadPDF}>Download PDF</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === "mapping" && (
            <motion.div key="mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="shadow-md">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-blue-600">🗺️ Bukti Mapping Regional</h2>
                  <p className="text-gray-500">Unggah foto hasil mapping berdasarkan kabupaten/kota (23 foto per kabupaten)</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <label className="font-medium text-gray-600">Pilih Bulan:</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className="border p-2 rounded-md">
                      {MONTHS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <select value={year} onChange={(e) => setYear(e.target.value)} className="border p-2 rounded-md">
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-blue-100">
                          <TableHead>Kabupaten/Kota</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Upload</TableHead>
                          {[...Array(23)].map((_, i) => <TableHead key={i}>Bulan {i + 2}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappingData.map((row: any, regionIndex: number) => {
                          const uploadedCount = row.photos.filter(Boolean).length;
                          const color = uploadedCount === 0 ? "text-red-500" : uploadedCount < 23 ? "text-yellow-500" : "text-green-600";
                          return (
                            <TableRow key={regionIndex}>
                              <TableCell className="font-semibold">{row.region}</TableCell>
                              <TableCell className={`text-sm ${color}`}>{uploadedCount}/23 foto</TableCell>
                              <TableCell>
                                <Button asChild>
                                  <label>
                                    Upload
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e, regionIndex)} />
                                  </label>
                                </Button>
                              </TableCell>
                              {row.photos.map((photo: string | null, i: number) => (
                                <TableCell key={i} className="text-center">
                                  {photo ? <img src={photo} className="w-16 h-16 object-contain mx-auto rounded-md" /> : <span className="text-xs text-gray-400">Belum ada foto</span>}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <Button className="bg-red-500 text-white" onClick={handleDeleteAllMapping}>Hapus Semua Data</Button>
                    <Button className="bg-blue-600 text-white" onClick={handleSaveMapping}>Simpan Data</Button>
                    <Button className="bg-green-500 text-white" onClick={handleDownloadMappingExcel}>Download Excel</Button>
                    <Button className="bg-blue-500 text-white" onClick={handleDownloadMappingPDF}>Download PDF</Button>
                  </div>

                  <div className="mt-4">
                    <label className="text-sm font-medium text-gray-600">Progress Upload</label>
                    <Progress value={progress} className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-2xl shadow-lg w-full max-w-xl p-6">
              <h3 className="text-xl font-semibold text-blue-600 mb-3">✏️ Edit Profil Anggota</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Nama</label>
                  <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Username</label>
                  <Input value={editForm.username} onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Password</label>
                  <Input type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Foto Profil</label>
                  <div className="flex items-center gap-3">
                    <img src={editForm.photo || DEFAULT_AVATAR} alt="preview" className="w-20 h-20 rounded-full object-cover border" />
                    <Input type="file" accept="image/*" onChange={handleEditPhotoChange} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                <Button className="bg-blue-600 text-white" onClick={handleSaveEdit}>Simpan Perubahan</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Send */}
      <AnimatePresence>
        {confirmSend.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-blue-600 mb-2">Konfirmasi Kirim Laporan</h3>
              <p className="text-gray-600">Apakah Anda yakin ingin mengirim <span className="font-medium">{confirmSend.filename}</span> untuk <span className="font-medium">{confirmSend.username}</span> — <span className="font-medium">{month} {year}</span>?</p>
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setConfirmSend({ open: false, username: null, filename: null })}>Batal</Button>
                <Button className="bg-blue-600 text-white" onClick={doSendConfirmed}>Kirim</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Delete */}
      <AnimatePresence>
        {confirmDelete.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Konfirmasi Hapus</h3>
              <p className="text-gray-600">Apakah Anda yakin ingin menghapus anggota <span className="font-medium">{confirmDelete.username}</span>?</p>
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setConfirmDelete({ open: false, username: null })}>Batal</Button>
                <Button className="bg-red-600 text-white" onClick={doDeleteConfirmed}>Ya, Hapus</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
