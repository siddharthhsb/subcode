import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API = 'http://localhost:4000';
const GRID = 10;
const CELL = 36;

// ── DRAW TOP-DOWN VIEW (XY plane) ────────────────────────────────────────────
// ── TORPEDO ANIMATION STATE ───────────────────────────────────────────────────
// Stored outside component to persist across renders
const animState = { frame: null, animating: false, progress: 0, rafId: null };

function lerp(a, b, t) { return a + (b - a) * t; }

function drawBlast(ctx, x, y, radius, color) {
  // Expanding blast ring
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1 - radius / (CELL * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Inner fill
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = color.replace(')', ', 0.3)').replace('rgb', 'rgba');
  ctx.globalAlpha = 0.5 * (1 - radius / (CELL * 2));
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawGridBase(ctx, W, H, labelX, labelY) {
  ctx.fillStyle = '#060C10';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i <= GRID; i++) {
    ctx.strokeStyle = '#0d2a1a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H);
    ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a5c3a';
  ctx.font = '8px "Courier New", monospace';
  for (let i = 0; i < GRID; i++) {
    ctx.fillText(labelX + i, i * CELL + 12, H - 4);
    ctx.fillText(i, 2, i * CELL + 12);
  }
}

function drawSub(ctx, x, y, name, hp, color) {
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba') || 'rgba(0,255,159,0.15)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y - 14);
  ctx.fillText(`${hp}HP`, x, y + 22);
  ctx.textAlign = 'left';
}

// Draws animated frame — progress 0→1 between prevBlink and currentBlink
function renderTopDown(canvas, prevBlink, currentBlink, p1Name, p2Name, progress, blasts) {
  if (!canvas || !currentBlink) return;
  const ctx = canvas.getContext('2d');
  const S   = CELL * GRID;
  canvas.width  = S;
  canvas.height = S;

  drawGridBase(ctx, S, S, 'X:', '');

  // Static mines from current blink
  for (const m of (currentBlink.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL / 2;
    const my = Math.round(m.y) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
    ctx.strokeStyle = m.owner === 'p1' ? '#00FF9F' : '#FF8800';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Animate torpedoes — 1 unit at a time (XZ plane)
const prevTorps = prevBlink?.torpedoes || [];
const currTorps = currentBlink.torpedoes || [];
const UNITS_PER_BLINK = 6;

for (const t of currTorps) {
  const prev    = prevTorps.find(p => p.id === t.id);
  const startX  = prev ? prev.x : t.x;
  const startZ  = prev ? prev.z : t.z;
  const totalDX = t.x - startX;
  const totalDZ = t.z - startZ;
  const color   = t.owner === 'p1' ? '#00FF9F' : '#FFB800';
  const trailColor = t.owner === 'p1' ? 'rgba(0,255,159,0.35)' : 'rgba(255,184,0,0.35)';
  const unitsDone = progress * UNITS_PER_BLINK;

  for (let u = 0; u < Math.floor(unitsDone); u++) {
    const ax = (startX + (totalDX / UNITS_PER_BLINK) * u)       * CELL + CELL / 2;
    const az = (startZ + (totalDZ / UNITS_PER_BLINK) * u)       * CELL + CELL / 2;
    const bx = (startX + (totalDX / UNITS_PER_BLINK) * (u + 1)) * CELL + CELL / 2;
    const bz = (startZ + (totalDZ / UNITS_PER_BLINK) * (u + 1)) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.moveTo(ax, az);
    ctx.lineTo(bx, bz);
    ctx.strokeStyle = trailColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, bz, 2, 0, Math.PI * 2);
    ctx.fillStyle = trailColor;
    ctx.fill();
  }

  const fracProgress   = unitsDone % 1;
  const completedUnits = Math.floor(unitsDone);
  const curX = (startX + (totalDX / UNITS_PER_BLINK) * (completedUnits + fracProgress)) * CELL + CELL / 2;
  const curZ = (startZ + (totalDZ / UNITS_PER_BLINK) * (completedUnits + fracProgress)) * CELL + CELL / 2;

  ctx.beginPath();
  ctx.arc(curX, curZ, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(curX, curZ, 7, 0, Math.PI * 2);
  ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.4)' : 'rgba(255,184,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Torpedoes that disappeared this blink — animate to hit point then blast
for (const prev of prevTorps) {
  if (!currTorps.find(t => t.id === prev.id)) {
    const color      = prev.owner === 'p1' ? '#00FF9F' : '#FFB800';
    const trailColor = prev.owner === 'p1' ? 'rgba(0,255,159,0.35)' : 'rgba(255,184,0,0.35)';

    // We don't know exact hit point — extrapolate direction from velocity
    // vx/vy stored on torpedo object, or estimate from last known position
    const vx = prev.vx || 0;
    const vy = prev.vy || 0;
    const speed6 = Math.sqrt(vx*vx + vy*vy);
    const unitsDone = progress * UNITS_PER_BLINK;
    const maxUnits  = speed6 > 0 ? UNITS_PER_BLINK : 1;

    for (let u = 0; u < Math.min(Math.floor(unitsDone), maxUnits - 1); u++) {
      const ax = (prev.x + (vx / UNITS_PER_BLINK) * u * (speed6 > 0 ? 1 : 0)) * CELL + CELL / 2;
      const ay = (prev.y + (vy / UNITS_PER_BLINK) * u * (speed6 > 0 ? 1 : 0)) * CELL + CELL / 2;
      const bx = (prev.x + (vx / UNITS_PER_BLINK) * (u+1) * (speed6 > 0 ? 1 : 0)) * CELL + CELL / 2;
      const by = (prev.y + (vy / UNITS_PER_BLINK) * (u+1) * (speed6 > 0 ? 1 : 0)) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = trailColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Fading dot at last known position
    if (unitsDone < 2) {
      const cx2 = prev.x * CELL + CELL / 2;
      const cy2 = prev.y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 4 * (1 - progress), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 1 - progress;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

  // Blast animations
  for (const blast of blasts) {
    const bx = blast.x * CELL + CELL / 2;
    const by = blast.y * CELL + CELL / 2;
    const radius = blast.progress * CELL * 2;
    const color  = blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)';
    drawBlast(ctx, bx, by, radius, color);
  }

  // Subs
  const p1 = currentBlink.p1;
  const p2 = currentBlink.p2;
  if (p1) drawSub(ctx, p1.position.x * CELL + CELL / 2, p1.position.y * CELL + CELL / 2, p1Name || 'P1', p1.hp, '#00FF9F');
  if (p2) drawSub(ctx, p2.position.x * CELL + CELL / 2, p2.position.y * CELL + CELL / 2, p2Name || 'P2', p2.hp, '#FFB800');
}

function renderSideView(canvas, prevBlink, currentBlink, p1Name, p2Name, progress, blasts) {
  if (!canvas || !currentBlink) return;
  const ctx = canvas.getContext('2d');
  const W   = CELL * GRID;
  const H   = CELL * GRID;
  canvas.width  = W;
  canvas.height = H;

  drawGridBase(ctx, W, H, 'X:', '');

  // Depth gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,100,200,0.06)');
  grad.addColorStop(1, 'rgba(0,20,60,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Mines (XZ)
  for (const m of (currentBlink.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL / 2;
    const mz = Math.round(m.z) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(mx, mz, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
  }

  // Animate torpedoes (XZ)
  const prevTorps = prevBlink?.torpedoes || [];
  const currTorps = currentBlink.torpedoes || [];

  for (const t of currTorps) {
    const prev  = prevTorps.find(p => p.id === t.id);
    const startX = prev ? prev.x : t.x;
    const startZ = prev ? prev.z : t.z;
    const cx2   = lerp(startX, t.x, progress) * CELL + CELL / 2;
    const cz2   = lerp(startZ, t.z, progress) * CELL + CELL / 2;
    const color = t.owner === 'p1' ? '#00FF9F' : '#FFB800';

    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x * CELL + CELL / 2, prev.z * CELL + CELL / 2);
      ctx.lineTo(cx2, cz2);
      ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.4)' : 'rgba(255,184,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx2, cz2, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Disappeared torpedoes
  for (const prev of prevTorps) {
    if (!currTorps.find(t => t.id === prev.id)) {
      const sx = prev.x * CELL + CELL / 2;
      const sz = prev.z * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(sx, sz, 4 * (1 - progress), 0, Math.PI * 2);
      ctx.fillStyle = prev.owner === 'p1' ? `rgba(0,255,159,${1-progress})` : `rgba(255,184,0,${1-progress})`;
      ctx.fill();
    }
  }

  // Blasts (XZ)
  for (const blast of blasts) {
    const bx = blast.x * CELL + CELL / 2;
    const bz = blast.z * CELL + CELL / 2;
    const radius = blast.progress * CELL * 2;
    const color  = blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)';
    drawBlast(ctx, bx, bz, radius, color);
  }

  // Subs
  const p1 = currentBlink.p1;
  const p2 = currentBlink.p2;
  if (p1) drawSub(ctx, p1.position.x * CELL + CELL / 2, p1.position.z * CELL + CELL / 2, p1Name || 'P1', p1.hp, '#00FF9F');
  if (p2) drawSub(ctx, p2.position.x * CELL + CELL / 2, p2.position.z * CELL + CELL / 2, p2Name || 'P2', p2.hp, '#FFB800');
}

// ── DRAW SIDE VIEW (XZ plane) ────────────────────────────────────────────────
function drawSideView(canvas, blinkState, p1Name, p2Name, prevBlink) {
  if (!canvas || !blinkState) return;
  const ctx = canvas.getContext('2d');
  const W   = CELL * GRID;
  const H   = CELL * GRID;
  canvas.width  = W;
  canvas.height = H;

  ctx.fillStyle = '#060C10';
  ctx.fillRect(0, 0, W, H);

  // Grid
  for (let i = 0; i <= GRID; i++) {
    ctx.strokeStyle = '#0d2a1a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H);
    ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL);
    ctx.stroke();
  }

  // Labels
  ctx.fillStyle = '#1a5c3a';
  ctx.font = '8px "Courier New", monospace';
  for (let i = 0; i < GRID; i++) {
    ctx.fillText(`X:${i}`, i * CELL + 10, H - 4);
    ctx.fillText(`Z:${i}`, 2, i * CELL + 12);
  }

  // Depth gradient overlay (surface lighter, seafloor darker)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   'rgba(0,100,200,0.08)');
  grad.addColorStop(1,   'rgba(0,20,60,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Mines (X, Z)
  for (const m of (blinkState.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL / 2;
    const mz = Math.round(m.z) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(mx, mz, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
  }

  // Torpedoes with trail lines (XZ plane)
for (const t of (blinkState.torpedoes || [])) {
  const tx = t.x * CELL + CELL / 2;
  const tz = t.z * CELL + CELL / 2;
  const color = t.owner === 'p1' ? '#00FF9F' : '#FFB800';

  const prevTorp = prevBlink?.torpedoes?.find(pt => pt.id === t.id);
  if (prevTorp) {
    const px = prevTorp.x * CELL + CELL / 2;
    const pz = prevTorp.z * CELL + CELL / 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(tx, tz);
    ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.5)' : 'rgba(255,184,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    const firingPlayer = t.owner === 'p1' ? blinkState.p1 : blinkState.p2;
    if (firingPlayer) {
      const fx = firingPlayer.position.x * CELL + CELL / 2;
      const fz = firingPlayer.position.z * CELL + CELL / 2;
      ctx.beginPath();
      ctx.moveTo(fx, fz);
      ctx.lineTo(tx, tz);
      ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.35)' : 'rgba(255,184,0,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.beginPath();
  ctx.arc(tx, tz, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tx, tz, 7, 0, Math.PI * 2);
  ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.4)' : 'rgba(255,184,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

  // P1
  const p1 = blinkState.p1;
  if (p1) {
    const x = p1.position.x * CELL + CELL / 2;
    const z = p1.position.z * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, z, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,255,159,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#00FF9F';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00FF9F';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p1Name || 'P1', x, z - 14);
    ctx.textAlign = 'left';
  }

  // P2
  const p2 = blinkState.p2;
  if (p2) {
    const x = p2.position.x * CELL + CELL / 2;
    const z = p2.position.z * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, z, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,184,0,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#FFB800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FFB800';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p2Name || 'P2', x, z - 14);
    ctx.textAlign = 'left';
  }
}

// ── DRAW COCKPIT POV ─────────────────────────────────────────────────────────
function drawCockpitPov(canvas, blinkState, povSlot, p1Name, p2Name) {
  if (!canvas || !blinkState) return;

  const myData  = blinkState[povSlot];
  const oppSlot = povSlot === 'p1' ? 'p2' : 'p1';
  const oppData = blinkState[oppSlot];
  if (!myData) return;

  const fakeGameState = {
    self:          myData,
    sonarResults:  myData.sonarResults || [],
    round:         blinkState.round,
    blink:         blinkState.blink,
    timeLeft:      blinkState.timeLeft,
  };

  // Reuse the same drawCockpit function from Match.jsx logic
  // We'll draw a simplified version here
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  const MONO = '"Courier New", monospace';

  ctx.fillStyle = '#060C10';
  ctx.fillRect(0, 0, W, H);

  const name = povSlot === 'p1' ? (p1Name || 'P1') : (p2Name || 'P2');
  ctx.fillStyle = '#1a5c3a';
  ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${name.toUpperCase()} — COCKPIT POV  (BLINK ${blinkState.blink})`, W / 2, 18);
  ctx.textAlign = 'left';

  // Sub info
  const pos   = myData.position || { x:0, y:0, z:0 };
  const hp    = myData.hp ?? 100;
  const torps = myData.torpedoes ?? 0;
  const mines = myData.mines ?? 0;
  const speed = myData.speed || 'idle';
  const hpC   = hp > 50 ? '#00FF9F' : hp > 25 ? '#FFB800' : '#FF4444';

  function row(label, val, x, y, vc) {
    ctx.fillStyle = '#1a5c3a';
    ctx.font = `10px ${MONO}`;
    ctx.fillText(label, x, y);
    ctx.fillStyle = vc || '#00FF9F';
    ctx.fillText(val, x + 120, y);
  }

  const lx = 30, ly = 50;
  row('DEPTH',     `Z : ${pos.z}`,              lx, ly);
  row('SPEED',     speed.toUpperCase(),         lx, ly + 20, speed === 'max' ? '#FF4444' : speed === 'fast' ? '#FFB800' : '#00FF9F');
  row('POSITION',  `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`, lx, ly + 40);
  row('HP',        `${hp}%`,                    lx, ly + 60, hpC);
  row('TORPEDOES', `${torps} / 6`,              lx, ly + 80, torps === 0 ? '#FF4444' : '#00FF9F');
  row('MINES',     `${mines} / 6`,              lx, ly + 100, mines === 0 ? '#FF4444' : '#FFB800');
  row('POWER',     myData.powered !== false ? 'ON' : 'LOST', lx, ly + 120, myData.powered !== false ? '#00FF9F' : '#FF4444');

  // Sonar
  const sonar = myData.sonarResults || [];
  const sCX = W / 2 + 40;
  const sCY = H / 2;
  const sR  = Math.min(W / 3, H / 2) - 20;
  const uPx = sR / 5;

  ctx.beginPath();
  ctx.arc(sCX, sCY, sR, 0, Math.PI * 2);
  ctx.fillStyle = '#030a06';
  ctx.fill();
  ctx.strokeStyle = '#0d3322';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  [2, 4].forEach(r => {
    ctx.beginPath();
    ctx.arc(sCX, sCY, r * uPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,200,100,0.15)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });

  for (const c of sonar) {
    const dx = c.x - pos.x;
    const dy = c.y - pos.y;
    const px = sCX + dx * uPx;
    const py = sCY + dy * uPx;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = c.type === 'enemy_sub' ? '#FFB800' : '#FF8800';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(sCX, sCY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#00FF9F';
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,200,100,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(sCX, sCY, sR, 0, Math.PI * 2);
  ctx.stroke();

  // Sonar label
  ctx.fillStyle = '#1a5c3a';
  ctx.font = `8px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText('SONAR', sCX, sCY - sR - 8);
  if (sonar.some(c => c.type === 'enemy_sub')) {
    ctx.fillStyle = '#FFB800';
    ctx.font = `9px ${MONO}`;
    ctx.fillText('CONTACT DETECTED', sCX, sCY + sR + 14);
  } else {
    ctx.fillStyle = '#1a5c3a';
    ctx.fillText('NO CONTACTS', sCX, sCY + sR + 14);
  }
  ctx.textAlign = 'left';
}

// ── REPLAY PAGE COMPONENT ────────────────────────────────────────────────────
export default function Replay() {
  const { matchId }  = useParams();
  const navigate     = useNavigate();
  const { token }    = useAuth();

  const [replay, setReplay]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [frame, setFrame]       = useState(0);
  const [playing, setPlaying]   = useState(false);
  const [speed, setSpeed]       = useState(1);
  const [view, setView]         = useState('2d');  // '2d' | 'cockpit'
  const [povSlot, setPovSlot]   = useState('p1');

  const topDownRef  = useRef(null);
  const sideRef     = useRef(null);
  const cockpitRef  = useRef(null);
  const playTimer   = useRef(null);

  const totalFrames = replay?.blinkStates?.length || 0;
  const currentBlink = replay?.blinkStates?.[frame] || null;

  // Load replay
  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get(`${API}/api/replays/${matchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setReplay(res.data);
      } catch (err) {
        setError('Replay not found or not accessible');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId]);

  // Draw on frame change
  // Animation loop for torpedo movement
const rafRef       = useRef(null);
const blastsRef    = useRef([]);
const startTimeRef = useRef(null);
const ANIM_DURATION = 1200; // ms per blink transition

useEffect(() => {
  if (!replay || !currentBlink) return;

  const prevBlink = frame > 0 ? replay.blinkStates[frame - 1] : null;

  // Detect blasts — torpedoes that existed in prevBlink but not currentBlink
  if (prevBlink) {
    const prevTorps = prevBlink.torpedoes || [];
    const currTorps = currentBlink.torpedoes || [];
    const newBlasts = [];
    for (const pt of prevTorps) {
      if (!currTorps.find(t => t.id === pt.id)) {
        newBlasts.push({ x: pt.x, y: pt.y, z: pt.z, owner: pt.owner, progress: 0 });
      }
    }
    blastsRef.current = newBlasts;
  } else {
    blastsRef.current = [];
  }

  startTimeRef.current = null;

  function animate(timestamp) {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed  = timestamp - startTimeRef.current;
    const progress = Math.min(1, elapsed / ANIM_DURATION);

    // Update blast progress
    blastsRef.current = blastsRef.current.map(b => ({
      ...b,
      progress: Math.min(1, elapsed / ANIM_DURATION),
    }));

    if (view === '2d') {
      renderTopDown(topDownRef.current, prevBlink, currentBlink,
        replay.p1Username, replay.p2Username, progress, blastsRef.current);
      renderSideView(sideRef.current, prevBlink, currentBlink,
        replay.p1Username, replay.p2Username, progress, blastsRef.current);
    } else {
      drawCockpitPov(cockpitRef.current, currentBlink, povSlot,
        replay.p1Username, replay.p2Username);
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }

  if (rafRef.current) cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(animate);

  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, [frame, view, povSlot, replay]);

  // Playback
  useEffect(() => {
    if (playing) {
      playTimer.current = setInterval(() => {
        setFrame(f => {
          if (f >= totalFrames - 1) {
            setPlaying(false);
            return f;
          }
          return f + 1;
        });
      }, 1000 / speed);
    } else {
      clearInterval(playTimer.current);
    }
    return () => clearInterval(playTimer.current);
  }, [playing, speed, totalFrames]);

  if (loading) return (
    <div style={S.center}>
      <p style={{ color: 'var(--text-secondary)' }}>Loading replay...</p>
    </div>
  );

  if (error) return (
    <div style={S.center}>
      <p style={{ color: 'var(--error)' }}>{error}</p>
      <button className="btn btn-ghost" onClick={() => navigate('/menu')} style={{ marginTop: 16 }}>← Menu</button>
    </div>
  );

  return (
    <div style={S.root}>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => navigate('/menu')}>← Menu</button>

        <div style={S.matchInfo}>
          <span style={{ color: '#00FF9F', fontWeight: 500 }}>{replay.p1Username}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 10px' }}>vs</span>
          <span style={{ color: '#FFB800', fontWeight: 500 }}>{replay.p2Username}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 16, fontSize: 13 }}>
            {replay.finalScore}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* View switcher */}
          {['2d', 'cockpit'].map(v => (
            <button key={v}
              className={`btn ${view === v ? 'btn-teal' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '5px 12px' }}
              onClick={() => setView(v)}>
              {v === '2d' ? 'Top-Down + Side' : 'Cockpit POV'}
            </button>
          ))}
          {view === 'cockpit' && (
            <>
              <button
                className={`btn ${povSlot === 'p1' ? 'btn-teal' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPovSlot('p1')}>
                {replay.p1Username}
              </button>
              <button
                className={`btn ${povSlot === 'p2' ? 'btn-orange' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '5px 12px', background: povSlot === 'p2' ? '#D85A30' : undefined }}
                onClick={() => setPovSlot('p2')}>
                {replay.p2Username}
              </button>
            </>
          )}
        </div>
      </div>

      {/* CANVAS AREA */}
      <div style={S.canvasArea}>
        {view === '2d' ? (
          <div style={S.dualPanel}>
            <div style={S.panelWrap}>
              <div style={S.panelLabel}>TOP-DOWN VIEW (X · Y)</div>
              <canvas ref={topDownRef} style={S.canvas} />
            </div>
            <div style={S.panelWrap}>
              <div style={S.panelLabel}>SIDE VIEW (X · Z depth)</div>
              <canvas ref={sideRef} style={S.canvas} />
            </div>
          </div>
        ) : (
          <div style={S.cockpitWrap}>
            <canvas ref={cockpitRef} width={700} height={460} style={S.canvas} />
          </div>
        )}
      </div>

      {/* PLAYBACK CONTROLS */}
      <div style={S.controls}>
        <div style={S.frameInfo}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            Blink {currentBlink?.blink ?? 0} · Round {currentBlink?.round ?? 1} · {Math.max(0, currentBlink?.timeLeft ?? 0)}s
          </span>
        </div>

        <div style={S.playControls}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setFrame(0)}>⏮</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setFrame(f => Math.max(0, f - 1))}>◀</button>
          <button className="btn btn-teal" style={{ fontSize: 12, padding: '5px 20px' }}
            onClick={() => setPlaying(p => !p)}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setFrame(f => Math.min(totalFrames - 1, f + 1))}>▶</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setFrame(totalFrames - 1)}>⏭</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Speed:</span>
          {[1, 2, 4].map(s => (
            <button key={s}
              className={`btn ${speed === s ? 'btn-teal' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* SCRUB BAR */}
      <div style={S.scrubWrap}>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frame}
          onChange={e => { setFrame(Number(e.target.value)); setPlaying(false); }}
          style={{ width: '100%', accentColor: '#1D9E75' }}
        />
        <div style={S.scrubInfo}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Frame {frame + 1} / {totalFrames}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {replay.p1Username} <span style={{ color: '#00FF9F' }}>{replay.finalScore?.split('-')[0]}</span>
            {' — '}
            <span style={{ color: '#FFB800' }}>{replay.finalScore?.split('-')[1]}</span> {replay.p2Username}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  center: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  matchInfo: {
    fontSize: 14,
    fontWeight: 500,
  },
  canvasArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 12,
  },
  dualPanel: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
  },
  panelWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  panelLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  cockpitWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    display: 'block',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
    gap: 12,
  },
  frameInfo: {
    minWidth: 200,
  },
  playControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  scrubWrap: {
    padding: '4px 16px 10px',
    flexShrink: 0,
  },
  scrubInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 4,
  },
};