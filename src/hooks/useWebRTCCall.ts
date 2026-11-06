'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface UseWebRTCCallProps {
  channelId: string; // e.g. bookingId or tripId
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
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
}: UseWebRTCCallProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [partnerInfo, setPartnerInfo] = useState<{ id: string; name: string; role?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  // Clean up all resources
  const cleanupCall = useCallback(() => {
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

    setRemoteStream(null);
    setIsMuted(false);
    setCallDuration(0);
  }, []);

  // Initialize or get RTCPeerConnection
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
        setCallStatus('connected');
        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            setCallDuration((d) => d + 1);
          }, 1000);
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [currentUserId]);

  // Acquire user microphone stream
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

      const stream = await getLocalAudioStream();
      const pc = getOrCreatePeerConnection();

      // Add local audio tracks to connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Send initial invite signal
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-invite',
        payload: {
          fromUserId: currentUserId,
          fromName: currentUserName,
          fromRole: currentUserRole,
          toUserId: targetUserId,
        },
      });

      // Create WebRTC Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'webrtc-offer',
        payload: {
          fromUserId: currentUserId,
          toUserId: targetUserId,
          offer,
        },
      });
    } catch (err: unknown) {
      cleanupCall();
      setCallStatus('idle');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memulai panggilan suara');
    }
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!partnerInfo) return;

    try {
      setErrorMessage(null);
      setCallStatus('connected');

      const stream = await getLocalAudioStream();
      const pc = getOrCreatePeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Start timer
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-accept',
        payload: {
          fromUserId: currentUserId,
          toUserId: partnerInfo.id,
        },
      });
    } catch (err: unknown) {
      endCall();
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menerima panggilan');
    }
  };

  // Reject incoming call
  const rejectCall = () => {
    if (partnerInfo) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-reject',
        payload: {
          fromUserId: currentUserId,
          toUserId: partnerInfo.id,
        },
      });
    }
    cleanupCall();
    setCallStatus('idle');
    setPartnerInfo(null);
  };

  // End active call
  const endCall = () => {
    if (partnerInfo) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-end',
        payload: {
          fromUserId: currentUserId,
          toUserId: partnerInfo.id,
        },
      });
    }
    cleanupCall();
    setCallStatus('ended');
    setTimeout(() => {
      setCallStatus('idle');
      setPartnerInfo(null);
    }, 1500);
  };

  // Toggle Mute / Unmute microphone
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Supabase Realtime Broadcast signaling channel listener
  useEffect(() => {
    if (!channelId) return;

    const channelName = `call:${channelId}`;
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    // Incoming call invite
    channel.on('broadcast', { event: 'call-invite' }, async ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      if (payload.fromUserId === currentUserId) return;

      if (callStatus !== 'idle') {
        // Line busy
        channel.send({
          type: 'broadcast',
          event: 'call-busy',
          payload: { fromUserId: currentUserId, toUserId: payload.fromUserId },
        });
        return;
      }

      setPartnerInfo({
        id: payload.fromUserId,
        name: payload.fromName || 'Pengguna',
        role: payload.fromRole,
      });
      setCallStatus('ringing');
    });

    // Remote call accepted
    channel.on('broadcast', { event: 'call-accept' }, () => {
      setCallStatus('connected');
    });

    // Remote call rejected
    channel.on('broadcast', { event: 'call-reject' }, () => {
      setErrorMessage('Panggilan ditolak oleh lawan bicara');
      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setErrorMessage(null);
      }, 2000);
    });

    // Remote call busy
    channel.on('broadcast', { event: 'call-busy' }, () => {
      setErrorMessage('Lawan bicara sedang dalam panggilan lain');
      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
        setErrorMessage(null);
      }, 2000);
    });

    // Remote call ended
    channel.on('broadcast', { event: 'call-end' }, () => {
      cleanupCall();
      setCallStatus('ended');
      setTimeout(() => {
        setCallStatus('idle');
        setPartnerInfo(null);
      }, 1500);
    });

    // WebRTC Offer received
    channel.on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      if (payload.fromUserId === currentUserId) return;

      try {
        const pc = getOrCreatePeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));

        const stream = await getLocalAudioStream();
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        channel.send({
          type: 'broadcast',
          event: 'webrtc-answer',
          payload: {
            fromUserId: currentUserId,
            toUserId: payload.fromUserId,
            answer,
          },
        });
      } catch (err: unknown) {
        console.error('Failed to handle WebRTC offer:', err);
      }
    });

    // WebRTC Answer received
    channel.on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
      if (payload.toUserId && payload.toUserId !== currentUserId) return;
      if (payload.fromUserId === currentUserId) return;

      try {
        const pc = getOrCreatePeerConnection();
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      } catch (err: unknown) {
        console.error('Failed to handle WebRTC answer:', err);
      }
    });

    // ICE Candidate received
    channel.on('broadcast', { event: 'webrtc-ice' }, async ({ payload }) => {
      if (payload.fromUserId === currentUserId) return;

      try {
        const pc = getOrCreatePeerConnection();
        if (pc.remoteDescription && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err: unknown) {
        console.error('Failed to add ICE candidate:', err);
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      cleanupCall();
    };
  }, [channelId, currentUserId, callStatus, cleanupCall, getOrCreatePeerConnection]);

  return {
    callStatus,
    isMuted,
    callDuration,
    partnerInfo,
    errorMessage,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  };
}
