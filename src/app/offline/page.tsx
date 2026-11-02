export default function OfflinePage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
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
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-6.364-2.636m0 0L3 21m0-18l18 18M3 3l2.829 2.829M9.879 9.879a5 5 0 00-1.414 3.535"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white mb-2">
          You&apos;re offline
        </h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Check your connection and retry. Fleet tracking and cached vehicle data will resume once you are reconnected.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors duration-150 shadow-sm"
          >
            Retry Connection
          </a>
        </div>
      </div>
    </div>
  );
}
