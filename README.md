# 🛋️ Adda — Chill Together

Ek virtual hangout room jahan dost ek saath **chat** kar sakte hain, **gaane/video sync me dekh-sun** sakte hain, **voice par baat** kar sakte hain, aur **saath kaam** (shared notepad + to-do) bhi kar sakte hain. Bas room banao, code/link share karo, adda shuru!

## ✨ Features

- **Rooms** — Room banao (5-letter code + shareable link), code se join karo. Host = creator; host chala jaye to host next member ko mil jata hai. Khali room auto-delete.
- **Real-time chat** — Naam + time ke saath messages, per room last 100 messages (server memory).
- **Watch together 🎬** — Shared stage player: YouTube links (IFrame API) aur direct `.mp4` links. Play / pause / seek poore room ke liye sync — jo late join kare wo seedha current position par aa jata hai, aur har 5 second me drift-correction (>1.5s drift = auto resync).
- **Listen together 🎧** — Queue panel: koi bhi YouTube link queue kar sakta hai; current khatm hote hi (ya host ke Next par) agla sab ke liye ek saath chalta hai.
- **Talk 🎙️** — WebRTC mesh voice chat (audio only, peer-to-peer), mic mute/unmute. Chhote rooms (2–6 log) ke liye perfect.
- **Saath Kaam 📝** — Shared notepad (debounced live sync) + shared to-do list (add / toggle / delete), poora room synced.
- **Fun ✨** — Emoji reaction button: emoji sab ke stage par float karke udta hai.

## 🧱 Architecture

```
adda/
├── server/          Node.js + Express + Socket.IO (in-memory room store)
│   ├── index.js     Rooms, chat, playback state machine, queue, notes/todos,
│   │                WebRTC signaling relay, reactions, presence
│   └── test/smoke.js  Headless 2-client Socket.IO smoke test
└── client/          React + Vite + Tailwind CSS (dark premium UI)
    └── src/
        ├── components/  Home, Room, Stage (synced player), Chat, QueuePanel, WorkPanel
        └── hooks/useVoice.js  WebRTC mesh voice
```

**Sync model:** Server har room ka authoritative playback state rakhta hai — `{ type, videoId/url, playing, positionSec, updatedAt, queue }`. Client expected position = `positionSec + (now − updatedAt)` jab playing ho. Actions (play/pause/seek) server se hote hue sab ko broadcast hote hain; late joiner ko snapshot me hi current effective position milta hai.

**Voice:** Audio WebRTC se seedha peer-to-peer jaata hai; server sirf signaling (offer/answer/ICE) relay karta hai. STUN: Google public STUN.

## 🚀 Local run

```bash
# 1) deps install karo (root se)
npm run install:all

# 2) server chalao (terminal 1) — http://localhost:4000
npm run start:server

# 3) client chalao (terminal 2) — http://localhost:5173
npm run dev:client
```

Browser me `http://localhost:5173` kholo, naam likho, **Create Room** → code doston ko bhejo.
Dusri tab/window se test karna ho to wahi code daal ke **Join** karo.

- Server port: `PORT` env (default `4000`). Health check: `GET /health` → `{ "ok": true }`
- Client server URL: `VITE_API_URL` env (default `http://localhost:4000`)

## ✅ Smoke test

```bash
npm run test:smoke
```

Ye server ko test port par chala kar do headless clients se room create/join, chat delivery, playback sync, notes sync, todo aur queue verify karta hai (PASS/FAIL print hota hai).

> ⚠️ WebRTC voice headless test nahi ho sakta — do asli browsers/tabs (mic permission ke saath) se verify karna hota hai. Autoplay policy ki wajah se pehli baar media ke liye stage par ek "🔊 click to sync" tap maang sakta hai — ye normal hai.

## 🌐 Deploy notes

- **Server → Render:** New Web Service, root `server/`, build `npm install`, start `npm start`. Render ka `PORT` env apne aap mil jata hai. Free tier par idle sleep hoga — pehla load slow ho sakta hai.
- **Client → Vercel:** Project root `client/`, framework Vite. Env var set karo: `VITE_API_URL=https://<your-render-service>.onrender.com` phir deploy.
- Group voice ke liye production me HTTPS zaroori hai (mic ke liye) — Render/Vercel dono default HTTPS dete hain. Zyada bade rooms ya NAT issues ke liye apna TURN server (coturn) add karna hoga; 2–6 doston ke liye STUN kaafi hai.

## 🛠️ Tech

Node.js · Express · Socket.IO · React · Vite · Tailwind CSS · YouTube IFrame API · WebRTC
