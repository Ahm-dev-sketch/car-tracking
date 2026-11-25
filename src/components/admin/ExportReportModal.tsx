'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useTranslation } from '@/components/providers/LanguageProvider';

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
  const { t } = useTranslation();
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
      setError(t.admin.exportModal.validationDatesRequired);
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError(t.admin.exportModal.validationDateOrder);
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
        setError(json.error?.message || t.admin.exportModal.errorDownload);
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
      setError(t.admin.exportModal.errorNetwork);
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
      title={t.admin.exportModal.title}
      description={t.admin.exportModal.description}
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Quick Period Presets */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {t.admin.exportModal.quickPeriodLabel}
          </label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              { id: 'THIS_MONTH', label: t.admin.exportModal.presetThisMonth },
              { id: 'LAST_MONTH', label: t.admin.exportModal.presetLastMonth },
              { id: 'LAST_30_DAYS', label: t.admin.exportModal.presetLast30Days },
              { id: 'CUSTOM', label: t.admin.exportModal.presetCustom },
            ].map((p) => {
              const active = periodPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id as any)}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="mb-1 block text-[11px] font-medium text-slate-700">
              {t.admin.exportModal.fromDate} <span className="text-brand-500">*</span>
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1 block text-[11px] font-medium text-slate-700">
              {t.admin.exportModal.toDate} <span className="text-brand-500">*</span>
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
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="filterStatus" className="mb-1 block text-[11px] font-medium text-slate-700">
              {t.admin.exportModal.statusLabel}
            </label>
            <select
              id="filterStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="ALL">{t.admin.exportModal.allStatuses}</option>
              <option value="COMPLETED">{t.admin.exportModal.optCompleted}</option>
              <option value="PENDING_COMPLETION">{t.admin.exportModal.optPendingNota}</option>
              <option value="IN_PROGRESS">{t.admin.exportModal.optInProgress}</option>
              <option value="APPROVED">{t.admin.exportModal.optApproved}</option>
              <option value="CANCELLED">{t.admin.exportModal.optCancelled}</option>
              <option value="REJECTED">{t.admin.exportModal.optRejected}</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterServiceType" className="mb-1 block text-[11px] font-medium text-slate-700">
              {t.admin.exportModal.serviceTypeLabel}
            </label>
            <select
              id="filterServiceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="ALL">{t.admin.exportModal.allServices}</option>
              <option value="DROP_OFF">{t.admin.exportModal.dropOffOpt}</option>
              <option value="STANDBY">{t.admin.exportModal.standbyOpt}</option>
            </select>
          </div>

          <div>
            <label htmlFor="filterLocation" className="mb-1 block text-[11px] font-medium text-slate-700">
              {t.admin.exportModal.locationLabel}
            </label>
            <select
              id="filterLocation"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="ALL">{t.admin.exportModal.allLocations}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Info Box */}
        <div className="space-y-1 rounded-lg border border-info-200 bg-info-50 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-info-700">
            <Icon name="check" className="size-4 text-success-600" />
            <span>{t.admin.exportModal.infoTitle}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            {t.admin.exportModal.infoDesc}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.admin.exportModal.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>{t.admin.exportModal.preparingBtn}</span>
              </>
            ) : (
              <>
                <Icon name="download" className="size-3.5" />
                <span>{t.admin.exportModal.downloadBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
