import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';

/** Saath Kaam: shared notepad + shared to-do list, synced for the whole room. */
export default function WorkPanel({ notes, todos }) {
  const socket = getSocket();
  const [localNotes, setLocalNotes] = useState(notes || '');
  const [todoText, setTodoText] = useState('');
  const notesRef = useRef(null);
  const debounceRef = useRef(null);
  const focusedRef = useRef(false);
  const pendingRemoteRef = useRef(null);

  /* remote notes arrive: apply immediately unless user is mid-typing */
  useEffect(() => {
    if (notes === localNotes) return;
    if (focusedRef.current) { pendingRemoteRef.current = notes; return; }
    setLocalNotes(notes || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const onNotesChange = (e) => {
    const v = e.target.value;
    setLocalNotes(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => socket.emit('notes_update', { text: v }), 300);
  };

  const onNotesBlur = () => {
    focusedRef.current = false;
    if (pendingRemoteRef.current != null) {
      setLocalNotes(pendingRemoteRef.current);
      pendingRemoteRef.current = null;
    }
  };

  const addTodo = () => {
    const t = todoText.trim();
    if (!t) return;
    socket.emit('todo_add', { text: t });
    setTodoText('');
  };

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* notepad */}
      <div className="p-3 border-b border-white/10">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">📝 Shared Notepad</div>
        <textarea
          ref={notesRef}
          className="w-full h-36 rounded-xl bg-panel2 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-accent placeholder:text-gray-500 resize-none"
          placeholder="Saath me notes likho — sab ko live dikhega…"
          value={localNotes}
          onChange={onNotesChange}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={onNotesBlur}
          maxLength={20000}
        />
      </div>

      {/* to-do */}
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">✅ Saath To-Do</div>
          <div className="text-[11px] text-gray-500">{doneCount}/{todos.length} done</div>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 rounded-xl bg-panel2 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-gray-500"
            placeholder="Kaam add karo…"
            value={todoText}
            onChange={(e) => setTodoText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            maxLength={200}
          />
          <button onClick={addTodo} className="rounded-xl bg-gradient-to-r from-accent to-accent2 px-3.5 text-sm font-semibold hover:opacity-90">+</button>
        </div>
        <div className="space-y-1.5">
          {todos.length === 0 && <p className="text-xs text-gray-500 text-center pt-2">Koi kaam nahi — chill mode 😎</p>}
          {todos.map((t) => (
            <div key={t.id} className="group flex items-center gap-2.5 rounded-xl bg-panel2 border border-white/5 px-3 py-2">
              <button
                onClick={() => socket.emit('todo_toggle', { id: t.id })}
                className={`w-5 h-5 rounded-md border flex items-center justify-center text-[11px] shrink-0 ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/25'}`}>
                {t.done ? '✓' : ''}
              </button>
              <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-500' : ''}`}>{t.text}</span>
              <span className="text-[10px] text-gray-500">{t.by}</span>
              <button onClick={() => socket.emit('todo_delete', { id: t.id })}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-sm">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
