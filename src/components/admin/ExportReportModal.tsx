'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface LocationItem {
  id: string;
  name: string;
  code: string;
}

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations?: LocationItem[];
}

export function ExportReportModal({ isOpen, onClose, locations = [] }: ExportReportModalProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const toYMD = (d: Date) => d.toISOString().split('T')[0];

  const firstDayThisMonth = toYMD(new Date(currentYear, currentMonth, 1));
  const lastDayThisMonth = toYMD(new Date(currentYear, currentMonth + 1, 0));

  const [periodPreset, setPeriodPreset] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'CUSTOM'>('THIS_MONTH');
  const [startDate, setStartDate] = useState(firstDayThisMonth);
  const [endDate, setEndDate] = useState(lastDayThisMonth);
  const [status, setStatus] = useState('ALL');
  const [serviceType, setServiceType] = useState('ALL');
  const [locationId, setLocationId] = useState('ALL');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'CUSTOM') => {
    setPeriodPreset(preset);
    if (preset === 'THIS_MONTH') {
      setStartDate(firstDayThisMonth);
      setEndDate(lastDayThisMonth);
    } else if (preset === 'LAST_MONTH') {
      const firstDayLastMonth = toYMD(new Date(currentYear, currentMonth - 1, 1));
      const lastDayLastMonth = toYMD(new Date(currentYear, currentMonth, 0));
      setStartDate(firstDayLastMonth);
      setEndDate(lastDayLastMonth);
    } else if (preset === 'LAST_30_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(toYMD(d));
      setEndDate(toYMD(now));
    }
  };

  const handleDownload = async () => {
    if (!startDate || !endDate) {
      setError('Tanggal mulai dan tanggal akhir wajib diisi');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Tanggal mulai tidak boleh lebih besar dari tanggal akhir');
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status,
        serviceType,
        locationId,
      });

      const res = await fetch(`/api/admin/reports/excel?${params.toString()}`);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error?.message || 'Gagal mengunduh laporan excel');
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      let filename = `Laporan_Perjalanan_KCIC_${startDate}_sd_${endDate}.xlsx`;
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      onClose();
    } catch {
      setError('Terjadi kendala jaringan saat mengunduh laporan');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isDownloading) onClose();
      }}
      title="Download Laporan Operasional Excel"
      description="Rekapitulasi perjalanan armada KCIC, driver, tracking jarak, dan foto fisik dokumen Nota Dinas"
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Quick Period Presets */}
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-black mb-1.5">
            Pilihan Cepat Periode Laporan
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'THIS_MONTH', label: 'Bulan Ini' },
              { id: 'LAST_MONTH', label: 'Bulan Lalu' },
              { id: 'LAST_30_DAYS', label: '30 Hari Terakhir' },
              { id: 'CUSTOM', label: 'Kustom' },
            ].map((p) => {
              const active = periodPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id as any)}
                  className={`py-1.5 px-2 text-xs font-bold rounded-lg border-2 border-black transition-all cursor-pointer ${
                    active
                      ? 'bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-white text-zinc-800 hover:bg-zinc-100 shadow-[1px_1px_0px_0px_#000]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-zinc-50 border-2 border-black rounded-xl">
          <div>
            <label htmlFor="startDate" className="block text-[11px] font-bold text-zinc-900 mb-1">
              Tanggal Mulai <span className="text-[#be123c]">*</span>
            </label>
            <input
              id="startDate"
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('CUSTOM');
              }}
              className="w-full px-2.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-[11px] font-bold text-zinc-900 mb-1">
              Tanggal Selesai <span className="text-[#be123c]">*</span>
            </label>
            <input
              id="endDate"
              type="date"
              required
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('CUSTOM');
              }}
              className="w-full px-2.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="filterStatus" className="block text-[11px] font-bold text-zinc-800 mb-1">
              Status Perjalanan
            </label>
            <select
              id="filterStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-semibold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="ALL">Semua Status</option>
              <option value="COMPLETED">Selesai (Completed)</option>
              <option value="PENDING_COMPLETION">Menunggu Nota Dinas</option>
              <option value="IN_PROGRESS">Sedang Berjalan</option>
              <option value="APPROVED">Disetujui / Terjadwal</option>
              <option value="CANCELLED">Dibatalkan</option>
              <option value="REJECTED">Ditolak</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterServiceType" className="block text-[11px] font-bold text-zinc-800 mb-1">
              Tipe Layanan
            </label>
            <select
              id="filterServiceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-semibold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="ALL">Semua Layanan</option>
              <option value="DROP_OFF">Drop Off (Sekali Jalan)</option>
              <option value="STANDBY">Standby (Operasional)</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterLocation" className="block text-[11px] font-bold text-zinc-800 mb-1">
              Hub Operasional
            </label>
            <select
              id="filterLocation"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-semibold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="ALL">Semua Hub</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-rose-900">
            <Icon name="check" className="size-4 text-emerald-700" />
            <span>Format Excel Khusus KCIC Fleet (.xlsx)</span>
          </div>
          <p className="text-[11px] text-zinc-700">
            Laporan didesain rapi dengan palet resmi KCIC, KPI ringkasan, rincian pengemudi/kendaraan, jarak tempuh GPS, status verifikasi, serta <span className="font-bold text-zinc-900 underline">foto fisik Nota Dinas</span> yang langsung tersemat di dalam sel Excel (dapat diklik untuk memperbesar ukuran asli).
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-3.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-700 hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-4 py-1.5 text-xs font-black rounded-lg border-2 border-black bg-emerald-600 text-white shadow-[2px_2px_0px_0px_#000] hover:bg-emerald-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isDownloading ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>Menyiapkan Excel...</span>
              </>
            ) : (
              <>
                <Icon name="download" className="size-3.5" />
                <span>Unduh Laporan Excel</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
