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
      // Update target if available
      if (t.tx !== undefined) {
        paths[t.id].tx = t.tx;
        paths[t.id].ty = t.ty;
        paths[t.id].tz = t.tz;
      }
    }
  }
  return paths;
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

  // Mines
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

  // 1. Draw full intended path (dim dashed line from origin to target)
  for (const [, path] of Object.entries(torpedoPaths)) {
    if (!path.points.length) continue;
    const color = path.owner === 'p1' ? 'rgba(0,255,159,0.12)' : 'rgba(255,184,0,0.12)';
    const origin = path.points[0];

    if (path.tx !== undefined) {
      // Draw from origin all the way to the target
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

  // 2. Draw historical solid trail (where torpedo has already been)
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

    // Dot at each past position
    for (const pt of path.points) {
      ctx.beginPath();
      ctx.arc(pt.x * CELL + CELL/2, pt.y * CELL + CELL/2, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // 3. Animate active torpedoes — growing bright line this blink
  for (const t of currTorps) {
    const prev    = prevTorps.find(p => p.id === t.id);
    const startX  = prev ? prev.x : t.x;
    const startY  = prev ? prev.y : t.y;
    const totalDX = t.x - startX;
    const totalDY = t.y - startY;
    const color   = t.owner === 'p1' ? '#00FF9F' : '#FFB800';
    const trailC  = t.owner === 'p1' ? 'rgba(0,255,159,0.7)' : 'rgba(255,184,0,0.7)';
    const unitsDone = progress * UNITS_PER_BLINK;

    // Growing line — one unit step at a time
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

    // Torpedo head at current animated position
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

  // 4. Blasts
  for (const blast of blasts) {
    const bx = blast.x * CELL + CELL/2;
    const by = blast.y * CELL + CELL/2;
    drawBlast(ctx, bx, by, blast.progress * CELL * 2,
      blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)');
  }

  // 5. Subs — drawn LAST so they're always on top
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

  // Depth gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,100,200,0.06)');
  grad.addColorStop(1, 'rgba(0,20,60,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Mines
  for (const m of (currentBlink.mines || [])) {
    const mx = Math.round(m.x) * CELL + CELL/2;
    const mz = Math.round(m.z) * CELL + CELL/2;
    ctx.beginPath();
    ctx.arc(mx, mz, 5, 0, Math.PI * 2);
    ctx.fillStyle = m.owner === 'p1' ? 'rgba(0,255,159,0.6)' : 'rgba(255,136,0,0.6)';
    ctx.fill();
  }

  // Torpedoes (XZ)
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

  // Blasts
  for (const blast of blasts) {
    drawBlast(ctx, blast.x * CELL + CELL/2, blast.z * CELL + CELL/2, blast.progress * CELL * 2,
      blast.owner === 'p1' ? 'rgb(0,255,159)' : 'rgb(255,184,0)');
  }

  // Subs — drawn last
  const p1 = currentBlink.p1;
  const p2 = currentBlink.p2;
  if (p1) drawSub(ctx, p1.position.x * CELL + CELL/2, p1.position.z * CELL + CELL/2, p1Name || 'P1', p1.hp, '#00FF9F');
  if (p2) drawSub(ctx, p2.position.x * CELL + CELL/2, p2.position.z * CELL + CELL/2, p2Name || 'P2', p2.hp, '#FFB800');
}

// ── COCKPIT POV ──────────────────────────────────────────────────────────────
function drawCockpitPov(canvas, blinkState, povSlot, p1Name, p2Name) {
  if (!canvas || !blinkState) return;
  const myData = blinkState[povSlot];
  if (!myData) return;

  const ctx  = canvas.getContext('2d');
  const W    = canvas.width;
  const H    = canvas.height;
  const MONO = '"Courier New", monospace';

  ctx.fillStyle = '#060C10';
  ctx.fillRect(0, 0, W, H);

  const name = povSlot === 'p1' ? (p1Name || 'P1') : (p2Name || 'P2');
  ctx.fillStyle = '#1a5c3a';
  ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${name.toUpperCase()} — COCKPIT POV  (BLINK ${blinkState.blink})`, W/2, 18);
  ctx.textAlign = 'left';

  const pos   = myData.position || { x:0, y:0, z:0 };
  const hp    = myData.hp ?? 100;
  const torps = myData.torpedoes ?? 0;
  const mines = myData.mines ?? 0;
  const speed = myData.speed || 'idle';
  const hpC   = hp > 50 ? '#00FF9F' : hp > 25 ? '#FFB800' : '#FF4444';

  function row(label, val, x, y, vc) {
    ctx.fillStyle = '#1a5c3a'; ctx.font = `10px ${MONO}`;
    ctx.fillText(label, x, y);
    ctx.fillStyle = vc || '#00FF9F';
    ctx.fillText(val, x + 120, y);
  }

  const lx = 30, ly = 50;
  row('DEPTH',     `Z : ${pos.z}`,   lx, ly);
  row('SPEED',     speed.toUpperCase(), lx, ly+20, speed==='max'?'#FF4444':speed==='fast'?'#FFB800':'#00FF9F');
  row('POSITION',  `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`, lx, ly+40);
  row('HP',        `${hp}%`,         lx, ly+60, hpC);
  row('TORPEDOES', `${torps} / 6`,   lx, ly+80, torps===0?'#FF4444':'#00FF9F');
  row('MINES',     `${mines} / 6`,   lx, ly+100, mines===0?'#FF4444':'#FFB800');
  row('POWER',     myData.powered!==false?'ON':'LOST', lx, ly+120, myData.powered!==false?'#00FF9F':'#FF4444');

  const sonar = myData.sonarResults || [];
  const sCX = W/2+40, sCY = H/2;
  const sR  = Math.min(W/3, H/2)-20;
  const uPx = sR/5;

  ctx.beginPath(); ctx.arc(sCX, sCY, sR, 0, Math.PI*2);
  ctx.fillStyle='#030a06'; ctx.fill();
  ctx.strokeStyle='#0d3322'; ctx.lineWidth=1.5; ctx.stroke();

  [2,4].forEach(r => {
    ctx.beginPath(); ctx.arc(sCX, sCY, r*uPx, 0, Math.PI*2);
    ctx.strokeStyle='rgba(0,200,100,0.15)'; ctx.lineWidth=0.8; ctx.stroke();
  });

  for (const c of sonar) {
    ctx.beginPath();
    ctx.arc(sCX + (c.x-pos.x)*uPx, sCY + (c.y-pos.y)*uPx, 5, 0, Math.PI*2);
    ctx.fillStyle = c.type==='enemy_sub'?'#FFB800':'#FF8800'; ctx.fill();
  }

  ctx.beginPath(); ctx.arc(sCX, sCY, 5, 0, Math.PI*2);
  ctx.fillStyle='#00FF9F'; ctx.fill();
  ctx.strokeStyle='rgba(0,200,100,0.35)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.arc(sCX, sCY, sR, 0, Math.PI*2); ctx.stroke();

  ctx.fillStyle='#1a5c3a'; ctx.font=`8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText('SONAR', sCX, sCY-sR-8);
  ctx.fillStyle = sonar.some(c=>c.type==='enemy_sub') ? '#FFB800' : '#1a5c3a';
  ctx.font=`9px ${MONO}`;
  ctx.fillText(sonar.some(c=>c.type==='enemy_sub')?'CONTACT DETECTED':'NO CONTACTS', sCX, sCY+sR+14);
  ctx.textAlign='left';
}

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
  const [povSlot, setPovSlot] = useState('p1');

  const topDownRef  = useRef(null);
  const sideRef     = useRef(null);
  const cockpitRef  = useRef(null);
  const playTimer   = useRef(null);
  const rafRef      = useRef(null);
  const blastsRef   = useRef([]);
  const startTimeRef = useRef(null);

  const totalFrames  = replay?.blinkStates?.length || 0;
  const currentBlink = replay?.blinkStates?.[frame] || null;

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
    if (!replay || !currentBlink) return;

    const prevBlink    = frame > 0 ? replay.blinkStates[frame - 1] : null;
    const torpedoPaths = buildTorpedoPaths(replay.blinkStates, frame);

    // Detect blasts — torpedoes that vanished this blink
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

      if (view === '2d') {
        renderTopDown(topDownRef.current, prevBlink, currentBlink,
          replay.p1Username, replay.p2Username, progress, blastsRef.current, torpedoPaths);
        renderSideView(sideRef.current, prevBlink, currentBlink,
          replay.p1Username, replay.p2Username, progress, blastsRef.current);
      } else {
        drawCockpitPov(cockpitRef.current, currentBlink, povSlot,
          replay.p1Username, replay.p2Username);
      }

      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [frame, view, povSlot, replay]);

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
          {['2d','cockpit'].map(v => (
            <button key={v}
              className={`btn ${view===v?'btn-teal':'btn-ghost'}`}
              style={{ fontSize:11, padding:'5px 12px' }}
              onClick={() => setView(v)}>
              {v==='2d' ? 'Top-Down + Side' : 'Cockpit POV'}
            </button>
          ))}
          {view === 'cockpit' && (
            <>
              <button className={`btn ${povSlot==='p1'?'btn-teal':'btn-ghost'}`}
                style={{ fontSize:11, padding:'5px 12px' }} onClick={() => setPovSlot('p1')}>
                {replay.p1Username}
              </button>
              <button className={`btn ${povSlot==='p2'?'btn-teal':'btn-ghost'}`}
                style={{ fontSize:11, padding:'5px 12px' }} onClick={() => setPovSlot('p2')}>
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
  cockpitWrap: { display:'flex', alignItems:'center', justifyContent:'center' },
  canvas:      { border:'1px solid var(--border)', borderRadius:6, display:'block' },
  controls:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderTop:'1px solid var(--border)', flexShrink:0, gap:12 },
  frameInfo:   { minWidth:200 },
  playControls:{ display:'flex', alignItems:'center', gap:6 },
  scrubWrap:   { padding:'4px 16px 10px', flexShrink:0 },
  scrubInfo:   { display:'flex', justifyContent:'space-between', marginTop:4 },
};
