import { useEffect, useState } from 'react';
import { getSocket, emitAck } from '../lib/socket.js';

export default function Home({ onEnter }) {
  const [name, setName] = useState(() => localStorage.getItem('adda-name') || '');
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room') || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();
  }, []);

  const guard = () => {
    if (!name.trim()) { setError('Pehle apna naam likho 🙂'); return false; }
    localStorage.setItem('adda-name', name.trim());
    return true;
  };

  const create = async () => {
    if (!guard()) return;
    setBusy(true); setError('');
    try {
      const res = await emitAck('create_room', { name: name.trim(), roomName: roomName.trim() });
      if (res?.ok) onEnter(res.state);
      else setError(res?.error || 'Room nahi bana, phir try karo.');
    } catch { setError('Server se connect nahi ho paaya.'); }
    setBusy(false);
  };

  const join = async () => {
    if (!guard()) return;
    if (!code.trim()) { setError('Room code daalo.'); return; }
    setBusy(true); setError('');
    try {
      const res = await emitAck('join_room', { code: code.trim(), name: name.trim() });
      if (res?.ok) onEnter(res.state);
      else setError(res?.error || 'Room join nahi hua.');
    } catch { setError('Server se connect nahi ho paaya.'); }
    setBusy(false);
  };

  const inputCls =
    'w-full rounded-xl bg-panel2 border border-white/10 px-4 py-3 text-sm outline-none focus:border-accent placeholder:text-gray-500';

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,#1e1b3a_0%,#0b0b14_55%)]">
      <div className="w-full max-w-md pop-in">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🛋️</div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Adda <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent2">Chill Together</span>
          </h1>
          <p className="text-gray-400 text-sm mt-2">
            Ek room, saare dost — saath chat, gaane, movie, baatein aur kaam. ✨
          </p>
        </div>

        <div className="rounded-3xl bg-panel border border-white/10 p-6 shadow-2xl space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-400">Tumhara naam</label>
            <input className={`${inputCls} mt-1.5`} placeholder="e.g. Harsh" value={name}
              onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>

          <div className="rounded-2xl bg-panel2/60 border border-white/5 p-4 space-y-3">
            <div className="font-semibold text-sm">🎉 Naya room banao</div>
            <input className={inputCls} placeholder="Room ka naam (optional) — e.g. Friday Night Adda"
              value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={50} />
            <button onClick={create} disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-accent to-accent2 py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition">
              Create Room
            </button>
          </div>

          <div className="flex items-center gap-3 text-gray-500 text-xs">
            <div className="h-px flex-1 bg-white/10" /> ya <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="rounded-2xl bg-panel2/60 border border-white/5 p-4 space-y-3">
            <div className="font-semibold text-sm">🔑 Code se join karo</div>
            <div className="flex gap-2">
              <input className={`${inputCls} uppercase tracking-[0.3em] text-center font-bold`} placeholder="CODE"
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5}
                onKeyDown={(e) => e.key === 'Enter' && join()} />
              <button onClick={join} disabled={busy}
                className="shrink-0 rounded-xl bg-white/10 border border-white/15 px-5 font-semibold text-sm hover:bg-white/15 disabled:opacity-50 transition">
                Join
              </button>
            </div>
          </div>

          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
        </div>

        <p className="text-center text-xs text-gray-500 mt-5">
          🎬 Watch together · 🎧 Listen together · 🎙️ Voice chat · 📝 Saath kaam
        </p>
      </div>
    </div>
  );
}
