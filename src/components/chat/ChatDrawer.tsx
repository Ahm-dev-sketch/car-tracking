'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId?: string | null;
  tripId?: string | null;
  currentUserId: string;
  currentUserName?: string;
  currentUserRole?: 'USER' | 'DRIVER' | 'ADMIN';
  partnerId?: string | null;
  partnerName: string;
  partnerRole?: string;
  onStartCall?: (partnerId: string, partnerName: string, partnerRole?: string) => void;
  messages: ReturnType<typeof useRealtimeChat>['messages'];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string, receiverId?: string | null) => Promise<void>;
}

const DRIVER_CHIPS = [
  'Saya sudah sampai di titik jemput',
  'Sedang menuju lokasi penjemputan',
  'Mohon tunggu sebentar ya pak/bu',
  'Saya menunggu dekat lobi utama',
  'Perjalanan kita mulai ya',
];

const USER_CHIPS = [
  'Saya sedang menuju ke mobil',
  'Tunggu sebentar, sedang turun lift',
  'Saya tunggu di dekat pintu lobi',
  'Mobilnya parkir di sebelah mana ya pak?',
  'Saya sudah di titik jemput',
];

const ROLE_LABEL: Record<string, string> = {
  DRIVER: 'Driver Operasional',
  ADMIN: 'Dispatcher Admin',
  USER: 'Penumpang',
};

export function ChatDrawer({
  isOpen,
  onClose,
  partnerId,
  partnerName,
  partnerRole = 'Driver',
  currentUserRole = 'USER',
  currentUserId,
  onStartCall,
  messages,
  isLoading,
  isSending,
  error,
  sendMessage,
}: ChatDrawerProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeChips = currentUserRole === 'DRIVER' ? DRIVER_CHIPS : USER_CHIPS;

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto scroll to bottom on new message or when opened
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText;
    setInputText('');
    await sendMessage(textToSend, partnerId);
  };

  const handleQuickChip = (chip: string) => {
    sendMessage(chip, partnerId);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-xs animate-in fade-in duration-200 sm:items-center sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Chat dengan ${partnerName}`}
    >
      <div
        className="flex h-[86dvh] max-h-[640px] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white animate-in zoom-in-95 duration-200 sm:h-[620px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-semibold tracking-wide text-white tabular-nums">
              {partnerName.slice(0, 2).toUpperCase() || 'KC'}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                {partnerName}
              </h2>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="relative inline-flex size-1.5 shrink-0 rounded-full" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-success-600" />
                  <span className="absolute inset-0 rounded-full bg-success-600 status-ping" />
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {ROLE_LABEL[partnerRole] || ROLE_LABEL[partnerRole.toUpperCase()] || partnerRole}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {onStartCall && partnerId && (
              <button
                type="button"
                onClick={() => onStartCall(partnerId, partnerName, partnerRole)}
                title="Panggilan Suara In-App"
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                <Icon name="phone" className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Tutup Obrolan"
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto bg-slate-50/80">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
              <Spinner size="md" />
              <p className="text-xs font-medium">Memuat percakapan real-time...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name="message" className="size-6" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">Mulai Percakapan</h3>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
                Kirim pesan langsung ke {partnerName} terkait penjemputan, armada, atau konfirmasi perjalanan
                tanpa membagikan nomor pribadi.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 p-4">
              {messages.map((m) => {
                const formattedTime = new Date(m.created_at).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                // Voice-call history entries render as a centred system pill.
                // Older rows may carry a leading emoji marker; strip any such prefix.
                const callText = m.message.replace(
                  /^[\p{Extended_Pictographic}\p{Emoji}\uFE0F\u200D\s]+/u,
                  ''
                );
                if (callText.startsWith('Panggilan')) {
                  const lower = callText.toLowerCase();
                  const isMissed = lower.includes('tak terjawab') || lower.includes('ditolak');
                  return (
                    <div key={m.id} className="flex justify-center py-1">
                      <div
                        className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                          isMissed
                            ? 'border-danger-200 bg-danger-50 text-danger-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <Icon name="phoneOff" className="size-3.5 shrink-0" />
                        <span className="truncate">{callText}</span>
                        <span className="font-mono text-[10px] tabular-nums opacity-60">{formattedTime}</span>
                      </div>
                    </div>
                  );
                }

                const isMe = m.sender_id === currentUserId;

                const tick = !isMe
                  ? null
                  : m.is_read
                    ? { name: 'checkCheck' as const, title: 'Dibaca', className: 'text-brand-600' }
                    : m.delivered === false
                      ? { name: 'clock' as const, title: 'Tertunda · pengemudi offline', className: 'text-amber-500' }
                      : { name: 'check' as const, title: 'Terkirim', className: 'text-slate-400' };

                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl border px-3.5 py-2.5 ${
                        isMe
                          ? 'rounded-br-md border-brand-200 bg-brand-50'
                          : 'rounded-bl-md border-slate-200 bg-white'
                      }`}
                    >
                      {!isMe && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          {m.sender_name || partnerName}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800">
                        {m.message}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
                        <span className="font-mono tabular-nums text-slate-400">{formattedTime}</span>
                        {isMe && tick && (
                          <span title={tick.title} className={tick.className}>
                            <Icon name={tick.name} className="size-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Quick reply chips */}
        <div className="border-t border-slate-200 bg-white px-3 py-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChip(chip)}
                className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
          {error && (
            <p className="mb-2 flex items-center gap-1.5 truncate text-[11px] font-medium text-danger-700">
              <Icon name="alert" className="size-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Tulis pesan ke ${partnerName}...`}
              className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              aria-label="Kirim pesan"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? <Spinner size="sm" /> : <Icon name="send" className="size-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
