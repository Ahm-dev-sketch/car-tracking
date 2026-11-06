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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-md flex-col border-l-[3px] border-black bg-white shadow-[-8px_0px_0px_0px_#000] animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between border-b-[2.5px] border-black bg-zinc-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-[#be123c] font-black text-white shadow-[2px_2px_0px_0px_#000]">
              {partnerName.slice(0, 2).toUpperCase() || 'KC'}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-zinc-950">{partnerName}</h3>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                  {partnerRole === 'DRIVER' ? 'Driver Operasional' : partnerRole === 'ADMIN' ? 'Dispatcher Admin' : 'Penumpang'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onStartCall && partnerId && (
              <button
                type="button"
                onClick={() => onStartCall(partnerId, partnerName, partnerRole)}
                title="Panggilan Suara In-App"
                className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-emerald-400 text-black shadow-[2px_2px_0px_0px_#000] hover:bg-emerald-300 transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
              >
                <Icon name="phone" className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-white text-zinc-700 shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-100 transition cursor-pointer"
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>
        </div>

        {/* Message Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-100/60">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center text-zinc-500">
              <Spinner size="md" className="mb-2 text-[#be123c]" />
              <p className="text-xs font-bold">Memuat percakapan real-time...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-zinc-500">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-amber-200 text-black shadow-[2px_2px_0px_0px_#000]">
                <Icon name="message" className="size-6" />
              </div>
              <h4 className="text-sm font-black text-black">Mulai Percakapan</h4>
              <p className="mt-1 text-xs text-zinc-600 max-w-xs">
                Kirim pesan langsung ke {partnerName} terkait penjemputan, armada, atau konfirmasi perjalanan tanpa membagikan nomor pribadi.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const formattedTime = new Date(m.created_at).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });

              // Special formatting for Voice Call History entry
              if (m.message.startsWith('📞 Panggilan')) {
                const isMissed = m.message.includes('Tak Terjawab') || m.message.includes('Ditolak');
                return (
                  <div key={m.id} className="flex justify-center my-1.5">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black shadow-[1.5px_1.5px_0px_0px_#000] text-[11px] font-bold ${
                        isMissed ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-950'
                      }`}
                    >
                      <Icon name={isMissed ? 'phoneOff' : 'phone'} className="size-3.5" />
                      <span>{m.message.replace('📞 ', '')}</span>
                      <span className="text-[9px] font-mono opacity-60 ml-0.5">{formattedTime}</span>
                    </div>
                  </div>
                );
              }

              const isMe = m.sender_id === currentUserId;

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl p-3 text-xs shadow-[2px_2px_0px_0px_#000] border-2 border-black ${
                      isMe
                        ? 'bg-[#be123c] text-white rounded-br-none'
                        : 'bg-white text-zinc-950 rounded-bl-none'
                    }`}
                  >
                    {!isMe && (
                      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        {m.sender_name || partnerName}
                      </p>
                    )}
                    <p className="font-medium whitespace-pre-wrap break-words leading-relaxed">
                      {m.message}
                    </p>
                    <div
                      className={`mt-1 flex items-center justify-end gap-1 text-[9px] font-mono ${
                        isMe ? 'text-rose-200' : 'text-zinc-400'
                      }`}
                    >
                      <span>{formattedTime}</span>
                      {isMe && <Icon name="check" className="size-3" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Reply Chips (Role-Specific) */}
        <div className="border-t border-zinc-200 bg-white p-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {activeChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChip(chip)}
                className="shrink-0 rounded-full border border-black bg-zinc-50 px-2.5 py-1 text-[11px] font-bold text-zinc-800 hover:bg-zinc-100 transition shadow-[1px_1px_0px_0px_#000] cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="border-t-[2.5px] border-black bg-white p-3">
          {error && (
            <p className="mb-2 text-[11px] font-bold text-rose-600 truncate">{error}</p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Tulis pesan ke ${partnerName}...`}
              className="flex-1 rounded-xl border-2 border-black bg-zinc-50 p-2.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000] hover:bg-[#9f1239] disabled:opacity-50 transition cursor-pointer"
            >
              {isSending ? <Spinner size="sm" className="text-white" /> : <Icon name="send" className="size-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
