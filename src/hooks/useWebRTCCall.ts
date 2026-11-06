'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { sounds } from '@/lib/sound-effects';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface CallLogEntry {
  type: 'COMPLETED' | 'MISSED' | 'REJECTED';
  durationSeconds: number;
}

interface UseWebRTCCallProps {
  channelId: string; // e.g. bookingId or tripId
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  onLogCall?: (entry: CallLogEntry, partnerId?: string | null) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useWebRTCCall({
  channelId,
  currentUserId,
  currentUserName,
  currentUserRole = 'USER',
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
  const channelRef = useRef<any>(null);
  const pendingOfferRef = useRef<any>(null);
  const callDurationRef = useRef<number>(0);
  const callStatusRef = useRef<CallStatus>('idle');

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
      pcRef.current.close();
      pcRef.current = null;
    }

    pendingOfferRef.current = null;
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

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        sounds.stopAll();
        setCallStatus('connected');
        if (!timerRef.current) {
          startTimer();
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [currentUserId, startTimer]);

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

      // Ringing timeout for outgoing call (40 seconds)
      ringingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') {
          endCall('MISSED');
        }
      }, 40000);
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

      // Auto-missed call after 30 seconds
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'ringing') {
          sounds.stopAll();
          setMissedCallsCount((c) => c + 1);
          setCallStatus('idle');
          setPartnerInfo(null);
          pendingOfferRef.current = null;
        }
      }, 30000);
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

      if (callStatusRef.current === 'ringing' && payload?.reason === 'MISSED') {
        setMissedCallsCount((c) => c + 1);
      }

      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setCallDuration(0);
      }, 1500);
    });

    // ICE Candidate
    channel.on('broadcast', { event: 'webrtc-ice' }, async ({ payload }) => {
      if (payload.fromUserId === currentUserId) return;
      try {
        if (pcRef.current && pcRef.current.remoteDescription && payload.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
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
