'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { CheckCircle2, Download } from 'lucide-react';
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
      title="Unduh laporan operasional Excel"
      description="Rekapitulasi perjalanan armada KCIC, driver, tracking jarak GPS, dan lampiran fisik Nota Dinas"
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Period presets */}
        <div>
          <span className="metric-label mb-1.5 block">Pilihan cepat periode</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              { id: 'THIS_MONTH', label: 'Bulan ini' },
              { id: 'LAST_MONTH', label: 'Bulan lalu' },
              { id: 'LAST_30_DAYS', label: '30 hari' },
              { id: 'CUSTOM', label: 'Kustom' },
            ].map((p) => {
              const active = periodPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id as any)}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-[0.6875rem] font-semibold transition-colors ${
                    active
                      ? 'border-[var(--slate-navy)] bg-[var(--slate-navy)] text-white'
                      : 'border-[var(--border)] bg-white text-slate-700 hover:border-[var(--border-strong)]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="metric-label mb-1 block">
              Tanggal mulai <span className="text-[var(--kcic-red)]">*</span>
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
            />
          </div>
          <div>
            <label htmlFor="endDate" className="metric-label mb-1 block">
              Tanggal selesai <span className="text-[var(--kcic-red)]">*</span>
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
            />
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="filterStatus" className="metric-label mb-1 block">
              Status perjalanan
            </label>
            <select id="filterStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Semua status</option>
              <option value="COMPLETED">Selesai</option>
              <option value="PENDING_COMPLETION">Menunggu nota dinas</option>
              <option value="IN_PROGRESS">Sedang berjalan</option>
              <option value="APPROVED">Disetujui / terjadwal</option>
              <option value="CANCELLED">Dibatalkan</option>
              <option value="REJECTED">Ditolak</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterServiceType" className="metric-label mb-1 block">
              Tipe layanan
            </label>
            <select
              id="filterServiceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            >
              <option value="ALL">Semua layanan</option>
              <option value="DROP_OFF">Drop off (sekali jalan)</option>
              <option value="STANDBY">Standby (operasional)</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterLocation" className="metric-label mb-1 block">
              Hub operasional
            </label>
            <select
              id="filterLocation"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="ALL">Semua hub</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Info */}
        <div className="flex gap-2.5 rounded-[var(--radius-lg)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] p-3.5">
          <CheckCircle2
            className="mt-px size-4 shrink-0 text-[var(--status-active-fg)]"
            strokeWidth={1.9}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold text-[var(--status-active-fg)]">
              Format resmi KCIC Fleet (.xlsx)
            </p>
            <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-[var(--status-active-fg)]/85">
              Laporan menyajikan KPI rekapitulasi, data pengemudi &amp; armada, odometer, jarak GPS,
              serta foto fisik Nota Dinas yang tersemat di dalam dokumen.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="button-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="button-primary"
          >
            {isDownloading ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>Menyiapkan dokumen…</span>
              </>
            ) : (
              <>
                <Download className="size-4" strokeWidth={1.9} aria-hidden="true" />
                <span>Unduh laporan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
