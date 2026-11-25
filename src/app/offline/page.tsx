import { Icon } from '@/components/ui/Icon';
import { getDictionary } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n/server';

export default async function OfflinePage() {
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-slate-50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] font-sans text-slate-900">
      <div className="surface w-full max-w-md p-8 text-center sm:p-10">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600">
          <Icon name="wifi" className="size-7" />
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {t.offline.eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{t.offline.title}</h1>
        <p className="mx-auto mb-7 mt-2.5 max-w-xs text-sm leading-relaxed text-slate-500">
          {t.offline.description}
        </p>

        <a href="/" className="button-primary w-full">
          {t.offline.retry}
        </a>

        <div className="mt-7 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-[11px] font-medium text-slate-400">
          <Icon name="shield" className="size-3.5 shrink-0" />
          <span>{t.offline.footerNote}</span>
        </div>
      </div>
    </main>
  );
}
