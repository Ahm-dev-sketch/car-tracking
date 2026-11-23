export default function OfflinePage() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-zinc-900 font-sans">
      <div className="surface max-w-md w-full p-8 sm:p-10 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-3xl bg-emerald-50 flex items-center justify-center text-emerald-700">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.4}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-6.364-2.636m0 0L3 21m0-18l18 18M3 3l2.829 2.829M9.879 9.879a5 5 0 00-1.414 3.535"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-900 mb-3">
          You&apos;re offline
        </h1>
        <p className="text-sm text-zinc-500 mb-7 leading-relaxed">
          Check your connection and retry. Fleet tracking and cached vehicle data will resume once you are reconnected.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/"
            className="button-primary w-full sm:w-auto"
          >
            Try again
          </a>
        </div>
      </div>
    </div>
  );
}
