import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, emitAck } from '../lib/socket.js';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

/**
 * Screen / tab share over dedicated WebRTC peer connections, running in
 * parallel to the voice mesh (useVoice stays untouched).
 *
 * One sharer at a time — the server arbitrates the slot. The sharer captures
 * via getDisplayMedia({ video, audio }) (tab audio included when the browser
 * offers it) and creates an offer per room member. Viewers answer and expose
 * the incoming stream via `remoteStream` for the stage. A viewer who joins
 * mid-share asks the sharer to call them via `screen_request`.
 */
export function useScreenShare({ myId, initialSharer }) {
  const socket = getSocket();
  const [sharer, setSharer] = useState(initialSharer || null); // { id, name } | null
  const [localStream, setLocalStream] = useState(null); // my captured display (when I share)
  const [remoteStream, setRemoteStream] = useState(null); // incoming share (when I watch)
  const pcsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const localRef = useRef(null); // live getDisplayMedia stream (sharer side)

  const closePc = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) { try { pc.close(); } catch { /* noop */ } pcsRef.current.delete(peerId); }
  }, []);

  const closeAllPcs = useCallback(() => {
    [...pcsRef.current.keys()].forEach(closePc);
  }, [closePc]);

  const stopLocalCapture = useCallback(() => {
    if (localRef.current) {
      localRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      localRef.current = null;
    }
    setLocalStream(null);
  }, []);

  /* ---------------- sharer side: call one viewer ---------------- */
  const callViewer = useCallback(async (viewerId) => {
    const stream = localRef.current;
    if (!stream || viewerId === myId) return;
    closePc(viewerId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcsRef.current.set(viewerId, pc);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('screen_ice', { to: viewerId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePc(viewerId);
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('screen_offer', { to: viewerId, sdp: pc.localDescription });
    } catch { closePc(viewerId); }
  }, [socket, myId, closePc]);

  /* ---------------- start / stop ---------------- */
  const stopShare = useCallback(() => {
    socket.emit('screen_share_stop');
    stopLocalCapture();
    closeAllPcs();
    setSharer(null);
  }, [socket, stopLocalCapture, closeAllPcs]);

  const startShare = useCallback(async (peerIds) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      return; // user cancelled the picker, or permission denied
    }
    // Claim the room's share slot before wiring up peers.
    let res = null;
    try { res = await emitAck('screen_share_start', {}); } catch { res = null; }
    if (!res?.ok) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      alert(res?.error || 'Screen share start nahi ho paya.');
      return;
    }
    localRef.current = stream;
    setLocalStream(stream);
    setSharer({ id: myId, name: 'Tum' });
    // Browser's native "Stop sharing" bar triggers the track's 'ended'.
    const vt = stream.getVideoTracks()[0];
    if (vt) vt.addEventListener('ended', () => stopShare());
    for (const id of peerIds || []) callViewer(id);
  }, [socket, myId, callViewer, stopShare]);

  /* ---------------- signaling + state listeners ---------------- */
  useEffect(() => {
    const onStarted = ({ byId, byName }) => setSharer({ id: byId, name: byName });
    const onStopped = () => {
      setSharer(null);
      setRemoteStream(null);
      closeAllPcs();
      stopLocalCapture(); // no-op unless I was somehow capturing
    };
    const onRequest = ({ from }) => {
      // Only meaningful for the sharer: a (late) viewer wants a connection.
      if (localRef.current) callViewer(from);
    };
    const onViewerLeft = ({ id }) => closePc(id);
    const onOffer = async ({ from, sdp }) => {
      // Viewer side: the sharer is calling me.
      closePc(from);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcsRef.current.set(from, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('screen_ice', { to: from, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState)) closePc(from);
      };
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('screen_answer', { to: from, sdp: pc.localDescription });
      } catch { closePc(from); }
    };
    const onAnswer = async ({ from, sdp }) => {
      const pc = pcsRef.current.get(from);
      if (pc) { try { await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch { /* noop */ } }
    };
    const onIce = async ({ from, candidate }) => {
      const pc = pcsRef.current.get(from);
      if (pc && candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* noop */ } }
    };

    socket.on('screen_share_started', onStarted);
    socket.on('screen_share_stopped', onStopped);
    socket.on('screen_request', onRequest);
    socket.on('screen_viewer_left', onViewerLeft);
    socket.on('screen_offer', onOffer);
    socket.on('screen_answer', onAnswer);
    socket.on('screen_ice', onIce);
    return () => {
      socket.off('screen_share_started', onStarted);
      socket.off('screen_share_stopped', onStopped);
      socket.off('screen_request', onRequest);
      socket.off('screen_viewer_left', onViewerLeft);
      socket.off('screen_offer', onOffer);
      socket.off('screen_answer', onAnswer);
      socket.off('screen_ice', onIce);
    };
  }, [socket, callViewer, closePc, closeAllPcs, stopLocalCapture]);

  /* joined mid-share — ask the sharer to call me */
  useEffect(() => {
    if (initialSharer && initialSharer.id !== myId) socket.emit('screen_request');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* cleanup on unmount */
  useEffect(() => () => {
    if (localRef.current) {
      socket.emit('screen_share_stop');
      stopLocalCapture();
    }
    closeAllPcs();
  }, [socket, stopLocalCapture, closeAllPcs]);

  const sharing = !!sharer && sharer.id === myId;
  return { sharer, sharing, localStream, remoteStream, startShare, stopShare };
}
