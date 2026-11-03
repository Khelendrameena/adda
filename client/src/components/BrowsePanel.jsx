import { useState } from 'react';
import { getSocket, API_URL } from '../lib/socket.js';

/**
 * Dekho / Search tab — in-app YouTube search & browse.
 * Server ka /api/search (yt-search) results deta hai; har result ko seedha
 * sabke liye Play ya Queue kiya ja sakta hai — link paste karne ki zaroorat nahi.
 */

const CHIPS = [
  { label: '🔥 Trending Songs', q: 'trending songs india' },
  { label: '🎬 Bollywood Hits', q: 'bollywood hits songs' },
  { label: '🎧 Lofi', q: 'lofi music' },
  { label: '😂 Comedy', q: 'stand up comedy hindi' },
  { label: '🏏 Cricket Highlights', q: 'cricket highlights' },
  { label: '🎤 Punjabi Songs', q: 'punjabi songs latest' },
];

function fmtViews(n) {
  if (!n) return '';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, '')} Cr views`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, '')} L views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K views`;
  return `${n} views`;
}

export default function BrowsePanel() {
  const socket = getSocket();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [activeChip, setActiveChip] = useState('');

  const run = async (query, chipLabel = '') => {
    const queryText = String(query || '').trim();
    if (!queryText || loading) return;
    setActiveChip(chipLabel);
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const r = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(queryText)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'fail');
      setResults(j.results || []);
    } catch {
      setResults([]);
      setError('Search nahi ho paya — connection check karke phir try karo.');
    } finally {
      setLoading(false);
    }
  };

  const play = (v) => socket.emit('playback_set', {
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
  });

  const queue = (v) => socket.emit('queue_add', {
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/10 space-y-2.5">
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 rounded-xl bg-panel2 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-accent placeholder:text-gray-500"
            placeholder="Gaana, video, kuch bhi search karo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run(q)}
          />
          <button onClick={() => run(q)} disabled={loading || !q.trim()}
            className="shrink-0 rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            🔍
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.label} onClick={() => { setQ(c.q); run(c.q, c.label); }} disabled={loading}
              className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold border transition disabled:opacity-40 ${activeChip === c.label ? 'bg-accent/25 border-accent/50 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-white/15 border-t-accent animate-spin" />
            <p className="text-xs text-gray-400">Dhoondh rahe hain…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2.5">{error}</div>
        )}

        {!loading && !error && !searched && (
          <p className="text-xs text-gray-500 text-center pt-6 leading-relaxed">
            Upar se kuch search karo ya ek chip dabao 👆<br />
            Pasand aaye to seedha <b className="text-gray-300">Play</b> — poora room ek saath dekhega, bina link paste kiye!
          </p>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <p className="text-xs text-gray-500 text-center pt-6">Kuch nahi mila — kuch aur search karke dekho.</p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {results.map((v) => (
            <div key={v.videoId} className="rounded-xl bg-panel2 border border-white/5 overflow-hidden flex flex-col">
              <div className="relative">
                <img src={v.thumbnail} alt="" loading="lazy" className="w-full aspect-video object-cover" />
                {v.duration && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold">{v.duration}</span>
                )}
              </div>
              <div className="p-2 flex flex-col flex-1">
                <div className="text-xs font-medium leading-snug line-clamp-2">{v.title}</div>
                <div className="text-[10px] text-gray-500 mt-1 truncate">
                  {[v.author, fmtViews(v.views)].filter(Boolean).join(' • ')}
                </div>
                <div className="flex gap-1.5 mt-auto pt-2">
                  <button onClick={() => play(v)}
                    className="flex-1 rounded-lg bg-gradient-to-r from-accent to-accent2 py-1.5 text-[11px] font-semibold hover:opacity-90">
                    ▶ Play
                  </button>
                  <button onClick={() => queue(v)}
                    className="flex-1 rounded-lg bg-white/10 border border-white/15 py-1.5 text-[11px] font-semibold hover:bg-white/15">
                    ➕ Queue
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
