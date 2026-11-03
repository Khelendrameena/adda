import { useState } from 'react';
import { getSocket } from '../lib/socket.js';
import { fetchTitle, isYouTube } from '../lib/media.js';

export default function QueuePanel({ queue, playback, isHost, queueError }) {
  const socket = getSocket();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (mode) => {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    const title = await fetchTitle(u);
    if (mode === 'play') socket.emit('playback_set', { url: u, title });
    else socket.emit('queue_add', { url: u, title });
    setUrl('');
    setBusy(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/10 space-y-2">
        <input
          className="w-full rounded-xl bg-panel2 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-accent placeholder:text-gray-500"
          placeholder="YouTube ya .mp4 link paste karo…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit('queue')}
        />
        <div className="flex gap-2">
          <button onClick={() => submit('play')} disabled={busy || !url.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-accent to-accent2 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            ▶ Play Now
          </button>
          <button onClick={() => submit('queue')} disabled={busy || !url.trim()}
            className="flex-1 rounded-xl bg-white/10 border border-white/15 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-white/15">
            ➕ Queue
          </button>
        </div>
        {queueError && <div className="text-xs text-red-400">{queueError}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {playback && playback.type !== 'none' && (
          <div className="rounded-xl bg-accent/15 border border-accent/30 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-accent font-bold">Now Playing {playback.playing ? '▶' : '⏸'}</div>
            <div className="text-sm font-medium truncate mt-0.5">{playback.title || (isYouTube(playback.url) ? 'YouTube video' : playback.url)}</div>
          </div>
        )}

        {queue.length === 0 && (
          <p className="text-xs text-gray-500 text-center pt-4">Queue khaali hai — agla gaana tum lagao 🎧</p>
        )}
        {queue.map((q, i) => (
          <div key={q.id} className="flex items-center gap-3 rounded-xl bg-panel2 border border-white/5 px-3 py-2.5">
            <span className="text-gray-500 text-sm font-bold w-5 text-center">{i + 1}</span>
            {q.videoId
              ? <img src={`https://i.ytimg.com/vi/${q.videoId}/default.jpg`} alt="" className="w-14 h-9 object-cover rounded-md shrink-0" />
              : <span className="text-xl shrink-0">🎬</span>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{q.title || q.url}</div>
              <div className="text-[11px] text-gray-500">lagaya: {q.addedBy}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={() => socket.emit('queue_next')}
          disabled={!isHost}
          title={isHost ? 'Agla gaana chalao' : 'Sirf host next kar sakta hai'}
          className="w-full rounded-xl bg-white/10 border border-white/15 py-2.5 text-sm font-semibold disabled:opacity-40 hover:bg-white/15">
          ⏭️ Next {isHost ? '' : '(host only)'}
        </button>
      </div>
    </div>
  );
}
