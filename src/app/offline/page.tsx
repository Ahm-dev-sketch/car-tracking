import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[var(--canvas)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-slate-900">
      <div className="w-full max-w-sm rounded-[var(--radius-2xl)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-500">
          <WifiOff className="size-6" strokeWidth={1.6} aria-hidden="true" />
        </span>

        <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">Koneksi terputus</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Periksa jaringan internet Anda. Pelacakan armada live dan sinkronisasi data akan
          dilanjutkan otomatis saat Anda terhubung kembali.
        </p>

        <Link href="/" className="button-primary mt-6 w-full">
          Coba lagi
        </Link>

        <p className="mt-4 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-slate-400">
          KCIC Fleet · Data aman di perangkat
        </p>
      </div>
    </div>
  );
}
