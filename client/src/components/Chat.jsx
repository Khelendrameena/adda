import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';
import { avatarColor } from '../lib/media.js';

export default function Chat({ messages, myName }) {
  const socket = getSocket();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    socket.emit('chat_message', { text: t });
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500 text-center pt-6">Abhi koi message nahi — pehla hello tum bolo 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.name === myName;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                style={{ background: avatarColor(m.name) }}>
                {m.name.slice(0, 1).toUpperCase()}
              </div>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-accent/80 rounded-tr-sm' : 'bg-panel2 rounded-tl-sm'}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-white/80">{mine ? 'Tum' : m.name}</span>
                  <span className="text-[10px] text-white/40">
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          className="flex-1 rounded-xl bg-panel2 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-accent placeholder:text-gray-500"
          placeholder="Message likho…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={1000}
        />
        <button onClick={send} className="rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 text-sm font-semibold hover:opacity-90">
          ➤
        </button>
      </div>
    </div>
  );
}
