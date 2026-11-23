'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { CallStatus } from '@/hooks/useWebRTCCall';

interface VoiceCallModalProps {
  callStatus: CallStatus;
  isMuted: boolean;
  callDuration: number;
  partnerName: string;
  partnerRole?: string;
  errorMessage?: string | null;
  remoteStream: MediaStream | null;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceCallModal({
  callStatus,
  isMuted,
  callDuration,
  partnerName,
  partnerRole = 'Driver',
  errorMessage,
  remoteStream,
  audioRef: externalAudioRef,
  onAccept,
  onReject,
  onEndCall,
  onToggleMute,
}: VoiceCallModalProps) {
  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRef = externalAudioRef || internalAudioRef;
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  // Capability read straight from the platform, no state and no effect.
  const isSinkIdSupported =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  // Speaker routing only exists while a call is actually connected, so the
  // flag is clamped at render instead of being reset by an effect.
  const isSpeakerActive = isSpeakerOn && callStatus === 'connected';

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !remoteStream) return;

    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }
    audioEl.muted = false;

    const attemptPlay = () => {
      audioEl.play().catch(() => {});
    };

    attemptPlay();

    const onTrackEvent = () => attemptPlay();
    remoteStream.addEventListener('addtrack', onTrackEvent);
    remoteStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
      track.addEventListener('unmute', onTrackEvent);
    });

    return () => {
      remoteStream.removeEventListener('addtrack', onTrackEvent);
      remoteStream.getAudioTracks().forEach((track) => {
        track.removeEventListener('unmute', onTrackEvent);
      });
    };
  }, [remoteStream, callStatus]);

  const toggleSpeaker = async () => {
    if (!audioRef.current || !isSinkIdSupported) {
      setIsSpeakerOn((prev: boolean) => !prev);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
      const targetDeviceId =
        !isSpeakerActive && audioOutputs.length > 1
          ? audioOutputs.find((d) => d.label.toLowerCase().includes('speaker'))?.deviceId ||
            audioOutputs[1].deviceId
          : '';
      await (audioRef.current as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        targetDeviceId
      );
      setIsSpeakerOn(!isSpeakerActive);
    } catch {}
  };

  const handleAccept = () => {
    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.play().catch(() => {});
    }
    onAccept();
  };

  if (callStatus === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <audio ref={audioRef} autoPlay playsInline muted={false} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Panggilan suara dengan ${partnerName}`}
        className="w-full max-w-sm rounded-[var(--radius-2xl)] border border-[var(--border)] bg-white p-6 text-center shadow-[var(--shadow-float)]"
      >
        {/* Avatar */}
        <div className="relative mx-auto mb-4 grid size-24 place-items-center">
          {(callStatus === 'calling' || callStatus === 'ringing') && (
            <span
              className="sonar-ring absolute size-20 rounded-full bg-[var(--kcic-red-soft)]"
              aria-hidden="true"
            />
          )}
          <span className="relative grid size-20 place-items-center rounded-full bg-[var(--slate-navy)] text-xl font-semibold text-white">
            {partnerName.slice(0, 2).toUpperCase() || 'KC'}
          </span>
        </div>

        <h3 className="truncate text-base font-semibold text-slate-900">{partnerName}</h3>
        <p className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {partnerRole === 'DRIVER'
            ? 'Pengemudi armada'
            : partnerRole === 'ADMIN'
              ? 'Dispatcher admin'
              : 'Penumpang'}
        </p>

        {/* Status */}
        <div className="mb-5 mt-3 flex min-h-6 items-center justify-center">
          {callStatus === 'calling' && (
            <span className="pill pill-warning">
              <span className="pill-dot animate-pulse" aria-hidden="true" />
              <span>Memanggil…</span>
            </span>
          )}
          {callStatus === 'ringing' && (
            <span className="pill pill-active animate-pulse">
              <span className="pill-dot" aria-hidden="true" />
              <span>Panggilan masuk…</span>
            </span>
          )}
          {callStatus === 'connected' && (
            <span className="pill pill-active">
              <span className="pill-dot" aria-hidden="true" />
              <span>Tersambung</span>
              <span className="mono-plate ml-0.5 tabular-nums opacity-80">
                {formatDuration(callDuration)}
              </span>
            </span>
          )}
          {callStatus === 'ended' && (
            <span className="pill">
              <span>{errorMessage || 'Panggilan berakhir'}</span>
            </span>
          )}
        </div>

        {errorMessage && callStatus !== 'ended' && (
          <div
            role="alert"
            className="mb-4 rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2.5 text-[0.6875rem] leading-relaxed text-[var(--status-error-fg)]"
          >
            {errorMessage}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-start justify-center gap-5 border-t border-[var(--border-subtle)] pt-5">
          {callStatus === 'ringing' ? (
            <>
              <button type="button" onClick={onReject} className="flex cursor-pointer flex-col items-center gap-1.5">
                <span className="grid size-14 place-items-center rounded-full bg-[var(--status-error-fg)] text-white shadow-[var(--shadow-md)] transition-colors hover:bg-[#B91C1C]">
                  <PhoneOff className="size-6" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="text-[0.625rem] font-semibold text-[var(--status-error-fg)]">Tolak</span>
              </button>

              <button type="button" onClick={handleAccept} className="flex cursor-pointer flex-col items-center gap-1.5">
                <span className="grid size-14 place-items-center rounded-full bg-[var(--status-active-fg)] text-white shadow-[var(--shadow-md)] transition-colors hover:bg-[#047857]">
                  <Phone className="size-6" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="text-[0.625rem] font-semibold text-[var(--status-active-fg)]">Terima</span>
              </button>
            </>
          ) : (
            <>
              {callStatus === 'connected' && (
                <>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="flex cursor-pointer flex-col items-center gap-1.5"
                    title={isMuted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
                  >
                    <span
                      className={`grid size-12 place-items-center rounded-full transition-colors ${
                        isMuted
                          ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]'
                          : 'bg-[var(--canvas-sunken)] text-slate-700 hover:bg-[var(--border)]'
                      }`}
                    >
                      {isMuted ? (
                        <MicOff className="size-5" strokeWidth={1.9} aria-hidden="true" />
                      ) : (
                        <Mic className="size-5" strokeWidth={1.9} aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-[0.625rem] font-medium text-slate-600">
                      {isMuted ? 'Unmute' : 'Mute'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleSpeaker}
                    className="flex cursor-pointer flex-col items-center gap-1.5"
                    title={
                      isSinkIdSupported
                        ? 'Ganti keluaran audio'
                        : 'Keluaran audio diatur oleh sistem perangkat'
                    }
                  >
                    <span
                      className={`grid size-12 place-items-center rounded-full border transition-colors ${
                        isSpeakerActive
                          ? 'border-[var(--slate-navy)] bg-[var(--slate-navy)] text-white'
                          : 'border-[var(--border)] bg-white text-slate-600 hover:bg-[var(--canvas)]'
                      }`}
                    >
                      {isSpeakerActive ? (
                        <Volume2 className="size-5" strokeWidth={1.9} aria-hidden="true" />
                      ) : (
                        <VolumeX className="size-5" strokeWidth={1.9} aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-[0.625rem] font-medium text-slate-600">
                      {isSpeakerActive ? 'Speaker aktif' : 'Speaker'}
                    </span>
                  </button>
                </>
              )}

              <button type="button" onClick={onEndCall} className="flex cursor-pointer flex-col items-center gap-1.5">
                <span className="grid size-12 place-items-center rounded-full bg-[var(--status-error-fg)] text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-[#B91C1C]">
                  <PhoneOff className="size-5" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="text-[0.625rem] font-semibold text-[var(--status-error-fg)]">Akhiri</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
