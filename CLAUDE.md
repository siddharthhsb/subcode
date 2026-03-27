# SubCode — Full Project Context

## What this is
A competitive multiplayer browser game where players write Python or C bots
to control submarines fighting in a 3D 10×10×10 grid. CS50 final project.

## Tech stack
- Frontend: React + Vite at /client (port 5173)
- Backend: Node.js + Express at /server (port 4000)
- Database: PostgreSQL — database: subcode_db, user: postgres, password: subcode123
- Real-time: Socket.io
- Python bots: Pyodide (runs in browser)
- C bots: Docker sandbox (gcc inside Alpine Linux, image: subcode-c-sandbox)
- Deployment target: Vercel (frontend) + Railway (backend + DB)

## Custom game rules
- 6 torpedoes + 6 mines per MATCH (no refill between rounds)
- Detection radii: slow=3u, fast=4u, max=5u
- Round timer: 60 seconds, between rounds: 30 seconds
- Blink interval: 1 second
- OOB damage: 20 HP per blink

## Visual style
- Background: #060C10, Cards: #040910, Border: #0d2a1a
- Green: #00FF9F, Amber: #FFB800, Red: #FF4444
- Font: JetBrains Mono throughout

## Completed stages (00-08)
- Stage 00: Dev environment (Node, Docker, PostgreSQL, VS Code)
- Stage 01: Express server, PostgreSQL schema, auth API (register/login/JWT)
- Stage 02: React frontend, Landing, Login, Register, Menu pages
- Stage 03: Monaco editor, Python+C starter scripts, script save/load API
- Stage 04: Full game engine (movement, sonar, weapons, rounds) — 20 tests pass
- Stage 05: Python sandbox (Pyodide), C sandbox (Docker), compile API
- Stage 06: Socket.io, matchmaking queue, game loop, match session manager
- Stage 07: Cockpit view (Canvas), live match UI, slide-in code editor
- Stage 08: Replay system (top-down XY, side XZ, cockpit POV, playback controls)
- Stage 09: ELO system & leaderboard — ELO calculation, stats tracking, leaderboard API & UI

## Database tables
users, scripts, matches, rounds, replays, leaderboard

## Key file locations
/client/src/pages — Landing, Login, Register, Menu, Editor, Match, Replay, Leaderboard
/client/src/context — AuthContext.jsx, SocketContext.jsx
/client/src/engine — pythonSandbox.js
/server/engine — gameState.js, movement.js, sonar.js, weapons.js, roundManager.js, blinkLoop.js
/server/game — matchManager.js, matchmaking.js, gameLoop.js, socketHandler.js
/server/sandbox — cSandbox.js, Dockerfile
/server/routes — auth.js, scripts.js, sandbox.js, replays.js, leaderboard.js
/server/middleware — auth.js (JWT)
/server/config — db.js (PostgreSQL pool)

## Remaining stages to build

### Stage 10 — Player Profile & Match History
- Need: GET /api/profile/:username route
- Need: GET /api/matches route (paginated match history)
- Need: /profile/:username page
- Need: match history list with results, ELO delta, replay button

### Stage 11 — Campaign Screen
- Just a styled "Coming Soon" page at /campaign
- Show Tutorial Phase and Bot Gauntlet sections with locked icons
- No functionality needed

### Stage 12 — Visual Style & How to Play
- Global dark theme already applied
- Need: /how-to-play page with accordion (13 topics from game rules)
- Need: loading states, error toasts, empty states throughout app
- Need: polish the existing pages

### Stage 13 — Deployment
- Frontend → Vercel (connect GitHub repo)
- Backend + DB → Railway
- Add production environment variables
- Update client API base URL to production Railway URL
- Test end-to-end on live URLs

## GitHub repo
https://github.com/siddharthhsb/subcode

## Important notes for Claude
- The .env file in /server has all credentials — never commit it
- JWT_SECRET is in .env as subcode_super_secret_key_change_this_later
- The server uses CommonJS (require/module.exports), not ES modules
- The client uses ES modules (import/export)
- Always run `npm run dev` in /server and /client separately
- Docker must be running for C sandbox to work
- PostgreSQL must be running on port 5432