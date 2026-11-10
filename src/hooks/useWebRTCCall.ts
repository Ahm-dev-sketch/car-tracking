'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { sounds } from '@/lib/sound-effects';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export const CALL_TIMEOUT_MS = 30000; // 30 seconds call timeout

export interface CallLogEntry {
  type: 'COMPLETED' | 'MISSED' | 'REJECTED';
  durationSeconds: number;
}

interface UseWebRTCCallProps {
  channelId: string; // e.g. bookingId or tripId
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  remoteAudioRef?: React.RefObject<HTMLAudioElement | null>;
  onLogCall?: (entry: CallLogEntry, partnerId?: string | null) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTCCall({
  channelId,
  currentUserId,
  currentUserName,
  currentUserRole = 'USER',
  remoteAudioRef,
  onLogCall,
}: UseWebRTCCallProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [partnerInfo, setPartnerInfo] = useState<{ id: string; name: string; role?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [missedCallsCount, setMissedCallsCount] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const pendingOfferRef = useRef<any>(null);
  const callDurationRef = useRef<number>(0);
  const callStatusRef = useRef<CallStatus>('idle');
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Keep ref synchronized
  callStatusRef.current = callStatus;
  callDurationRef.current = callDuration;

  const onLogCallRef = useRef(onLogCall);
  onLogCallRef.current = onLogCall;

  // Clear timers and streams
  const cleanupCall = useCallback(() => {
    sounds.stopAll();

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
    setIsMuted(false);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallDuration(0);
    callDurationRef.current = 0;
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => {
        const next = prev + 1;
        callDurationRef.current = next;
        return next;
      });
    }, 1000);
  }, []);

  // Helper to drain buffered candidates received before remoteDescription
  const drainPendingIceCandidates = async (pc: RTCPeerConnection) => {
    if (pendingCandidatesRef.current.length > 0) {
      console.log(`[WebRTC ICE]: Flushing ${pendingCandidatesRef.current.length} buffered candidates`);
      const candidates = [...pendingCandidatesRef.current];
      pendingCandidatesRef.current = [];
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('[WebRTC ICE]: Error adding buffered candidate:', err);
        }
      }
    }
  };

  // Initialize RTCPeerConnection
  const getOrCreatePeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-ice',
          payload: {
            fromUserId: currentUserId,
            candidate: event.candidate,
          },
        });
      }
    };

    const clearDisconnectGracePeriod = () => {
      if (disconnectTimeoutRef.current) {
        console.log('[WebRTC]: Connection recovered, cancelling disconnect grace period.');
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
    };

    const handleConnectionDisconnected = () => {
      if (disconnectTimeoutRef.current) return;
      console.warn('[WebRTC]: Connection temporarily disconnected, granting 10s grace period for re-routing...');
      disconnectTimeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC]: Connection failed to reconnect within 10s grace period. Ending call.');
        endCall();
      }, 10000);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[ICE State]:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearDisconnectGracePeriod();
        if (ringingTimeoutRef.current) {
          clearTimeout(ringingTimeoutRef.current);
          ringingTimeoutRef.current = null;
        }
        console.log('[WebRTC Audio]: ICE media connectivity fully established');
      } else if (pc.iceConnectionState === 'disconnected') {
        handleConnectionDisconnected();
      } else if (pc.iceConnectionState === 'failed') {
        clearDisconnectGracePeriod();
        console.warn('[WebRTC Audio]: ICE connection permanently failed in production');
        endCall();
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC ontrack]: Received remote track', event.track.kind, event.streams);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      setRemoteStream(stream);

      if (remoteAudioRef?.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((err) => {
          console.warn('[WebRTC] Autoplay blocked, awaiting user gesture:', err);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC Connection State]:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        clearDisconnectGracePeriod();
        sounds.stopAll();
        if (ringingTimeoutRef.current) {
          clearTimeout(ringingTimeoutRef.current);
          ringingTimeoutRef.current = null;
        }
        setCallStatus('connected');
        if (!timerRef.current) {
          startTimer();
        }
      } else if (pc.connectionState === 'disconnected') {
        handleConnectionDisconnected();
      } else if (pc.connectionState === 'failed') {
        clearDisconnectGracePeriod();
        console.warn('[WebRTC]: PeerConnection permanently failed');
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [currentUserId, remoteAudioRef, startTimer]);

  // Acquire microphone stream
  const getLocalAudioStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Izin mikrofon diperlukan untuk panggilan suara';
      setErrorMessage(msg);
      throw err;
    }
  };

  // Start outgoing call
  const startCall = async (targetUserId: string, targetName: string, targetRole?: string) => {
    try {
      setErrorMessage(null);
      setPartnerInfo({ id: targetUserId, name: targetName, role: targetRole });
      setCallStatus('calling');
      sounds.startRingback();

      const stream = await getLocalAudioStream();
      const pc = getOrCreatePeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create WebRTC Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      // Send call invitation containing offer
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-invite',
        payload: {
          fromUserId: currentUserId,
          fromName: currentUserName,
          fromRole: currentUserRole,
          toUserId: targetUserId,
          offer,
        },
      });

      // Clear any prior ringing timer
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      // Auto call-timeout for outgoing call (30 seconds)
      ringingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') {
          console.log('[WebRTC Call]: Outgoing call timed out after 30s with no answer');

          // 1. Broadcast timeout signal & call-end to recipient
          channelRef.current?.send({
            type: 'broadcast',
            event: 'webrtc-timeout',
            payload: {
              fromUserId: currentUserId,
              toUserId: targetUserId,
              reason: 'MISSED',
            },
          });

          channelRef.current?.send({
            type: 'broadcast',
            event: 'call-end',
            payload: {
              fromUserId: currentUserId,
              toUserId: targetUserId,
              reason: 'MISSED',
            },
          });

          // 2. Stop audio ringback and play hangup
          sounds.stopAll();
          sounds.playHangup();

          // 3. UI feedback
          setErrorMessage('Tidak ada jawaban');

          // 4. Log missed call event to chat history & database
          onLogCallRef.current?.({ type: 'MISSED', durationSeconds: 0 }, targetUserId);

          // 5. Cleanup connections
          cleanupCall();
          setCallStatus('ended');

          setTimeout(() => {
            setCallStatus('idle');
            setPartnerInfo(null);
            setErrorMessage(null);
            setCallDuration(0);
          }, 2500);
        }
      }, CALL_TIMEOUT_MS);
    } catch (err: unknown) {
      cleanupCall();
      setCallStatus('idle');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memulai panggilan suara');
    }
  };

  // Callee accepts incoming call
  const acceptCall = async () => {
    if (!partnerInfo) return;

    sounds.stopAll();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    try {
      setErrorMessage(null);
      setCallStatus('connected');
      startTimer();

      const stream = await getLocalAudioStream();
      const pc = getOrCreatePeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
        await drainPendingIceCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'call-accept',
          payload: {
            fromUserId: currentUserId,
            toUserId: partnerInfo.id,
            answer,
          },
        });
      }
    } catch (err: unknown) {
      endCall('REJECTED');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menerima panggilan');
    }
  };

  // Callee rejects incoming call
  const rejectCall = () => {
    sounds.stopAll();
    sounds.playHangup();

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    if (partnerInfo) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-reject',
        payload: {
          fromUserId: currentUserId,
          toUserId: partnerInfo.id,
        },
      });

      onLogCallRef.current?.({ type: 'REJECTED', durationSeconds: 0 }, partnerInfo.id);
    }

    cleanupCall();
    setCallStatus('idle');
    setPartnerInfo(null);
  };

  // End active call
  const endCall = (explicitReason?: 'COMPLETED' | 'MISSED' | 'REJECTED') => {
    const finalDuration = callDurationRef.current;
    const finalStatus = callStatusRef.current;
    const partner = partnerInfo;

    sounds.stopAll();
    sounds.playHangup();

    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    if (partner) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-end',
        payload: {
          fromUserId: currentUserId,
          toUserId: partner.id,
          reason: explicitReason,
        },
      });

      const entryType: 'COMPLETED' | 'MISSED' | 'REJECTED' =
        explicitReason ?? (finalStatus === 'connected' && finalDuration > 0 ? 'COMPLETED' : 'MISSED');

      onLogCallRef.current?.({ type: entryType, durationSeconds: finalDuration }, partner.id);
    }

    cleanupCall();
    setCallStatus('ended');
    setTimeout(() => {
      setCallStatus('idle');
      setPartnerInfo(null);
      setCallDuration(0);
    }, 1500);
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Supabase Realtime Signaling Listener
  useEffect(() => {
    if (!channelId) return;

    const channelName = `call:${channelId}`;

    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${channelName}` || c.topic === channelName);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    // Incoming call invite
    channel.on('broadcast', { event: 'call-invite' }, ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      if (payload.fromUserId === currentUserId) return;

      if (callStatusRef.current !== 'idle') {
        // Line busy
        channel.send({
          type: 'broadcast',
          event: 'call-busy',
          payload: { fromUserId: currentUserId, toUserId: payload.fromUserId },
        });
        return;
      }

      // Store offer for manual user acceptance
      pendingOfferRef.current = payload.offer;

      setPartnerInfo({
        id: payload.fromUserId,
        name: payload.fromName || 'Pengguna',
        role: payload.fromRole,
      });

      setCallStatus('ringing');
      sounds.startRingtone();

      // Auto-missed call backup timer on callee (30 seconds)
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'ringing') {
          console.log('[WebRTC Call]: Incoming call timed out after 30s with no answer');
          sounds.stopAll();
          sounds.playHangup();
          setMissedCallsCount((c) => c + 1);
          setErrorMessage('Panggilan tak terjawab');
          cleanupCall();
          setCallStatus('ended');
          setTimeout(() => {
            setCallStatus('idle');
            setPartnerInfo(null);
            setErrorMessage(null);
            setCallDuration(0);
          }, 2500);
        }
      }, CALL_TIMEOUT_MS);
    });

    // Remote caller timed out (30s)
    channel.on('broadcast', { event: 'webrtc-timeout' }, ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      console.log('[WebRTC Call]: Received webrtc-timeout signal from caller');

      sounds.stopAll();
      sounds.playHangup();

      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      if (callStatusRef.current === 'ringing') {
        setMissedCallsCount((c) => c + 1);
      }

      setErrorMessage('Panggilan tak terjawab');
      cleanupCall();
      setCallStatus('ended');

      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setErrorMessage(null);
        setCallDuration(0);
      }, 2500);
    });

    // Remote accepted our call
    channel.on('broadcast', { event: 'call-accept' }, async ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      sounds.stopAll();

      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      try {
        if (payload.answer && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await drainPendingIceCandidates(pcRef.current);
        }
        setCallStatus('connected');
        startTimer();
      } catch (err) {
        console.error('Failed to set remote answer:', err);
      }
    });

    // Remote rejected call
    channel.on('broadcast', { event: 'call-reject' }, () => {
      sounds.stopAll();
      sounds.playHangup();
      setErrorMessage('Panggilan ditolak oleh lawan bicara');
      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setErrorMessage(null);
        setCallDuration(0);
      }, 2000);
    });

    // Remote busy
    channel.on('broadcast', { event: 'call-busy' }, () => {
      sounds.stopAll();
      sounds.playHangup();
      setErrorMessage('Lawan bicara sedang dalam panggilan lain');
      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setErrorMessage(null);
        setCallDuration(0);
      }, 2000);
    });

    // Remote ended call
    channel.on('broadcast', { event: 'call-end' }, ({ payload }) => {
      sounds.stopAll();
      sounds.playHangup();

      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = null;
      }

      if (callStatusRef.current === 'ringing' || payload?.reason === 'MISSED') {
        setMissedCallsCount((c) => c + 1);
        setErrorMessage('Panggilan tak terjawab');
      }

      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setCallDuration(0);
        setErrorMessage(null);
      }, 2000);
    });

    // ICE Candidate
    channel.on('broadcast', { event: 'webrtc-ice' }, async ({ payload }) => {
      if (payload.fromUserId === currentUserId) return;
      if (!payload.candidate) return;

      const pc = pcRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.warn('[WebRTC ICE]: Error adding immediate candidate, queuing:', err);
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } else {
        console.log('[WebRTC ICE]: Remote description not yet set, buffering candidate to queue');
        pendingCandidatesRef.current.push(payload.candidate);
      }
    });

    channel.subscribe();

    return () => {
      sounds.stopAll();
      supabase.removeChannel(channel);
      channelRef.current = null;
      cleanupCall();
    };
  }, [channelId, currentUserId, cleanupCall, startTimer]);

  return {
    callStatus,
    isMuted,
    callDuration,
    partnerInfo,
    errorMessage,
    remoteStream,
    missedCallsCount,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    clearMissedCalls: () => setMissedCallsCount(0),
  };
}
