'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserAgent, Inviter, Invitation, SessionState, URI, RegistererState } from 'sip.js';

export type SoftphoneState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface SoftphoneHook {
  state: SoftphoneState;
  callUuid: string | null;
  isMuted: boolean;
  isOnHold: boolean;
  answer: () => void;
  hangup: () => void;
  mute: () => void;
  unmute: () => void;
  hold: () => void;
  unhold: () => void;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
}

interface SipCredentials {
  sipUri: string;
  wsUri: string;
  password: string;
  expiresIn: number;
}

export function useSoftphone(authToken: string): SoftphoneHook {
  const [state, setState] = useState<SoftphoneState>('idle');
  const [callUuid, setCallUuid] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  const userAgentRef = useRef<UserAgent | null>(null);
  const sessionRef = useRef<Invitation | Inviter | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Fetch SIP credentials and register
  useEffect(() => {
    let ua: UserAgent | null = null;

    const init = async () => {
      try {
        const res = await fetch('/api/v1/telephony/credentials', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error('Failed to fetch SIP credentials');
        const creds: SipCredentials = await res.json();

        const uri = UserAgent.makeURI(creds.sipUri);
        if (!uri) throw new Error('Invalid SIP URI');

        ua = new UserAgent({
          uri,
          transportOptions: {
            server: creds.wsUri,
          },
          authorizationPassword: creds.password,
          authorizationUsername: uri.user,
          sessionDescriptionHandlerFactoryOptions: {
            constraints: { audio: true, video: false },
          },
          delegate: {
            onInvite: (invitation: Invitation) => {
              sessionRef.current = invitation;
              // Extract call UUID from custom SIP headers if available
              const xCallUuid = invitation.request.getHeader('X-Call-UUID');
              if (xCallUuid) setCallUuid(xCallUuid);
              setState('ringing');

              invitation.stateChange.addListener((newState: SessionState) => {
                switch (newState) {
                  case SessionState.Establishing:
                    setState('connecting');
                    break;
                  case SessionState.Established:
                    setState('connected');
                    attachAudio(invitation);
                    break;
                  case SessionState.Terminated:
                    setState('ended');
                    setCallUuid(null);
                    sessionRef.current = null;
                    setTimeout(() => setState('idle'), 2000);
                    break;
                }
              });
            },
          },
        });

        await ua.start();
        userAgentRef.current = ua;
      } catch (err) {
        console.error('[Softphone] Init error:', err);
      }
    };

    init();

    // Cleanup: always unregister on unmount to prevent ghost registrations
    return () => {
      ua?.stop().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const attachAudio = (session: Invitation | Inviter) => {
    const sdh = session.sessionDescriptionHandler as any;
    const pc: RTCPeerConnection = sdh?.peerConnection;
    if (!pc || !audioRef.current) return;
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track?.kind === 'audio') {
        const stream = new MediaStream([receiver.track]);
        audioRef.current!.srcObject = stream;
      }
    });
  };

  const answer = useCallback(() => {
    const inv = sessionRef.current as Invitation | null;
    if (!inv || state !== 'ringing') return;
    inv.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
  }, [state]);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session instanceof Invitation && session.state === SessionState.Initial) {
      session.reject();
    } else {
      (session as any).bye?.().catch(console.error);
    }
  }, []);

  const mute = useCallback(() => {
    const sdh = sessionRef.current?.sessionDescriptionHandler as any;
    sdh?.peerConnection?.getSenders().forEach((sender: RTCRtpSender) => {
      if (sender.track) sender.track.enabled = false;
    });
    setIsMuted(true);
  }, []);

  const unmute = useCallback(() => {
    const sdh = sessionRef.current?.sessionDescriptionHandler as any;
    sdh?.peerConnection?.getSenders().forEach((sender: RTCRtpSender) => {
      if (sender.track) sender.track.enabled = true;
    });
    setIsMuted(false);
  }, []);

  const hold = useCallback(async () => {
    const sdh = sessionRef.current?.sessionDescriptionHandler as any;
    const senders: RTCRtpSender[] = sdh?.peerConnection?.getSenders() ?? [];
    for (const sender of senders) {
      if (sender.track?.kind === 'audio') await sender.replaceTrack(null);
    }
    setIsOnHold(true);
    if (callUuid) {
      await fetch('/api/v1/telephony/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ callUuid }),
      });
    }
  }, [callUuid, authToken]);

  const unhold = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const sdh = sessionRef.current?.sessionDescriptionHandler as any;
    const senders: RTCRtpSender[] = sdh?.peerConnection?.getSenders() ?? [];
    const audioTrack = stream.getAudioTracks()[0];
    for (const sender of senders) {
      if (sender.track?.kind === 'audio' || sender.track === null) {
        await sender.replaceTrack(audioTrack);
      }
    }
    setIsOnHold(false);
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!callUuid) return;
    await fetch('/api/v1/telephony/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ callUuid }),
    });
  }, [callUuid, authToken]);

  const resumeRecording = useCallback(async () => {
    if (!callUuid) return;
    await fetch('/api/v1/telephony/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ callUuid }),
    });
  }, [callUuid, authToken]);

  return {
    state,
    callUuid,
    isMuted,
    isOnHold,
    answer,
    hangup,
    mute,
    unmute,
    hold,
    unhold,
    pauseRecording,
    resumeRecording,
  };
}
