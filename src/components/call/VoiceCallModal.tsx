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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      {/* Hidden audio element for WebRTC audio playback */}
      <audio ref={audioRef} autoPlay playsInline muted={false} />

      <div className="w-full max-w-sm rounded-2xl border-[3px] border-black bg-white p-6 text-center text-black shadow-[6px_6px_0px_0px_#000] animate-in fade-in zoom-in-95 duration-150">
        {/* Caller Avatar / Animation */}
        <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
          {(callStatus === 'calling' || callStatus === 'ringing') && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-30 animate-ping" />
          )}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-black bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]">
            <span className="text-2xl font-black">
              {partnerName.slice(0, 2).toUpperCase() || 'KC'}
            </span>
          </div>
        </div>

        {/* Partner Name & Role */}
        <h3 className="text-lg font-black text-zinc-950 truncate">{partnerName}</h3>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
          {partnerRole === 'DRIVER' ? 'Pengemudi Armada' : partnerRole === 'ADMIN' ? 'Dispatcher Admin' : 'Penumpang'}
        </p>

        {/* Call Status Label */}
        <div className="mb-6">
          {callStatus === 'calling' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
              <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
              Memanggil...
            </span>
          )}
          {callStatus === 'ringing' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 animate-bounce">
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
              Panggilan Masuk...
            </span>
          )}
          {callStatus === 'connected' && (
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                <span className="size-2 rounded-full bg-emerald-500" />
                Tersambung
              </span>
              <p className="font-mono text-xs font-extrabold text-zinc-700">
                {formatDuration(callDuration)}
              </p>
            </div>
          )}
          {callStatus === 'ended' && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                errorMessage?.toLowerCase().includes('tidak ada jawaban') ||
                errorMessage?.toLowerCase().includes('tak terjawab') ||
                errorMessage?.toLowerCase().includes('ditolak')
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-300'
              }`}
            >
              {errorMessage?.toLowerCase().includes('tak terjawab') ||
              errorMessage?.toLowerCase().includes('tidak ada jawaban') ? (
                <Icon name="phoneOff" className="size-3.5 text-rose-600" />
              ) : null}
              {errorMessage || 'Panggilan Berakhir'}
            </span>
          )}
        </div>

        {errorMessage && callStatus !== 'ended' && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-xs font-medium text-rose-800">
            {errorMessage}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-zinc-100">
          {/* Ringing: Show Accept & Reject */}
          {callStatus === 'ringing' ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-rose-600 text-white shadow-[3px_3px_0px_0px_#000] group-hover:bg-rose-700 transition">
                  <Icon name="phoneOff" className="size-6" />
                </span>
                <span className="text-[11px] font-black text-rose-700">Tolak</span>
              </button>

              <button
                type="button"
                onClick={handleAccept}
                className="flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-emerald-500 text-black shadow-[3px_3px_0px_0px_#000] group-hover:bg-emerald-400 transition animate-pulse">
                  <Icon name="phone" className="size-6" />
                </span>
                <span className="text-[11px] font-black text-emerald-800">Terima</span>
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
                    className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    title={isMuted ? 'Aktifkan Mikrofon' : 'Bisukan Mikrofon'}
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-black shadow-[2px_2px_0px_0px_#000] transition ${
                        isMuted ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      <Icon name={isMuted ? 'micOff' : 'mic'} className="size-5" />
                    </span>
                    <span className="text-[11px] font-bold text-zinc-700">
                      {isMuted ? 'Unmute' : 'Mute'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleSpeaker}
                    className="flex flex-col items-center gap-1.5 cursor-pointer group"
                    title={
                      isSinkIdSupported
                        ? isSpeakerOn
                          ? 'Matikan Loudspeaker'
                          : 'Aktifkan Loudspeaker'
                        : 'Output audio dikelola sistem perangkat'
                    }
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-black shadow-[2px_2px_0px_0px_#000] transition ${
                        isSpeakerOn
                          ? 'bg-emerald-400 text-zinc-950 shadow-[3px_3px_0px_0px_#000]'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      <Icon name={isSpeakerOn ? 'speaker' : 'speakerOff'} className="size-5" />
                    </span>
                    <span className="text-[11px] font-bold text-zinc-700">
                      {isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onEndCall}
                className="flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-black bg-rose-600 text-white shadow-[2px_2px_0px_0px_#000] group-hover:bg-rose-700 transition">
                  <Icon name="phoneOff" className="size-5" />
                </span>
                <span className="text-[11px] font-black text-rose-700">Akhiri</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
