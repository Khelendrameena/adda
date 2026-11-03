import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';
import { fmtTime } from '../lib/media.js';

/* Load the YouTube IFrame API once. */
let ytPromise = null;
function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytPromise) {
    ytPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(); };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
  }
  return ytPromise;
}

/**
 * Shared stage: plays YouTube / mp4 for the whole room in sync.
 * Server is the source of truth: it stores { playing, positionSec, updatedAt }
 * and every client derives the expected position from that + elapsed time.
 * Local play/pause/seek actions are broadcast via `playback_action`.
 */
export default function Stage({ playback }) {
  const socket = getSocket();
  const ytDivRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const videoRef = useRef(null);
  const syncRef = useRef({ pos: 0, at: Date.now(), playing: false }); // last authoritative state (client clock)
  const applyingRef = useRef(0); // timestamp of last remote-apply (suppresses echo events)
  const readyRef = useRef(false);

  const [displayPos, setDisplayPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const expectedPos = () => {
    const s = syncRef.current;
    return s.playing ? s.pos + (Date.now() - s.at) / 1000 : s.pos;
  };

  /* ---------- keep syncRef fresh whenever server state arrives ---------- */
  useEffect(() => {
    if (!playback) return;
    syncRef.current = { pos: playback.positionSec || 0, at: Date.now(), playing: !!playback.playing };
    applyState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.itemId, playback?.playing, playback?.positionSec, playback?.type, playback?.videoId, playback?.url]);

  /* ---------- YouTube player lifecycle ---------- */
  useEffect(() => {
    if (!playback || playback.type !== 'youtube' || !playback.videoId) return;
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !ytDivRef.current) return;
      const create = () => {
        ytPlayerRef.current = new window.YT.Player(ytDivRef.current, {
          width: '100%', height: '100%',
          videoId: playback.videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => { readyRef.current = true; applyState(true); },
            onStateChange: (e) => {
              const YT = window.YT;
              if (e.data === YT.PlayerState.ENDED) { socket.emit('media_ended'); return; }
              if (Date.now() - applyingRef.current < 1200) return; // our own remote-apply echo
              const t = ytPlayerRef.current?.getCurrentTime?.() || 0;
              if (e.data === YT.PlayerState.PLAYING && !syncRef.current.playing) {
                socket.emit('playback_action', { action: 'play', positionSec: t });
              } else if (e.data === YT.PlayerState.PAUSED && syncRef.current.playing) {
                socket.emit('playback_action', { action: 'pause', positionSec: t });
              }
            },
          },
        });
      };
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(playback.videoId);
        applyState(true);
      } else {
        create();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.type, playback?.videoId]);

  /* destroy YT player when leaving youtube mode */
  useEffect(() => {
    if (playback?.type !== 'youtube' && ytPlayerRef.current?.destroy) {
      try { ytPlayerRef.current.destroy(); } catch { /* noop */ }
      ytPlayerRef.current = null;
      readyRef.current = false;
    }
  }, [playback?.type]);

  /* ---------- apply authoritative state to the local player ---------- */
  function applyState(force = false) {
    const s = syncRef.current;
    const target = expectedPos();
    applyingRef.current = Date.now();

    if (playback?.type === 'youtube' && ytPlayerRef.current && readyRef.current) {
      const p = ytPlayerRef.current;
      try {
        const cur = p.getCurrentTime() || 0;
        if (force || Math.abs(cur - target) > 1.5) p.seekTo(target, true);
        if (s.playing) { const r = p.playVideo(); if (r?.catch) r.catch(() => setNeedsTap(true)); }
        else p.pauseVideo();
        setDuration(p.getDuration() || 0);
      } catch { /* player not ready yet */ }
    }
    if (playback?.type === 'mp4' && videoRef.current) {
      const v = videoRef.current;
      if (force || Math.abs((v.currentTime || 0) - target) > 1.5) v.currentTime = target;
      if (s.playing) v.play().catch(() => setNeedsTap(true));
      else v.pause();
    }
  }

  /* ---------- drift correction every 5s ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      if (!playback || playback.type === 'none') return;
      const target = expectedPos();
      let cur = null;
      if (playback.type === 'youtube' && ytPlayerRef.current && readyRef.current) {
        try { cur = ytPlayerRef.current.getCurrentTime(); } catch { /* noop */ }
      } else if (playback.type === 'mp4' && videoRef.current) {
        cur = videoRef.current.currentTime;
      }
      if (cur == null) return;
      const playerPlaying = playback.type === 'youtube'
        ? ytPlayerRef.current?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING
        : videoRef.current && !videoRef.current.paused;
      if (Math.abs(cur - target) > 1.5 || playerPlaying !== syncRef.current.playing) applyState();
    }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.type, playback?.itemId]);

  /* ---------- progress display ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      if (!playback || playback.type === 'none') { setDisplayPos(0); return; }
      if (playback.type === 'youtube' && ytPlayerRef.current && readyRef.current) {
        try {
          setDisplayPos(ytPlayerRef.current.getCurrentTime() || 0);
          setDuration(ytPlayerRef.current.getDuration() || 0);
        } catch { /* noop */ }
      } else if (playback.type === 'mp4' && videoRef.current) {
        setDisplayPos(videoRef.current.currentTime || 0);
        setDuration(videoRef.current.duration || 0);
      } else {
        setDisplayPos(expectedPos());
      }
    }, 500);
    return () => clearInterval(iv);
  }, [playback]);

  /* ---------- local controls (broadcast to the room) ---------- */
  const currentTime = () => {
    if (playback?.type === 'youtube' && ytPlayerRef.current && readyRef.current) {
      try { return ytPlayerRef.current.getCurrentTime() || 0; } catch { return expectedPos(); }
    }
    if (playback?.type === 'mp4' && videoRef.current) return videoRef.current.currentTime || 0;
    return expectedPos();
  };

  const togglePlay = () => {
    const t = currentTime();
    socket.emit('playback_action', { action: playback.playing ? 'pause' : 'play', positionSec: t });
    syncRef.current = { pos: t, at: Date.now(), playing: !playback.playing };
    applyState(true);
  };

  const seek = (val) => {
    const t = Number(val);
    socket.emit('playback_action', { action: 'seek', positionSec: t });
    syncRef.current = { pos: t, at: Date.now(), playing: syncRef.current.playing };
    applyState(true);
  };

  const toggleMute = () => {
    if (playback?.type === 'youtube' && ytPlayerRef.current) {
      if (isMuted) ytPlayerRef.current.unMute(); else ytPlayerRef.current.mute();
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const tapToSync = () => {
    setNeedsTap(false);
    applyState(true);
    if (playback?.type === 'youtube' && ytPlayerRef.current) ytPlayerRef.current.playVideo();
    if (playback?.type === 'mp4' && videoRef.current) videoRef.current.play().catch(() => {});
  };

  /* ---------- mp4 native event bridges ---------- */
  const onVideoPlay = () => {
    if (Date.now() - applyingRef.current < 1200) return;
    if (!syncRef.current.playing) socket.emit('playback_action', { action: 'play', positionSec: videoRef.current?.currentTime || 0 });
  };
  const onVideoPause = () => {
    if (Date.now() - applyingRef.current < 1200) return;
    if (syncRef.current.playing && !videoRef.current?.ended) {
      socket.emit('playback_action', { action: 'pause', positionSec: videoRef.current?.currentTime || 0 });
    }
  };

  if (!playback || playback.type === 'none') {
    return (
      <div className="w-full aspect-video rounded-2xl bg-panel border border-white/10 flex flex-col items-center justify-center text-center p-6">
        <div className="text-5xl mb-3">🎬</div>
        <div className="font-semibold text-lg">Stage khaali hai</div>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          Right side <b>Queue</b> tab se koi YouTube gaana ya video lagao — poora room ek saath dekhega, bilkul sync me.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
        {playback.type === 'youtube' && (
          <div key={playback.videoId} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full">
            <div ref={ytDivRef} className="w-full h-full" />
          </div>
        )}
        {playback.type === 'mp4' && (
          <video
            ref={videoRef}
            src={playback.url}
            className="absolute inset-0 w-full h-full"
            onPlay={onVideoPlay}
            onPause={onVideoPause}
            onEnded={() => socket.emit('media_ended')}
            playsInline
          />
        )}
        {needsTap && (
          <button onClick={tapToSync}
            className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-center">
            <span className="text-4xl">🔊</span>
            <span className="font-semibold">Click karo — sound ke saath sync ho jao</span>
            <span className="text-xs text-gray-400">(browser autoplay rule ki wajah se ek click chahiye)</span>
          </button>
        )}
      </div>

      {/* transport controls */}
      <div className="mt-3 rounded-2xl bg-panel border border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={togglePlay}
            className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-r from-accent to-accent2 flex items-center justify-center text-lg hover:opacity-90">
            {playback.playing ? '⏸️' : '▶️'}
          </button>
          <span className="text-xs text-gray-400 w-20 shrink-0">{fmtTime(displayPos)} / {fmtTime(duration)}</span>
          <input type="range" min="0" max={Math.max(duration, 0)} step="1" value={Math.min(displayPos, duration || 0)}
            onChange={(e) => seek(e.target.value)} className="seek flex-1" />
          <button onClick={toggleMute} className="shrink-0 text-lg" title="Mute / unmute (sirf tumhare liye)">
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button onClick={() => applyState(true)} className="shrink-0 text-xs bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg px-2.5 py-1.5" title="Dubara sync karo">
            🔄 Sync
          </button>
        </div>
        {playback.title && <div className="mt-2 text-sm font-medium truncate">🎵 {playback.title}</div>}
        <div className="text-[11px] text-gray-500 mt-0.5">
          {playback.playing ? '▶ Sab ke saath sync me chal raha hai' : '⏸ Paused — koi bhi play karega to sab ke liye chalega'}
        </div>
      </div>
    </div>
  );
}
