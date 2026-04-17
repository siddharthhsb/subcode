import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API  = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const GRID = 10;
const CELL = 36;
const UNITS_PER_BLINK = 6;
const ANIM_DURATION   = 1500;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function drawGridBase(ctx, W, H) {
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
}

function drawGridLabels(ctx, W, H, xLabel, yLabel) {
  ctx.fillStyle = '#1a5c3a';
  ctx.font = '8px "Courier New", monospace';
  for (let i = 0; i < GRID; i++) {
    ctx.fillText(`${xLabel}${i}`, i * CELL + 6, H - 4);
    ctx.fillText(`${yLabel}${i}`, 2, i * CELL + 12);
  }
}

function drawSub(ctx, x, y, name, hp, color) {
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color === '#00FF9F' ? 'rgba(0,255,159,0.15)' : 'rgba(255,184,0,0.15)';
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

function drawBlast(ctx, x, y, radius, color) {
  if (radius <= 0) return;
  const alpha = Math.max(0, 1 - radius / (CELL * 2));
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Build torpedo paths from the start up to a given frame
function buildTorpedoPaths(blinkStates, upToFrame) {
  const paths = {};
  for (let i = 0; i <= upToFrame; i++) {
    const blink = blinkStates[i];
    if (!blink) continue;
    for (const t of (blink.torpedoes || [])) {
      if (!paths[t.id]) {
        const prev   = i > 0 ? blinkStates[i - 1] : null;
        const firer  = prev
          ? (t.owner === 'p1' ? prev.p1 : prev.p2)
          : (t.owner === 'p1' ? blink.p1 : blink.p2);
        paths[t.id] = {
          owner: t.owner,
          points: firer ? [{ x: firer.position.x, y: firer.position.y, z: firer.position.z }] : [],
          tx: t.tx, ty: t.ty, tz: t.tz,
        };
      }
      paths[t.id].points.push({ x: t.x, y: t.y, z: t.z });
      if (t.tx !== undefined) {
        paths[t.id].tx = t.tx;
        paths[t.id].ty = t.ty;
        paths[t.id].tz = t.tz;
      }
    }
  }
  return paths;
}

// ── MATCH LOG BUILDER ─────────────────────────────────────────────────────────
function buildMatchLog(blinkStates, p1Name, p2Name) {
  const events = [];
  let lastRound = null;

  for (let i = 0; i < blinkStates.length; i++) {
    const cur  = blinkStates[i];
    const prev = i > 0 ? blinkStates[i - 1] : null;

    // Round boundary
    if (cur.round !== lastRound) {
      if (lastRound !== null) {
        events.push({ type: 'round_end', round: lastRound, blink: cur.blink });
      }
      events.push({ type: 'round_start', round: cur.round, blink: cur.blink });
      lastRound = cur.round;
    }

    // New torpedoes (appeared this blink)
    const prevTorpIds = new Set((prev?.torpedoes || []).map(t => t.id));
    for (const t of (cur.torpedoes || [])) {
      if (!prevTorpIds.has(t.id)) {
        const name = t.owner === 'p1' ? p1Name : p2Name;
        const dest = t.tx !== undefined
          ? `(${t.tx}, ${t.ty}, ${t.tz})`
          : `(${Math.round(t.x)}, ${Math.round(t.y)}, ${Math.round(t.z)})`;
        events.push({ type: 'torpedo', owner: t.owner, name, dest, blink: cur.blink, frameIdx: i });
      }
    }

    // New mines (appeared this blink)
    const prevMineIds = new Set((prev?.mines || []).map(m => m.id));
    for (const m of (cur.mines || [])) {
      if (!prevMineIds.has(m.id)) {
        const name = m.owner === 'p1' ? p1Name : p2Name;
        events.push({
          type: 'mine', owner: m.owner, name,
          pos: `(${Math.round(m.x)}, ${Math.round(m.y)}, ${Math.round(m.z)})`,
          blink: cur.blink, frameIdx: i,
        });
      }
    }

    // Torpedo detonations (torpedo vanished this blink)
    const currTorpIds = new Set((cur.torpedoes || []).map(t => t.id));
    for (const t of (prev?.torpedoes || [])) {
      if (!currTorpIds.has(t.id)) {
        const name = t.owner === 'p1' ? p1Name : p2Name;
        events.push({
          type: 'detonation', owner: t.owner, name,
          pos: `(${Math.round(t.x)}, ${Math.round(t.y)}, ${Math.round(t.z)})`,
          blink: cur.blink, frameIdx: i,
        });
      }
    }

    // HP damage
    for (const slot of ['p1', 'p2']) {
      const curData  = cur[slot];
      const prevData = prev?.[slot];
      if (curData && prevData && curData.hp < prevData.hp) {
        const dmg  = prevData.hp - curData.hp;
        const name = slot === 'p1' ? p1Name : p2Name;
        events.push({
          type: 'damage', owner: slot, name, dmg, hp: curData.hp,
          blink: cur.blink, frameIdx: i,
        });
      }
    }

    // Movement (position changed)
    for (const slot of ['p1', 'p2']) {
      const curData  = cur[slot];
      const prevData = prev?.[slot];
      if (curData && prevData) {
        const dx = Math.round(curData.position.x) - Math.round(prevData.position.x);
        const dy = Math.round(curData.position.y) - Math.round(prevData.position.y);
        const dz = Math.round(curData.position.z) - Math.round(prevData.position.z);
        if (dx !== 0 || dy !== 0 || dz !== 0) {
          const name = slot === 'p1' ? p1Name : p2Name;
          const pos  = `(${Math.round(curData.position.x)}, ${Math.round(curData.position.y)}, ${Math.round(curData.position.z)})`;
          events.push({ type: 'move', owner: slot, name, pos, blink: cur.blink, frameIdx: i });
        }
      }
    }
  }

  // Final round end
  if (lastRound !== null) {
    events.push({ type: 'round_end', round: lastRound, blink: blinkStates[blinkStates.length - 1]?.blink });
  }

  return events;
}

// ── TOP-DOWN VIEW (XY) ───────────────────────────────────────────────────────
function renderTopDown(canvas, prevBlink, currentBlink, p1Name, p2Name, progress, blasts, torpedoPaths) {
  if (!canvas || !currentBlink) return;
  const ctx = canvas.getContext('2d');
  const S   = CELL * GRID;
  canvas.width  = S;
  canvas.height = S;

  drawGridBase(ctx, S, S);
  drawGridLabels(ctx, S, S, 'X:', '');

  for (const m of (currentBlink.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL/2;
    const my = Math.round(m.y) * CELL + CELL/2;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
    ctx.strokeStyle = m.owner === 'p1' ? '#00FF9F' : '#FF8800';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const prevTorps = prevBlink?.torpedoes || [];
  const currTorps = currentBlink.torpedoes || [];

  for (const [, path] of Object.entries(torpedoPaths)) {
    if (!path.points.length) continue;
    const color = path.owner === 'p1' ? 'rgba(0,255,159,0.12)' : 'rgba(255,184,0,0.12)';
    const origin = path.points[0];
    if (path.tx !== undefined) {
      ctx.beginPath();
      ctx.moveTo(origin.x * CELL + CELL/2, origin.y * CELL + CELL/2);
      ctx.lineTo(path.tx * CELL + CELL/2, path.ty * CELL + CELL/2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const [, path] of Object.entries(torpedoPaths)) {
    if (path.points.length < 2) continue;
    const color = path.owner === 'p1' ? 'rgba(0,255,159,0.35)' : 'rgba(255,184,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(path.points[0].x * CELL + CELL/2, path.points[0].y * CELL + CELL/2);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x * CELL + CELL/2, path.points[i].y * CELL + CELL/2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const pt of path.points) {
      ctx.beginPath();
      ctx.arc(pt.x * CELL + CELL/2, pt.y * CELL + CELL/2, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  for (const t of currTorps) {
    const prev    = prevTorps.find(p => p.id === t.id);
    const startX  = prev ? prev.x : t.x;
    const startY  = prev ? prev.y : t.y;
    const totalDX = t.x - startX;
    const totalDY = t.y - startY;
    const color   = t.owner === 'p1' ? '#00FF9F' : '#FFB800';
    const trailC  = t.owner === 'p1' ? 'rgba(0,255,159,0.7)' : 'rgba(255,184,0,0.7)';
    const unitsDone = progress * UNITS_PER_BLINK;

    for (let u = 0; u < Math.min(Math.floor(unitsDone) + 1, UNITS_PER_BLINK); u++) {
      const segP = u < Math.floor(unitsDone) ? 1 : (unitsDone % 1);
      const ax = (startX + (totalDX / UNITS_PER_BLINK) * u)        * CELL + CELL/2;
      const ay = (startY + (totalDY / UNITS_PER_BLINK) * u)        * CELL + CELL/2;
      const bx = (startX + (totalDX / UNITS_PER_BLINK) * (u+segP)) * CELL + CELL/2;
      const by = (startY + (totalDY / UNITS_PER_BLINK) * (u+segP)) * CELL + CELL/2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = trailC;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const done = Math.floor(unitsDone);
    const frac = unitsDone % 1;
    const curX = (startX + (totalDX / UNITS_PER_BLINK) * (done + frac)) * CELL + CELL/2;
    const curY = (startY + (totalDY / UNITS_PER_BLINK) * (done + frac)) * CELL + CELL/2;
    ctx.beginPath();
    ctx.arc(curX, curY, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.strokeStyle = t.owner === 'p1' ? 'rgba(0,255,159,0.4)' : 'rgba(255,184,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (const blast of blasts) {
    const bx = blast.x * CELL + CELL/2;
    const by = blast.y * CELL + CELL/2;
    drawBlast(ctx, bx, by, blast.progress * CELL * 2,
      blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)');
  }

  const p1 = currentBlink.p1;
  const p2 = currentBlink.p2;
  if (p1) drawSub(ctx, p1.position.x * CELL + CELL/2, p1.position.y * CELL + CELL/2, p1Name || 'P1', p1.hp, '#00FF9F');
  if (p2) drawSub(ctx, p2.position.x * CELL + CELL/2, p2.position.y * CELL + CELL/2, p2Name || 'P2', p2.hp, '#FFB800');
}

// ── SIDE VIEW (XZ) ───────────────────────────────────────────────────────────
function renderSideView(canvas, prevBlink, currentBlink, p1Name, p2Name, progress, blasts) {
  if (!canvas || !currentBlink) return;
  const ctx = canvas.getContext('2d');
  const W   = CELL * GRID;
  const H   = CELL * GRID;
  canvas.width  = W;
  canvas.height = H;

  drawGridBase(ctx, W, H);
  drawGridLabels(ctx, W, H, 'X:', 'Z:');

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,100,200,0.06)');
  grad.addColorStop(1, 'rgba(0,20,60,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  for (const m of (currentBlink.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL/2;
    const mz = Math.round(m.z) * CELL + CELL/2;
    ctx.beginPath();
    ctx.arc(mx, mz, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
  }

  const prevTorps = prevBlink?.torpedoes || [];
  const currTorps = currentBlink.torpedoes || [];

  for (const t of currTorps) {
    const prev   = prevTorps.find(p => p.id === t.id);
    const startX = prev ? prev.x : t.x;
    const startZ = prev ? prev.z : t.z;
    const totalDX = t.x - startX;
    const totalDZ = t.z - startZ;
    const color  = t.owner === 'p1' ? '#00FF9F' : '#FFB800';
    const trailC = t.owner === 'p1' ? 'rgba(0,255,159,0.5)' : 'rgba(255,184,0,0.5)';
    const unitsDone = progress * UNITS_PER_BLINK;

    for (let u = 0; u < Math.min(Math.floor(unitsDone) + 1, UNITS_PER_BLINK); u++) {
      const segP = u < Math.floor(unitsDone) ? 1 : (unitsDone % 1);
      const ax = (startX + (totalDX / UNITS_PER_BLINK) * u)        * CELL + CELL/2;
      const az = (startZ + (totalDZ / UNITS_PER_BLINK) * u)        * CELL + CELL/2;
      const bx = (startX + (totalDX / UNITS_PER_BLINK) * (u+segP)) * CELL + CELL/2;
      const bz = (startZ + (totalDZ / UNITS_PER_BLINK) * (u+segP)) * CELL + CELL/2;
      ctx.beginPath();
      ctx.moveTo(ax, az);
      ctx.lineTo(bx, bz);
      ctx.strokeStyle = trailC;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const done = Math.floor(unitsDone);
    const frac = unitsDone % 1;
    const curX = (startX + (totalDX / UNITS_PER_BLINK) * (done + frac)) * CELL + CELL/2;
    const curZ = (startZ + (totalDZ / UNITS_PER_BLINK) * (done + frac)) * CELL + CELL/2;
    ctx.beginPath();
    ctx.arc(curX, curZ, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  for (const blast of blasts) {
    drawBlast(ctx, blast.x * CELL + CELL/2, blast.z * CELL + CELL/2, blast.progress * CELL * 2,
      blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)');
  }

  const p1 = currentBlink.p1;
  const p2 = currentBlink.p2;
  if (p1) drawSub(ctx, p1.position.x * CELL + CELL/2, p1.position.z * CELL + CELL/2, p1Name || 'P1', p1.hp, '#00FF9F');
  if (p2) drawSub(ctx, p2.position.x * CELL + CELL/2, p2.position.z * CELL + CELL/2, p2Name || 'P2', p2.hp, '#FFB800');
}

// ── MATCH LOG COMPONENT ───────────────────────────────────────────────────────
function MatchLog({ events, currentFrame }) {
  const listRef = useRef(null);

  // Find index of last event at or before currentFrame
  const activeIdx = events.reduce((last, ev, i) => {
    if (ev.frameIdx !== undefined && ev.frameIdx <= currentFrame) return i;
    if (ev.type === 'round_start' || ev.type === 'round_end') return i;
    return last;
  }, 0);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[activeIdx];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  return (
    <div style={LS.wrap}>
      <div style={LS.header}>MATCH LOG</div>
      <div ref={listRef} style={LS.list}>
        {events.map((ev, i) => {
          const isActive = i === activeIdx;
          if (ev.type === 'round_start') return (
            <div key={i} style={{ ...LS.divider, opacity: isActive ? 1 : 0.5 }}>
              ── Round {ev.round} ──
            </div>
          );
          if (ev.type === 'round_end') return (
            <div key={i} style={{ ...LS.divider, opacity: isActive ? 1 : 0.5, color: '#1a5c3a' }}>
              ── End of Round {ev.round} ──
            </div>
          );

          const nameColor = ev.owner === 'p1' ? '#00FF9F' : '#FFB800';
          let text = '';
          let icon = '';
          if (ev.type === 'move')       { icon = '→'; text = ` moved to ${ev.pos}`; }
          if (ev.type === 'torpedo')    { icon = '⌁'; text = ` fired torpedo toward ${ev.dest}`; }
          if (ev.type === 'mine')       { icon = '◈'; text = ` deployed mine at ${ev.pos}`; }
          if (ev.type === 'detonation') { icon = '✦'; text = ` torpedo detonated at ${ev.pos}`; }
          if (ev.type === 'damage')     { icon = '!'; text = ` took ${ev.dmg} damage (${ev.hp} HP remaining)`; }

          return (
            <div key={i} style={{ ...LS.row, background: isActive ? 'rgba(0,255,159,0.04)' : 'transparent' }}>
              <span style={LS.blink}>B{ev.blink}</span>
              <span style={LS.icon}>{icon}</span>
              <span style={{ color: nameColor, fontWeight: 600 }}>{ev.name}</span>
              <span style={LS.desc}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LS = {
  wrap:    { display:'flex', flexDirection:'column', height:'100%', width:'100%', maxWidth:640, fontFamily:'"JetBrains Mono", "Courier New", monospace' },
  header:  { fontSize:10, color:'var(--text-muted)', letterSpacing:'0.12em', padding:'0 0 8px', flexShrink:0 },
  list:    { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:1 },
  divider: { fontSize:11, color:'#1a7a4a', padding:'8px 4px', letterSpacing:'0.06em', textAlign:'center' },
  row:     { display:'flex', alignItems:'baseline', gap:8, padding:'4px 8px', borderRadius:4, fontSize:12 },
  blink:   { color:'#1a5c3a', fontSize:10, minWidth:36, flexShrink:0 },
  icon:    { color:'#1a5c3a', minWidth:14, flexShrink:0 },
  desc:    { color:'var(--text-secondary)' },
};

// ── REPLAY PAGE ──────────────────────────────────────────────────────────────
export default function Replay() {
  const { matchId } = useParams();
  const navigate    = useNavigate();
  const { token }   = useAuth();

  const [replay, setReplay]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [frame, setFrame]     = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed]     = useState(1);
  const [view, setView]       = useState('2d');

  const topDownRef   = useRef(null);
  const sideRef      = useRef(null);
  const playTimer    = useRef(null);
  const rafRef       = useRef(null);
  const blastsRef    = useRef([]);
  const startTimeRef = useRef(null);

  const totalFrames  = replay?.blinkStates?.length || 0;
  const currentBlink = replay?.blinkStates?.[frame] || null;

  const matchLog = replay
    ? buildMatchLog(replay.blinkStates, replay.p1Username, replay.p2Username)
    : [];

  // Load replay
  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get(`${API}/api/replays/${matchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setReplay(res.data);
      } catch {
        setError('Replay not found or not accessible');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId]);

  // Animation loop
  useEffect(() => {
    if (!replay || !currentBlink || view !== '2d') return;

    const prevBlink    = frame > 0 ? replay.blinkStates[frame - 1] : null;
    const torpedoPaths = buildTorpedoPaths(replay.blinkStates, frame);

    if (prevBlink) {
      const prev = prevBlink.torpedoes || [];
      const curr = currentBlink.torpedoes || [];
      blastsRef.current = prev
        .filter(pt => !curr.find(t => t.id === pt.id))
        .map(pt => ({ x: pt.x, y: pt.y, z: pt.z, owner: pt.owner, progress: 0 }));
    } else {
      blastsRef.current = [];
    }

    startTimeRef.current = null;

    function animate(timestamp) {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed  = timestamp - startTimeRef.current;
      const progress = Math.min(1, elapsed / ANIM_DURATION);

      blastsRef.current = blastsRef.current.map(b => ({
        ...b, progress: Math.min(1, elapsed / ANIM_DURATION),
      }));

      renderTopDown(topDownRef.current, prevBlink, currentBlink,
        replay.p1Username, replay.p2Username, progress, blastsRef.current, torpedoPaths);
      renderSideView(sideRef.current, prevBlink, currentBlink,
        replay.p1Username, replay.p2Username, progress, blastsRef.current);

      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [frame, view, replay]);

  // Playback timer
  useEffect(() => {
    if (playing) {
      playTimer.current = setInterval(() => {
        setFrame(f => {
          if (f >= totalFrames - 1) { setPlaying(false); return f; }
          return f + 1;
        });
      }, 1000 / speed);
    } else {
      clearInterval(playTimer.current);
    }
    return () => clearInterval(playTimer.current);
  }, [playing, speed, totalFrames]);

  if (loading) return <div style={S.center}><p style={{ color:'var(--text-secondary)' }}>Loading replay...</p></div>;
  if (error)   return (
    <div style={S.center}>
      <p style={{ color:'var(--error)' }}>{error}</p>
      <button className="btn btn-ghost" onClick={() => navigate('/menu')} style={{ marginTop:16 }}>← Menu</button>
    </div>
  );

  return (
    <div style={S.root}>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button className="btn btn-ghost" style={{ fontSize:12, padding:'6px 14px' }}
          onClick={() => navigate('/menu')}>← Menu</button>

        <div style={S.matchInfo}>
          <span style={{ color:'#00FF9F', fontWeight:500 }}>{replay.p1Username}</span>
          <span style={{ color:'var(--text-muted)', margin:'0 10px' }}>vs</span>
          <span style={{ color:'#FFB800', fontWeight:500 }}>{replay.p2Username}</span>
          <span style={{ color:'var(--text-muted)', marginLeft:16, fontSize:13 }}>{replay.finalScore}</span>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          {['2d','log'].map(v => (
            <button key={v}
              className={`btn ${view===v?'btn-teal':'btn-ghost'}`}
              style={{ fontSize:11, padding:'5px 12px' }}
              onClick={() => setView(v)}>
              {v === '2d' ? 'Top-Down + Side' : 'Match Log'}
            </button>
          ))}
        </div>
      </div>

      {/* CANVAS / LOG AREA */}
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
          <div style={S.logWrap}>
            <MatchLog events={matchLog} currentFrame={frame} />
          </div>
        )}
      </div>

      {/* PLAYBACK CONTROLS */}
      <div style={S.controls}>
        <div style={S.frameInfo}>
          <span style={{ color:'var(--text-secondary)', fontSize:12 }}>
            Blink {currentBlink?.blink ?? 0} · Round {currentBlink?.round ?? 1} · {Math.max(0, currentBlink?.timeLeft ?? 0)}s
          </span>
        </div>
        <div style={S.playControls}>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setFrame(0)}>⏮</button>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setFrame(f => Math.max(0,f-1))}>◀</button>
          <button className="btn btn-teal"  style={{ fontSize:12, padding:'5px 20px' }} onClick={() => setPlaying(p => !p)}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setFrame(f => Math.min(totalFrames-1,f+1))}>▶</button>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setFrame(totalFrames-1)}>⏭</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ color:'var(--text-muted)', fontSize:11 }}>Speed:</span>
          {[1,2,4].map(s => (
            <button key={s} className={`btn ${speed===s?'btn-teal':'btn-ghost'}`}
              style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </div>

      {/* SCRUB BAR */}
      <div style={S.scrubWrap}>
        <input type="range" min={0} max={Math.max(0,totalFrames-1)} value={frame}
          onChange={e => { setFrame(Number(e.target.value)); setPlaying(false); }}
          style={{ width:'100%', accentColor:'#1D9E75' }} />
        <div style={S.scrubInfo}>
          <span style={{ color:'var(--text-muted)', fontSize:11 }}>Frame {frame+1} / {totalFrames}</span>
          <span style={{ color:'var(--text-muted)', fontSize:11 }}>
            {replay.p1Username} <span style={{ color:'#00FF9F' }}>{replay.finalScore?.split('-')[0]}</span>
            {' — '}
            <span style={{ color:'#FFB800' }}>{replay.finalScore?.split('-')[1]}</span> {replay.p2Username}
          </span>
        </div>
      </div>
    </div>
  );
}

const S = {
  root:        { height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'var(--bg-primary)', overflow:'hidden' },
  center:      { height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' },
  topBar:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  matchInfo:   { fontSize:14, fontWeight:500 },
  canvasArea:  { flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:12 },
  dualPanel:   { display:'flex', gap:16, alignItems:'flex-start' },
  panelWrap:   { display:'flex', flexDirection:'column', gap:6 },
  panelLabel:  { fontSize:10, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase' },
  logWrap:     { width:'100%', height:'100%', display:'flex', alignItems:'stretch', justifyContent:'center', padding:'0 24px' },
  canvas:      { border:'1px solid var(--border)', borderRadius:6, display:'block' },
  controls:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderTop:'1px solid var(--border)', flexShrink:0, gap:12 },
  frameInfo:   { minWidth:200 },
  playControls:{ display:'flex', alignItems:'center', gap:6 },
  scrubWrap:   { padding:'4px 16px 10px', flexShrink:0 },
  scrubInfo:   { display:'flex', justifyContent:'space-between', marginTop:4 },
};
