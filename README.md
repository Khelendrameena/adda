# 🛋️ Adda — Chill Together

Ek virtual hangout room jahan dost ek saath **chat** kar sakte hain, **gaane/video sync me dekh-sun** sakte hain, **voice par baat** kar sakte hain, aur **saath kaam** (shared notepad + to-do) bhi kar sakte hain. Bas room banao, code/link share karo, adda shuru!

## ✨ Features

- **Rooms** — Room banao (5-letter code + shareable link), code se join karo. Host = creator; host chala jaye to host next member ko mil jata hai. Khali room auto-delete.
- **Real-time chat** — Naam + time ke saath messages, per room last 100 messages (server memory).
- **Dekho / Search 🔍** — Link paste karne ki jhanjhat khatm! App ke andar hi YouTube search karo (server ka `GET /api/search`, keyless `yt-search`, 5-minute cache) ya quick chips dabao — 🔥 Trending Songs, 🎬 Bollywood Hits, 🎧 Lofi, 😂 Comedy, 🏏 Cricket Highlights, 🎤 Punjabi Songs. Har result par **▶ Play** (sabke liye turant) aur **➕ Queue** button. Link paste wala option Queue tab me chhota fallback banke reh gaya hai.
- **Watch together 🎬** — Shared stage player: YouTube links (IFrame API) aur direct `.mp4` links. Play / pause / seek poore room ke liye sync — jo late join kare wo seedha current position par aa jata hai, aur har 5 second me drift-correction (>1.5s drift = auto resync).
- **Listen together 🎧** — Queue panel: koi bhi gaana queue kar sakta hai; current khatm hote hi (ya host ke Next par) agla sab ke liye ek saath chalta hai.
- **Screen Share 🖥️** — Ek member apna browser tab / window / poori screen share kar sakta hai (tab ki awaaz ke saath). Share chalte hi stage par sab ko wahi screen badi dikhti hai; share rukte hi stage wapas sync player par aa jata hai. Late joiner ko bhi share apne aap connect ho jata hai. Alag WebRTC peer connections par chalta hai, voice mesh se bilkul independent.
- **Talk 🎙️** — WebRTC mesh voice chat (audio only, peer-to-peer), mic mute/unmute. Chhote rooms (2–6 log) ke liye perfect.
- **Saath Kaam 📝** — Shared notepad (debounced live sync) + shared to-do list (add / toggle / delete), poora room synced.
- **Fun ✨** — Emoji reaction button: emoji sab ke stage par float karke udta hai.

## 🧱 Architecture

```
adda/
├── server/          Node.js + Express + Socket.IO (in-memory room store)
│   ├── index.js     Rooms, chat, playback state machine, queue, notes/todos,
│   │                WebRTC signaling relay (voice + screen), reactions, presence,
│   │                GET /api/search — keyless YouTube search (yt-search, 5-min cache)
│   └── test/smoke.js  Headless 2-client Socket.IO smoke test
└── client/          React + Vite + Tailwind CSS (dark premium UI)
    └── src/
        ├── components/  Home, Room, Stage (synced player), ScreenStage (live share),
        │                Chat, QueuePanel, BrowsePanel (search), WorkPanel
        └── hooks/  useVoice.js (WebRTC mesh voice), useScreenShare.js (screen share)
```

**Sync model:** Server har room ka authoritative playback state rakhta hai — `{ type, videoId/url, playing, positionSec, updatedAt, queue }`. Client expected position = `positionSec + (now − updatedAt)` jab playing ho. Actions (play/pause/seek) server se hote hue sab ko broadcast hote hain; late joiner ko snapshot me hi current effective position milta hai.

**Search:** Client `GET /api/search?q=...` call karta hai. Server `yt-search` (YouTube scrape, koi API key nahi) se top 12 results `{ videoId, title, thumbnail, duration, views, author }` deta hai, per-query 5 minute in-memory cache ke saath. Play/Queue wahi purane playback/queue events use karte hain — isliye search se lagaya gaana bhi poori tarah sync rehta hai.

**Screen share:** Ek time par ek hi sharer — server room state me sharer track karta hai (snapshot me bhi, taaki late joiner ko pata ho). Sharer `getDisplayMedia` se capture karke har member ke liye alag RTCPeerConnection banata hai; signaling `screen_offer` / `screen_answer` / `screen_ice` events se relay hota hai (voice wale `webrtc_*` events se alag). Stage hamesha live share ko player se upar rakhta hai.

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
- Client server URL: `VITE_API_URL` env set ho to wahi; warna Vite dev (`:5173`) par `http://localhost:4000`; production/tunnel mode me page ka apna origin (same-origin — kuch set nahi karna padta)

## 🏠 Cloudflare Tunnel se ghar se host karo (free)

Poora Adda — site + server — apne hi PC/WSL se chalao aur ek hi public link doston ko de do. Kuch deploy nahi karna, koi account nahi chahiye.

```bash
# (a) ek hi baar: saari dependencies install karo
npm run install:all

# (b) production mode: client build hoga, phir server site + API + sockets
#     SAB ek hi port par dega → http://localhost:4000
npm run start:prod
```

Phir `cloudflared` lagao (WSL me, ek hi baar):

```bash
# (c) official Cloudflare GitHub release se binary download karo
curl -L -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
mv cloudflared ~/cloudflared        # ya: sudo mv cloudflared /usr/local/bin/
```

Ab tunnel chalao (server wale terminal ke alawa ek aur terminal me):

```bash
# (d) tunnel — ye ek https://<random>.trycloudflare.com URL print karega
~/cloudflared tunnel --url http://localhost:4000
```

Print hua `https://<random>.trycloudflare.com` link doston ko bhej do — wahi kholkar seedha room join kar lenge. Koi `VITE_API_URL` set nahi karna: production mode me client khud page ke origin se API/socket dhoondh leta hai.

**Dhyan do:**
- Quick tunnel ka **URL har restart par badal jata hai** — koi account nahi chahiye, bas naya link phir se share karna hoga.
- Site sirf **tab tak online hai jab tak PC + `start:prod` server + tunnel teeno chal rahe hain** — kuch band kiya to adda band.
- Tunnel HTTPS deta hai, isliye **mic aur screen-share permissions tunnel wale link par bhi kaam karte hain** (secure context).
- Fixed URL chahiye to baad me upgrade: Cloudflare account + apna domain ke saath **named tunnel** bana lo — phir link hamesha wahi rahega.

## ✅ Smoke test

```bash
npm run test:smoke
```

Ye server ko test port par chala kar do headless clients se room create/join, chat delivery, playback sync, notes sync, todo aur queue verify karta hai (PASS/FAIL print hota hai).

> ⚠️ WebRTC voice aur screen share headless test nahi ho sakte — do asli browsers/tabs (mic/screen permission ke saath) se verify karna hota hai. Autoplay policy ki wajah se pehli baar media ke liye stage par ek "🔊 click to sync" tap maang sakta hai — ye normal hai.

> 🖥️ **Screen share aur DRM:** YouTube aur zyada-tar websites tab share me theek dikhte hain, lekin DRM-protected sites (Netflix, Hotstar, Prime Video waghera) browser DRM ki wajah se share me aksar **black screen** dikhate hain. Ye browser ka rule hai, app ki galti nahi — unke liye sab apne-apne browser me kholkar saath play karna ya sync player use karna behtar hai.

## 🌐 Deploy notes

- **Server → Render:** New Web Service, root `server/`, build `npm install`, start `npm start`. Render ka `PORT` env apne aap mil jata hai. Free tier par idle sleep hoga — pehla load slow ho sakta hai.
- **Client → Vercel:** Project root `client/`, framework Vite. Env var set karo: `VITE_API_URL=https://<your-render-service>.onrender.com` phir deploy.
- Group voice ke liye production me HTTPS zaroori hai (mic ke liye) — Render/Vercel dono default HTTPS dete hain. Zyada bade rooms ya NAT issues ke liye apna TURN server (coturn) add karna hoga; 2–6 doston ke liye STUN kaafi hai.

## 🛠️ Tech

Node.js · Express · Socket.IO · React · Vite · Tailwind CSS · YouTube IFrame API · yt-search · WebRTC (voice mesh + screen share)
