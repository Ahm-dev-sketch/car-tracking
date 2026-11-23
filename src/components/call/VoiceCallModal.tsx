'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
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
  const [isSinkIdSupported, setIsSinkIdSupported] = useState(true);

  useEffect(() => {
    setIsSinkIdSupported('setSinkId' in HTMLMediaElement.prototype);
  }, []);

  // Reset speaker state when call terminates
  useEffect(() => {
    if (callStatus === 'idle' || callStatus === 'ended') {
      setIsSpeakerOn(false);
    }
  }, [callStatus]);

  // Bind remote stream to audio element with safe Autoplay Policy handling
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !remoteStream) return;

    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }
    audioEl.muted = false;

    const attemptPlay = () => {
      audioEl
        .play()
        .then(() => {
          console.log('[WebRTC Audio]: Remote audio playing successfully in production');
        })
        .catch((err) => {
          console.warn('[WebRTC Audio] Autoplay tertahan:', err);
        });
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

  // Toggle speakerphone / loudspeaker output
  const toggleSpeaker = async () => {
    if (!audioRef.current || !('setSinkId' in HTMLMediaElement.prototype)) {
      console.warn('[WebRTC Audio] setSinkId tidak didukung di browser ini');
      setIsSpeakerOn((prev: boolean) => !prev);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
      // Cari device speaker eksternal / default loudspeaker jika tersedia
      const targetDeviceId =
        !isSpeakerOn && audioOutputs.length > 1
          ? audioOutputs.find((d) => d.label.toLowerCase().includes('speaker'))?.deviceId ||
            audioOutputs[1].deviceId
          : '';
      await (audioRef.current as any).setSinkId(targetDeviceId);
      setIsSpeakerOn(!isSpeakerOn);
    } catch (error) {
      console.error('[Speaker Toggle Error]:', error);
    }
  };

  const handleAccept = () => {
    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.play().catch((err) => {
        console.warn('[WebRTC Audio] Play unlock on accept failed:', err);
      });
    }
    if (typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
        }
      } catch {}
    }
    onAccept();
  };

  if (callStatus === 'idle') return null;

  const isMissedOrRejected =
    errorMessage?.toLowerCase().includes('tidak ada jawaban') ||
    errorMessage?.toLowerCase().includes('tak terjawab') ||
    errorMessage?.toLowerCase().includes('ditolak');

  /* Circular control recipe: shared by mute / speaker / hang-up */
  const controlBase =
    'flex size-12 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';
  const controlIdle = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
  const controlActive = 'border-slate-900 bg-slate-900 text-white';
  const controlLabel = 'text-[11px] font-medium text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs">
      {/* Hidden audio element for WebRTC audio playback */}
      <audio ref={audioRef} autoPlay playsInline muted={false} />

      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white text-center animate-in fade-in zoom-in-95 duration-150">
        {/* Crimson state rule: the only brand colour on this surface */}
        <div
          aria-hidden="true"
          className={`h-0.5 w-full ${
            callStatus === 'ringing' ? 'bg-success-600' : 'bg-brand-600'
          }`}
        />

        <div className="p-6">
          {/* Caller monogram */}
          <div className="relative mx-auto mb-4 flex size-24 items-center justify-center">
            {(callStatus === 'calling' || callStatus === 'ringing') && (
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full motion-safe:animate-ping ${
                  callStatus === 'ringing' ? 'bg-success-100' : 'bg-slate-100'
                }`}
              />
            )}
            <div className="relative flex size-20 items-center justify-center rounded-full bg-slate-900 text-white">
              <span className="font-mono text-xl font-semibold tracking-[0.08em]">
                {partnerName.slice(0, 2).toUpperCase() || 'KC'}
              </span>
            </div>
          </div>

          {/* Partner Name & Role */}
          <h3 className="truncate text-lg font-semibold tracking-tight text-slate-900">{partnerName}</h3>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {partnerRole === 'DRIVER' ? 'Pengemudi Armada' : partnerRole === 'ADMIN' ? 'Dispatcher Admin' : 'Penumpang'}
          </p>

          {/* Call Status Label */}
          <div className="mb-6 mt-4">
            {callStatus === 'calling' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                <span className="relative inline-flex size-1.5 shrink-0 rounded-full" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-slate-400" />
                  <span className="absolute inset-0 rounded-full bg-slate-400 status-ping" />
                </span>
                Memanggil...
              </span>
            )}
            {callStatus === 'ringing' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
                <span className="relative inline-flex size-1.5 shrink-0 rounded-full" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-success-600" />
                  <span className="absolute inset-0 rounded-full bg-success-600 status-ping" />
                </span>
                Panggilan Masuk...
              </span>
            )}
            {callStatus === 'connected' && (
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
                  <span className="inline-flex size-1.5 shrink-0 rounded-full bg-success-600" aria-hidden="true" />
                  Tersambung
                </span>
                <p className="font-mono text-base font-semibold tabular-nums text-slate-900">
                  {formatDuration(callDuration)}
                </p>
              </div>
            )}
            {callStatus === 'ended' && (
              <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  isMissedOrRejected
                    ? 'border-danger-200 bg-danger-50 text-danger-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {isMissedOrRejected ? (
                  <Icon name="phoneOff" className="size-3.5 shrink-0" />
                ) : null}
                <span className="truncate">{errorMessage || 'Panggilan Berakhir'}</span>
              </span>
            )}
          </div>

          {errorMessage && callStatus !== 'ended' && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-left text-xs font-medium leading-relaxed text-danger-700">
              <Icon name="alert" className="mt-px size-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center justify-center gap-6 border-t border-slate-100 pt-5">
            {/* Ringing: Show Accept & Reject */}
            {callStatus === 'ringing' ? (
              <>
                <button
                  type="button"
                  onClick={onReject}
                  className="group flex min-h-11 cursor-pointer flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-danger-600 text-white transition-colors group-hover:bg-danger-700">
                    <Icon name="phoneOff" className="size-6" />
                  </span>
                  <span className="text-[11px] font-semibold text-danger-700">Tolak</span>
                </button>

                <button
                  type="button"
                  onClick={handleAccept}
                  className="group flex min-h-11 cursor-pointer flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <span className="relative flex size-14 items-center justify-center rounded-full bg-success-600 text-white transition-colors group-hover:bg-success-700">
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-success-600 opacity-25 motion-safe:animate-ping"
                    />
                    <Icon name="phone" className="relative size-6" />
                  </span>
                  <span className="text-[11px] font-semibold text-success-700">Terima</span>
                </button>
              </>
            ) : (
              /* Calling or Connected: Show Mute, Speaker, and Hang up */
              <>
                {callStatus === 'connected' && (
                  <>
                    <button
                      type="button"
                      onClick={onToggleMute}
                      className="group flex cursor-pointer flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      title={isMuted ? 'Aktifkan Mikrofon' : 'Bisukan Mikrofon'}
                    >
                      <span className={`${controlBase} ${isMuted ? controlActive : controlIdle}`}>
                        <Icon name={isMuted ? 'micOff' : 'mic'} className="size-5" />
                      </span>
                      <span className={controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleSpeaker}
                      className="group flex cursor-pointer flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      title={
                        isSinkIdSupported
                          ? isSpeakerOn
                            ? 'Matikan Loudspeaker'
                            : 'Aktifkan Loudspeaker'
                          : 'Output audio dikelola sistem perangkat'
                      }
                    >
                      <span className={`${controlBase} ${isSpeakerOn ? controlActive : controlIdle}`}>
                        <Icon name={isSpeakerOn ? 'speaker' : 'speakerOff'} className="size-5" />
                      </span>
                      <span className={controlLabel}>{isSpeakerOn ? 'Speaker On' : 'Speaker Off'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={onEndCall}
                  className="group flex cursor-pointer flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <span className="flex size-12 items-center justify-center rounded-full border border-danger-200 bg-danger-50 text-danger-600 transition-colors group-hover:border-danger-600 group-hover:bg-danger-600 group-hover:text-white">
                    <Icon name="phoneOff" className="size-5" />
                  </span>
                  <span className="text-[11px] font-semibold text-danger-700">Akhiri</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
