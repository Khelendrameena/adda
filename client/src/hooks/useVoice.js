import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, emitAck } from '../lib/socket.js';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

/**
 * Simple audio-only WebRTC mesh for small rooms (2–6 people).
 * The newcomer creates offers to everyone already in voice; peers answer.
 * Signaling (offer/answer/ICE) is relayed through Socket.IO by the server,
 * audio itself flows peer-to-peer.
 */
export function useVoice() {
  const socket = getSocket();
  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState({}); // peerId -> bool (rough, via audio elements presence)
  const pcsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const streamRef = useRef(null);
  const audioElsRef = useRef(new Map()); // peerId -> HTMLAudioElement
  const inVoiceRef = useRef(false);

  const closePeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) { try { pc.close(); } catch { /* noop */ } pcsRef.current.delete(peerId); }
    const el = audioElsRef.current.get(peerId);
    if (el) { el.srcObject = null; el.remove(); audioElsRef.current.delete(peerId); }
    setSpeaking((s) => { const n = { ...s }; delete n[peerId]; return n; });
  }, []);

  const makePeer = useCallback((peerId) => {
    let pc = pcsRef.current.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection(RTC_CONFIG);
    pcsRef.current.set(peerId, pc);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc_ice', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      let el = audioElsRef.current.get(peerId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        document.body.appendChild(el);
        audioElsRef.current.set(peerId, el);
      }
      el.srcObject = e.streams[0];
      el.play().catch(() => { /* browser may need a user gesture; voice toggle click covers it */ });
      setSpeaking((s) => ({ ...s, [peerId]: true }));
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId);
    };
    return pc;
  }, [socket, closePeer]);

  const callPeer = useCallback(async (peerId) => {
    const pc = makePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc_offer', { to: peerId, sdp: pc.localDescription });
  }, [makePeer, socket]);

  /* signaling listeners */
  useEffect(() => {
    const onOffer = async ({ from, sdp }) => {
      if (!inVoiceRef.current) return;
      const pc = makePeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { to: from, sdp: pc.localDescription });
    };
    const onAnswer = async ({ from, sdp }) => {
      const pc = pcsRef.current.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    };
    const onIce = async ({ from, candidate }) => {
      const pc = pcsRef.current.get(from);
      if (pc && candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* noop */ } }
    };
    const onPeerJoined = ({ id }) => {
      // Existing members wait — the newcomer initiates offers (avoids glare).
      void id;
    };
    const onPeerLeft = ({ id }) => closePeer(id);

    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice', onIce);
    socket.on('voice_peer_joined', onPeerJoined);
    socket.on('voice_peer_left', onPeerLeft);
    return () => {
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice', onIce);
      socket.off('voice_peer_joined', onPeerJoined);
      socket.off('voice_peer_left', onPeerLeft);
    };
  }, [socket, makePeer, closePeer]);

  const joinVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      inVoiceRef.current = true;
      setInVoice(true);
      setMuted(false);
      const res = await emitAck('voice_join', {});
      const peers = res?.peers || [];
      for (const peerId of peers) await callPeer(peerId); // newcomer offers to all
    } catch (e) {
      console.error('Mic access failed', e);
      alert('Mic permission nahi mili — browser settings me mic allow karo.');
    }
  }, [callPeer]);

  const leaveVoice = useCallback(() => {
    socket.emit('voice_leave');
    inVoiceRef.current = false;
    setInVoice(false);
    [...pcsRef.current.keys()].forEach(closePeer);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [socket, closePeer]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  /* cleanup on unmount */
  useEffect(() => () => {
    if (inVoiceRef.current) {
      socket.emit('voice_leave');
      [...pcsRef.current.keys()].forEach((id) => { try { pcsRef.current.get(id).close(); } catch { /* noop */ } });
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
    audioElsRef.current.forEach((el) => el.remove());
  }, [socket]);

  return { inVoice, muted, speaking, joinVoice, leaveVoice, toggleMute };
}
