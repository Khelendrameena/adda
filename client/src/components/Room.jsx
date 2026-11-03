import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';
import { avatarColor } from '../lib/media.js';
import { useVoice } from '../hooks/useVoice.js';
import Stage from './Stage.jsx';
import Chat from './Chat.jsx';
import QueuePanel from './QueuePanel.jsx';
import WorkPanel from './WorkPanel.jsx';

const EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎉', '💯'];
const TABS = [
  { id: 'chat', label: '💬 Chat' },
  { id: 'queue', label: '🎧 Queue' },
  { id: 'work', label: '📝 Saath Kaam' },
];

export default function Room({ initial, myName, onLeave }) {
  const socket = getSocket();
  const [members, setMembers] = useState(initial.members);
  const [hostId, setHostId] = useState(initial.hostId);
  const [messages, setMessages] = useState(initial.messages || []);
  const [playback, setPlayback] = useState(initial.playback);
  const [queue, setQueue] = useState(initial.queue || []);
  const [notes, setNotes] = useState(initial.notes || '');
  const [todos, setTodos] = useState(initial.todos || []);
  const [tab, setTab] = useState('chat');
  const [queueError, setQueueError] = useState('');
  const [reactions, setReactions] = useState([]);
  const [voiceSet, setVoiceSet] = useState(new Set(initial.voicePeers || []));
  const [copied, setCopied] = useState(false);
  const reactionId = useRef(0);

  const voice = useVoice();
  const isHost = hostId === initial.youId;
  const myId = initial.youId;

  useEffect(() => {
    const onMembers = ({ members, hostId }) => { setMembers(members); setHostId(hostId); };
    const onChat = (m) => setMessages((prev) => [...prev.slice(-99), m]);
    const onPlayback = (s) => setPlayback(s);
    const onQueue = (q) => setQueue(q);
    const onQueueError = ({ error }) => { setQueueError(error); setTimeout(() => setQueueError(''), 4000); };
    const onNotes = ({ text }) => setNotes(text);
    const onTodos = (t) => setTodos(t);
    const onReaction = ({ emoji }) => {
      const id = ++reactionId.current;
      const x = 4 + Math.random() * 88;
      setReactions((r) => [...r, { id, emoji, x }]);
      setTimeout(() => setReactions((r) => r.filter((x2) => x2.id !== id)), 2700);
    };
    const onVoiceJoined = ({ id }) => setVoiceSet((s) => new Set(s).add(id));
    const onVoiceLeft = ({ id }) => setVoiceSet((s) => { const n = new Set(s); n.delete(id); return n; });

    socket.on('members_update', onMembers);
    socket.on('chat_message', onChat);
    socket.on('playback_state', onPlayback);
    socket.on('queue_update', onQueue);
    socket.on('queue_error', onQueueError);
    socket.on('notes_update', onNotes);
    socket.on('todos_update', onTodos);
    socket.on('reaction', onReaction);
    socket.on('voice_peer_joined', onVoiceJoined);
    socket.on('voice_peer_left', onVoiceLeft);
    return () => {
      socket.off('members_update', onMembers);
      socket.off('chat_message', onChat);
      socket.off('playback_state', onPlayback);
      socket.off('queue_update', onQueue);
      socket.off('queue_error', onQueueError);
      socket.off('notes_update', onNotes);
      socket.off('todos_update', onTodos);
      socket.off('reaction', onReaction);
      socket.off('voice_peer_joined', onVoiceJoined);
      socket.off('voice_peer_left', onVoiceLeft);
    };
  }, [socket]);

  /* keep own voice presence in the local set */
  useEffect(() => {
    setVoiceSet((s) => {
      const n = new Set(s);
      if (voice.inVoice) n.add(myId); else n.delete(myId);
      return n;
    });
  }, [voice.inVoice, myId]);

  const copyInvite = async () => {
    const link = `${location.origin}${location.pathname}?room=${initial.code}`;
    const text = `Adda me aao! 🛋️ Room: ${initial.name}\nCode: ${initial.code}\nJoin: ${link}`;
    try { await navigator.clipboard.writeText(text); } catch {
      try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leave = () => {
    if (voice.inVoice) voice.leaveVoice();
    socket.disconnect();
    onLeave();
  };

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <header className="border-b border-white/10 bg-panel/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="text-2xl">🛋️</div>
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate max-w-[220px] sm:max-w-xs">{initial.name}</div>
            <div className="text-[11px] text-gray-400 leading-tight">
              Code <span className="font-mono font-bold text-accent tracking-widest">{initial.code}</span>
              {isHost && <span className="ml-2 text-amber-400">👑 Tum host ho</span>}
            </div>
          </div>

          <button onClick={copyInvite}
            className="ml-1 rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/15">
            {copied ? '✅ Copied!' : '🔗 Invite Copy'}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex -space-x-2">
              {members.slice(0, 6).map((m) => (
                <div key={m.id} title={m.name + (voiceSet.has(m.id) ? ' (voice me hai)' : '')}
                  className="relative w-8 h-8 rounded-full border-2 border-panel flex items-center justify-center text-xs font-bold"
                  style={{ background: avatarColor(m.name) }}>
                  {m.name.slice(0, 1).toUpperCase()}
                  {voiceSet.has(m.id) && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-panel" />}
                </div>
              ))}
            </div>
            <span className="text-xs text-gray-400">{members.length} online</span>
            <button onClick={leave} className="rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 px-3 py-2 text-xs font-semibold hover:bg-red-500/25">
              🚪 Leave
            </button>
          </div>
        </div>
      </header>

      {/* main */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4 min-h-0">
        <section className="flex-1 min-w-0">
          <div className="relative">
            <Stage playback={playback} />
            {/* floating reactions overlay */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              {reactions.map((r) => (
                <span key={r.id} className="reaction-float absolute bottom-3 text-4xl" style={{ left: `${r.x}%` }}>{r.emoji}</span>
              ))}
            </div>
          </div>

          {/* reactions + voice bar */}
          <div className="mt-3 rounded-2xl bg-panel border border-white/10 px-4 py-3 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => socket.emit('reaction', { emoji: e })}
                  className="text-2xl hover:scale-125 active:scale-95 transition px-0.5" title="Reaction bhejo">
                  {e}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block" />
            {!voice.inVoice ? (
              <button onClick={voice.joinVoice}
                className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/30">
                🎙️ Voice Join Karo
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={voice.toggleMute}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold border ${voice.muted ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-white/10 border-white/15'}`}>
                  {voice.muted ? '🔇 Unmute' : '🎙️ Mute'}
                </button>
                <button onClick={voice.leaveVoice}
                  className="rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/15">
                  📞 Voice Chhodo
                </button>
                <span className="text-xs text-emerald-300">● Voice live ({voiceSet.size})</span>
              </div>
            )}
            <span className="text-[11px] text-gray-500 ml-auto hidden md:block">Emoji dabao — sab ke stage par udega ✨</span>
          </div>

          {/* members list (compact) */}
          <div className="mt-3 rounded-2xl bg-panel border border-white/10 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Room me kaun hai</div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-panel2 border border-white/10 pl-1 pr-3 py-1 text-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: avatarColor(m.name) }}>
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  {m.name}{m.id === myId ? ' (tum)' : ''}{m.id === hostId ? ' 👑' : ''}{voiceSet.has(m.id) ? ' 🎙️' : ''}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* sidebar */}
        <aside className="w-full lg:w-[380px] shrink-0 rounded-3xl bg-panel border border-white/10 flex flex-col overflow-hidden h-[540px] lg:h-auto">
          <div className="flex border-b border-white/10">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-sm font-semibold transition ${tab === t.id ? 'bg-panel2 text-white border-b-2 border-accent' : 'text-gray-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {tab === 'chat' && <Chat messages={messages} myName={myName} />}
            {tab === 'queue' && <QueuePanel queue={queue} playback={playback} isHost={isHost} queueError={queueError} />}
            {tab === 'work' && <WorkPanel notes={notes} todos={todos} />}
          </div>
        </aside>
      </main>
    </div>
  );
}
