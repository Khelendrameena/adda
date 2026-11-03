import { useEffect, useRef } from 'react';

/**
 * Big stage view while someone shares their screen/tab.
 * Takes priority over the synced YouTube/mp4 player; when the share stops,
 * Room swaps back to the regular Stage automatically.
 */
export default function ScreenStage({ sharer, isMe, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream || null;
    if (stream) v.play().catch(() => { /* autoplay nudge — click on the video retries */ });
  }, [stream]);

  return (
    <div className="w-full">
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-sky-500/30">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMe}
          onClick={(e) => e.currentTarget.play().catch(() => {})}
          className="absolute inset-0 w-full h-full object-contain"
        />
        {!stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6">
            <div className="text-4xl">🖥️</div>
            <div className="font-semibold">Screen aa rahi hai…</div>
            <div className="text-xs text-gray-400">Connection ban raha hai, ek second rukho</div>
          </div>
        )}
        <div className="absolute top-3 left-3 z-10 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-xs font-semibold border border-white/15">
          🖥️ {isMe ? 'Tumhari screen sab dekh rahe hain' : `${sharer?.name || 'Koi'} ki screen — LIVE`}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-panel border border-white/10 px-4 py-3 text-[13px] text-gray-300">
        {isMe
          ? 'Jo tab/window tumne chuna hai wahi sab ko dikh raha hai (tab ki awaaz ke saath). Rokne ke liye neeche “🛑 Share Roko” ya browser ka Stop sharing dabao.'
          : 'Screen share live hai — gaana/video share rukte hi stage par wapas sync me chalega.'}
      </div>
    </div>
  );
}
