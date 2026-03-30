import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { loadPyodide, runPythonBot } from '../engine/pythonSandbox';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ─── COCKPIT CANVAS RENDERER ─────────────────────────────────────────────────
function drawCockpit(canvas, gameState, slot) {
  if (!canvas || !gameState) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const BG       = '#071428';
  const CARD_BG  = '#0a1a32';
  const BORDER   = '#0d3a2a';
  const GREEN    = '#00FF9F';
  const GREEN_DIM = '#1a5c3a';
  const GREEN_MID = '#00CC7A';
  const AMBER    = '#FFB800';
  const RED      = '#FF4444';
  const MONO     = '"Courier New", monospace';

  const self      = gameState.self || {};
  const sonar     = gameState.sonarResults || [];
  const pos       = self.position || { x:0, y:0, z:0 };
  const hp        = self.hp ?? 100;
  const torpedoes = self.torpedoes ?? 0;
  const mines     = self.mines ?? 0;
  const speed     = self.speed || 'idle';
  const depth     = pos.z ?? 0;
  const powered   = self.powered !== false;
  const oob       = self.outOfBounds || false;
  const timeLeft  = gameState.timeLeft ?? 0;
  const round     = gameState.round || 1;
  const blink     = gameState.blink || 0;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function card(x, y, w, h) {
    roundRect(x, y, w, h, 4);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function cardLabel(x, y, text) {
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `10px ${MONO}`;
    ctx.fillText(text, x, y);
  }

  function bigValue(x, y, text, color) {
    ctx.fillStyle = color || GREEN;
    ctx.font = `bold 22px ${MONO}`;
    ctx.fillText(text, x, y);
  }

  function smallText(x, y, text, color) {
    ctx.fillStyle = color || GREEN_DIM;
    ctx.font = `10px ${MONO}`;
    ctx.fillText(text, x, y);
  }

  // TITLE
  ctx.fillStyle = GREEN_DIM;
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`SUBCODE  //  ${slot?.toUpperCase() || 'PLAYER'} STATION`, W / 2, 18);
  ctx.textAlign = 'left';

  // TOP STAT CARDS
  const cardY = 26, cardH = 72, cPad = 8;
  const cW = (W - cPad * 5) / 4;

  // DEPTH
  const c1x = cPad;
  card(c1x, cardY, cW, cardH);
  cardLabel(c1x + 12, cardY + 16, 'DEPTH');
  bigValue(c1x + 12, cardY + 44, `Z : ${depth}`, depth > 7 ? RED : depth > 5 ? AMBER : GREEN);
  smallText(c1x + 12, cardY + 60, depth === 0 ? 'SURFACE' : depth === 9 ? 'SEAFLOOR' : depth > 5 ? 'DEEP' : 'SHALLOW');

  // SPEED
  const c2x = cPad * 2 + cW;
  const speedColor = speed === 'max' ? RED : speed === 'fast' ? AMBER : GREEN;
  card(c2x, cardY, cW, cardH);
  cardLabel(c2x + 12, cardY + 16, 'SPEED');
  bigValue(c2x + 12, cardY + 44, speed.toUpperCase(), speedColor);
  const upb = speed === 'max' ? 3 : speed === 'fast' ? 2 : 1;
  smallText(c2x + 12, cardY + 60, speed === 'idle' ? 'NO MOVEMENT' : `${upb} UNIT${upb > 1 ? 'S' : ''}/BLINK`, speedColor);

  // POSITION
  const c3x = cPad * 3 + cW * 2;
  card(c3x, cardY, cW, cardH);
  cardLabel(c3x + 12, cardY + 16, 'POSITION');
  ctx.fillStyle = oob ? RED : GREEN;
  ctx.font = `bold 16px ${MONO}`;
  ctx.fillText(`(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`, c3x + 12, cardY + 42);
  smallText(c3x + 12, cardY + 56, 'X  ·  Y  ·  Z');
  smallText(c3x + 12, cardY + 68, oob ? 'OUT OF BOUNDS  -20HP/s' : 'IN BOUNDS', oob ? RED : GREEN_DIM);

  // HULL INTEGRITY
  const c4x = cPad * 4 + cW * 3;
  const hpColor = hp > 50 ? GREEN : hp > 25 ? AMBER : RED;
  card(c4x, cardY, cW, cardH);
  cardLabel(c4x + 12, cardY + 16, 'HULL INTEGRITY');
  bigValue(c4x + 12, cardY + 44, `${hp}%`, hpColor);
  const hbX = c4x + 12, hbY = cardY + 52, hbW = cW - 24, hbH = 8;
  ctx.fillStyle = '#0a1428';
  roundRect(hbX, hbY, hbW, hbH, 2); ctx.fill();
  ctx.fillStyle = hpColor;
  roundRect(hbX, hbY, hbW * (hp / 100), hbH, 2); ctx.fill();

  // MAIN ROW
  const mainY = cardY + cardH + cPad;
  const mainH = H - mainY - 36;
  const sonarW = Math.floor(W * 0.38);
  const contW  = Math.floor(W * 0.36);
  const weapW  = W - sonarW - contW - cPad * 4;
  const sonarX = cPad;
  const contX  = sonarX + sonarW + cPad;
  const weapX  = contX + contW + cPad;

  // SONAR
  card(sonarX, mainY, sonarW, mainH);
  cardLabel(sonarX + 12, mainY + 16, 'ACTIVE SONAR');

  const sCX = sonarX + sonarW / 2;
  const sCY = mainY + 16 + (mainH - 16) / 2 - 10;
  const sR  = Math.min(sonarW - 40, mainH - 50) / 2;
  const uPx = sR / 5;

  ctx.save();
  ctx.beginPath();
  ctx.arc(sCX, sCY, sR, 0, Math.PI * 2);
  ctx.clip();

  const og = ctx.createRadialGradient(sCX, sCY - 15, 0, sCX, sCY, sR);
  og.addColorStop(0, '#0D2B3E'); og.addColorStop(0.6, '#071C2A'); og.addColorStop(1, '#020E18');
  ctx.fillStyle = og;
  ctx.fillRect(sCX - sR, sCY - sR, sR * 2, sR * 2);

  const wt = Date.now() / 3000;
  for (let i = 0; i < 10; i++) {
    const wy = sCY - sR + i * (sR * 2 / 10) + (wt * 5) % (sR * 2 / 10);
    ctx.beginPath(); ctx.moveTo(sCX - sR, wy);
    for (let xw = -sR; xw <= sR; xw += 6) ctx.lineTo(sCX + xw, wy + Math.sin((xw + wt * 30) * 0.06) * 3);
    ctx.strokeStyle = 'rgba(10,45,65,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  [1,2,3,4,5].forEach(r => {
    ctx.beginPath(); ctx.arc(sCX, sCY, r * uPx, 0, Math.PI * 2);
    ctx.strokeStyle = r === 3 ? 'rgba(0,200,100,0.25)' : 'rgba(0,200,100,0.1)';
    ctx.lineWidth = 0.8; ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]);
  });

  ctx.strokeStyle = 'rgba(0,200,100,0.12)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(sCX-sR,sCY); ctx.lineTo(sCX+sR,sCY);
  ctx.moveTo(sCX,sCY-sR); ctx.lineTo(sCX,sCY+sR); ctx.stroke();

  const sw = ((Date.now() / 1000) * Math.PI * 2) % (Math.PI * 2);
  ctx.save(); ctx.translate(sCX, sCY); ctx.rotate(sw);
  for (let i = 0; i < 35; i++) {
    const alpha = (1 - i / 35) * 0.28;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,sR,-i*0.044,-(i+1)*0.044,true);
    ctx.closePath(); ctx.fillStyle = `rgba(0,255,150,${alpha})`; ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(sR,0);
  ctx.strokeStyle = 'rgba(0,255,150,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  for (const contact of sonar) {
    const dx = contact.x - pos.x, dy = contact.y - pos.y;
    const px = sCX + dx * uPx, py = sCY + dy * uPx;
    if (contact.type === 'enemy_sub') {
      const bl = Math.sin(Date.now() / 200) > 0;
      ctx.beginPath(); ctx.arc(px, py, bl ? 5 : 4, 0, Math.PI*2); ctx.fillStyle = AMBER; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,184,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI*2);
      ctx.fillStyle = contact.owner === slot ? '#FFFF44' : '#FF8800'; ctx.fill();
    }
  }

  ctx.beginPath(); ctx.arc(sCX, sCY, 5, 0, Math.PI*2); ctx.fillStyle = GREEN; ctx.fill();
  ctx.beginPath(); ctx.arc(sCX, sCY, 9, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,255,150,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(sCX+(sR-6)*Math.cos(rad), sCY+(sR-6)*Math.sin(rad));
    ctx.lineTo(sCX+(sR+2)*Math.cos(rad), sCY+(sR+2)*Math.sin(rad));
    ctx.strokeStyle = 'rgba(0,180,80,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(0,180,80,0.55)'; ctx.font = `8px ${MONO}`;
    ctx.fillText(deg===0?'360':String(deg), sCX+(sR+12)*Math.cos(rad), sCY+(sR+12)*Math.sin(rad)+3);
  }
  ctx.textAlign = 'left';
  ctx.beginPath(); ctx.arc(sCX, sCY, sR, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,200,100,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();

  const enemy = sonar.find(c => c.type === 'enemy_sub');
  ctx.textAlign = 'center';
  if (enemy) {
    const dx = enemy.x-pos.x, dy = enemy.y-pos.y;
    const brg = ((Math.atan2(dy,dx)*180/Math.PI+360+90)%360).toFixed(0);
    const rng = Math.sqrt(dx*dx+dy*dy).toFixed(1);
    ctx.fillStyle = AMBER; ctx.font = `bold 11px ${MONO}`;
    ctx.fillText(`CONTACT  BRG ${brg}°  ·  RNG ${rng}u`, sCX, mainY+mainH-10);
  } else {
    ctx.fillStyle = GREEN_DIM; ctx.font = `10px ${MONO}`;
    ctx.fillText('NO CONTACTS DETECTED', sCX, mainY+mainH-10);
  }
  ctx.textAlign = 'left';

  // CONTACTS
  card(contX, mainY, contW, mainH);
  cardLabel(contX + 12, mainY + 16, 'CONTACTS');
  let cyy = mainY + 30;

  if (sonar.length === 0) {
    ctx.fillStyle = GREEN_DIM; ctx.font = `11px ${MONO}`;
    ctx.fillText('NO CONTACTS', contX+12, cyy+20);
    ctx.font = `10px ${MONO}`;
    ctx.fillText('Sonar range: 3 units', contX+12, cyy+38);
    ctx.fillText('Move closer to detect enemy', contX+12, cyy+52);
  } else {
    sonar.forEach((contact, i) => {
      const dx = contact.x-pos.x, dy = contact.y-pos.y;
      const rng = Math.sqrt(dx*dx+dy*dy).toFixed(1);
      const brg = ((Math.atan2(dy,dx)*180/Math.PI+360+90)%360).toFixed(0);
      const isE = contact.type === 'enemy_sub';
      const cid = isE ? `TGT-0${i+1}` : `MINE-0${i+1}`;
      const cc  = isE ? AMBER : contact.owner===slot ? '#FFFF44' : '#FF8800';
      const rowH = isE ? 90 : 60;
      roundRect(contX+8, cyy-2, contW-16, rowH, 3);
      ctx.fillStyle = isE ? 'rgba(255,184,0,0.08)' : 'rgba(255,136,0,0.06)'; ctx.fill();
      ctx.strokeStyle = isE ? 'rgba(255,184,0,0.3)' : 'rgba(255,136,0,0.2)'; ctx.lineWidth=0.8; ctx.stroke();
      ctx.fillStyle = cc; ctx.font = `bold 12px ${MONO}`;
      ctx.fillText(`${cid}  ·  BRG ${brg}°  ·  RNG ~${rng}u`, contX+14, cyy+13);
      ctx.fillStyle = GREEN_DIM; ctx.font = `10px ${MONO}`;
      ctx.fillText(`DEPTH  ~Z:${contact.z??'?'}`, contX+14, cyy+27);
      if (isE) {
        const nr = contact.noiseRadius??3;
        const noise = nr>=5?'HIGH (SPD: MAX)':nr>=4?'MED (SPD: FAST)':'LOW (SPD: SLOW)';
        ctx.fillText(`NOISE  ${noise}`, contX+14, cyy+41);
        const cl = parseFloat(rng)<3?'VERY CLOSE — DANGER':parseFloat(rng)<4?'CLOSING':'DISTANT';
        ctx.fillStyle = parseFloat(rng)<3?RED:GREEN_DIM;
        ctx.fillText(`STATUS  ${cl}`, contX+14, cyy+55);
        ctx.fillStyle=GREEN_DIM; ctx.font=`9px ${MONO}`;
        ctx.fillText(`Intercept ~${(parseFloat(rng)/3*2).toFixed(0)}s at current course`, contX+14, cyy+72);
      }
      cyy += rowH + 8;
    });
  }

  // WEAPONS
  card(weapX, mainY, weapW, mainH);
  cardLabel(weapX + 12, mainY + 16, 'WEAPONS');
  const wbX = weapX+10, wbW = weapW-20;
  let wyy = mainY+28;

  const tbH = 64;
  roundRect(wbX, wyy, wbW, tbH, 4);
  ctx.fillStyle = torpedoes>0?'rgba(0,255,150,0.06)':'rgba(255,68,68,0.05)'; ctx.fill();
  ctx.strokeStyle = torpedoes>0?'rgba(0,255,150,0.3)':'rgba(255,68,68,0.2)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle = torpedoes>0?GREEN:RED; ctx.font=`bold 16px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`[ TORPEDO ]  x${torpedoes}`, wbX+wbW/2, wyy+24);
  ctx.font=`10px ${MONO}`; ctx.fillStyle=torpedoes>0?GREEN_DIM:RED;
  ctx.fillText(torpedoes>0?'ARMED  ·  6u/blink  ·  50 HP':'EXPENDED', wbX+wbW/2, wyy+40);
  ctx.fillStyle=GREEN_DIM; ctx.font=`9px ${MONO}`;
  ctx.fillText('fire at target (x,y,z)', wbX+wbW/2, wyy+54);
  ctx.textAlign='left'; wyy+=tbH+10;

  const mbH = 64;
  roundRect(wbX, wyy, wbW, mbH, 4);
  ctx.fillStyle = mines>0?'rgba(255,184,0,0.06)':'rgba(255,68,68,0.05)'; ctx.fill();
  ctx.strokeStyle = mines>0?'rgba(255,184,0,0.35)':'rgba(255,68,68,0.2)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle = mines>0?AMBER:RED; ctx.font=`bold 16px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`[ MINE ]  x${mines}`, wbX+wbW/2, wyy+24);
  ctx.font=`10px ${MONO}`; ctx.fillStyle=mines>0?'rgba(255,184,0,0.6)':RED;
  ctx.fillText(mines>0?'READY  ·  1u/blink depth  ·  50 HP':'EXPENDED', wbX+wbW/2, wyy+40);
  ctx.fillStyle='rgba(255,184,0,0.4)'; ctx.font=`9px ${MONO}`;
  ctx.fillText('deploy at (x,y), target_depth', wbX+wbW/2, wyy+54);
  ctx.textAlign='left'; wyy+=mbH+10;

  const noiseColor = speed==='max'?RED:speed==='fast'?AMBER:GREEN;
  const noiseLabel = speed==='max'?'HIGH — ENEMY RANGE: 5u':speed==='fast'?'MED — ENEMY RANGE: 4u':'LOW — ENEMY RANGE: 3u';
  ctx.fillStyle=GREEN_DIM; ctx.font=`9px ${MONO}`; ctx.fillText('NOISE LEVEL', wbX, wyy); wyy+=12;
  ctx.fillStyle='#0a1428'; roundRect(wbX,wyy,wbW,10,2); ctx.fill();
  const nPct = speed==='max'?1:speed==='fast'?0.67:0.33;
  ctx.fillStyle=noiseColor; roundRect(wbX,wyy,wbW*nPct,10,2); ctx.fill();
  ctx.strokeStyle=BORDER; ctx.lineWidth=0.5; roundRect(wbX,wyy,wbW,10,2); ctx.stroke(); wyy+=14;
  ctx.fillStyle=noiseColor; ctx.font=`9px ${MONO}`; ctx.fillText(noiseLabel, wbX, wyy); wyy+=14;
  ctx.fillStyle='rgba(255,68,68,0.5)'; ctx.font=`9px ${MONO}`;
  ctx.fillText('FRIENDLY FIRE: ON  ·  NO AMMO REFILL', wbX, wyy);

  // BOTTOM BAR
  const botBarY = H-28;
  ctx.fillStyle='#050e1e'; ctx.fillRect(0,botBarY,W,28);
  ctx.strokeStyle=BORDER; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,botBarY); ctx.lineTo(W,botBarY); ctx.stroke();
  const items = [
    `ROUND: ${round}/3`, `BLINK: ${blink}`, `TIME: ${Math.max(0,timeLeft)}s`,
    `HP: ${hp}`, `TORP: ${torpedoes}/6`, `MINES: ${mines}/6`,
    `SPEED: ${speed.toUpperCase()}`, powered?'POWER: ON':'POWER: LOST',
  ];
  ctx.textAlign='center';
  items.forEach((item,i) => {
    const ix = (W/items.length)*(i+0.5);
    ctx.fillStyle = item.includes('LOST')?RED:item.includes('0/6')?'rgba(255,68,68,0.7)':GREEN_DIM;
    ctx.font=`9px ${MONO}`; ctx.fillText(item, ix, botBarY+17);
  });
  ctx.textAlign='left';

  if (!powered) {
    ctx.fillStyle='rgba(255,0,0,0.1)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=RED; ctx.font=`bold 14px ${MONO}`; ctx.textAlign='center';
    ctx.fillText('⚠  POWER LOST — SUB SINKING  ⚠', W/2, H/2-10);
    if (self.lastError) {
      ctx.fillStyle='#FF8888'; ctx.font=`11px ${MONO}`;
      ctx.fillText(`ERROR: ${self.lastError.message}`, W/2, H/2+10);
    }
    ctx.textAlign='left';
  }
}

// ─── MATCH PAGE ───────────────────────────────────────────────────────────────
export default function Match() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { user, token } = useAuth();
  const { socket }      = useSocket();

  // Match state
  const [phase, setPhase]             = useState('menu');
  const [slot, setSlot]               = useState(null);
  const [opponent, setOpponent]       = useState(null);
  const [gameState, setGameState]     = useState(null);
  const [roundScores, setRoundScores] = useState({ p1:0, p2:0, draws:0 });
  const [timeLeft, setTimeLeft]       = useState(60);
  const [betweenTime, setBetweenTime] = useState(30);
  const [matchResult, setMatchResult] = useState(null);
  const [hitLog, setHitLog]           = useState([]);
  const [roundResult, setRoundResult] = useState(null);

  // Friend invite state
  const [friendUsername, setFriendUsername] = useState('');
  const [friendRated, setFriendRated]       = useState(true);
  const [inviteSent, setInviteSent]         = useState(false);
  const [inviteError, setInviteError]       = useState('');
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [opponentReady, setOpponentReady]   = useState(false);

  // Editor state
  const [showEditor, setShowEditor]     = useState(false);
  const [editorCode, setEditorCode]     = useState('');
  const [scripts, setScripts]           = useState([]);
  const [activeScript, setActiveScript] = useState(null);

  // Refs
  const canvasRef       = useRef(null);
  const pyodideRef      = useRef(null);
  const botCodeRef      = useRef('');
  const slotRef         = useRef(null);
  const gameStateRef    = useRef(null);
  const betweenTimerRef = useRef(null);

  const friendMode = searchParams.get('mode') === 'friend';

  // ── INIT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadUserScripts();
    loadPyodide().then(ok => { pyodideRef.current = ok; });
  }, []);

  useEffect(() => { slotRef.current = slot; }, [slot]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── CANVAS ANIMATION LOOP ─────────────────────────────────────────────────
  useEffect(() => {
    let animFrame;
    let running = true;
    function animate() {
      if (!running) return;
      if (canvasRef.current && gameStateRef.current && slotRef.current) {
        drawCockpit(canvasRef.current, gameStateRef.current, slotRef.current);
      }
      animFrame = requestAnimationFrame(animate);
    }
    animFrame = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animFrame); };
  }, []);

  // ── SOCKET EVENTS ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('match_found', (data) => {
      setSlot(data.slot);
      slotRef.current = data.slot;
      setOpponent(data.opponent);
      setPhase('found');
      setTimeout(() => setPhase('playing'), 2000);
    });

    socket.on('blink', (data) => {
      setGameState(data);
      setTimeLeft(data.timeLeft);
      setRoundScores(data.roundScores || { p1:0, p2:0, draws:0 });
      if (data.hitLog?.length > 0) {
        setHitLog(prev => [...prev.slice(-20), ...data.hitLog]);
      }
      if (slotRef.current && pyodideRef.current && botCodeRef.current) {
        runPythonBot(botCodeRef.current, buildBotState(data, slotRef.current))
          .then(action => { socket.emit('bot_action', { action }); });
      }
    });

    socket.on('round_end', (data) => {
      setRoundResult(data.result);
      setRoundScores(data.roundScores);
      setPhase('between_rounds');
      setOpponentReady(false);
      let t = data.timeoutSecs || 30;
      setBetweenTime(t);
      clearInterval(betweenTimerRef.current);
      betweenTimerRef.current = setInterval(() => {
        t--;
        setBetweenTime(t);
        if (t <= 0) clearInterval(betweenTimerRef.current);
      }, 1000);
    });

    socket.on('round_start', () => {
      setPhase('playing');
      setRoundResult(null);
      setOpponentReady(false);
      clearInterval(betweenTimerRef.current);
    });

    socket.on('match_end', (data) => {
      setMatchResult(data);
      setPhase('finished');
      clearInterval(betweenTimerRef.current);
    });

    socket.on('opponent_disconnected', (data) => {
      setMatchResult({ winner: data.winner, disconnected: true });
      setPhase('finished');
    });

    socket.on('opponent_ready', () => { setOpponentReady(true); });
    socket.on('waiting_for_opponent', () => { setOpponentReady(false); });

    // Friend invite events
    socket.on('invite_sent',    ()     => { setInviteSent(true); });
    socket.on('invite_error',   (data) => { setInviteSent(false); setInviteError(data.error || 'Invite failed'); });
    socket.on('invite_declined',(data) => { setInviteSent(false); setInviteError(`${data.by} declined your invite`); });
    socket.on('match_invite',   (data) => { setIncomingInvite(data); });

    return () => {
      socket.off('match_found');
      socket.off('blink');
      socket.off('round_end');
      socket.off('round_start');
      socket.off('match_end');
      socket.off('opponent_disconnected');
      socket.off('opponent_ready');
      socket.off('waiting_for_opponent');
      socket.off('invite_sent');
      socket.off('invite_error');
      socket.off('invite_declined');
      socket.off('match_invite');
    };
  }, [socket]);

  // ── ACTIONS ───────────────────────────────────────────────────────────────
  async function loadUserScripts() {
    try {
      const res = await axios.get(`${API}/api/scripts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScripts(res.data.scripts);
      if (res.data.scripts.length > 0) {
        const s = res.data.scripts[0];
        const full = await axios.get(`${API}/api/scripts/${s.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const script = full.data.script;
        setActiveScript(script);
        setEditorCode(script.code);
        botCodeRef.current = script.code;
      }
    } catch (err) {
      console.error('Failed to load scripts');
    }
  }

  async function selectScript(script) {
    try {
      const full = await axios.get(`${API}/api/scripts/${script.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const s = full.data.script;
      setActiveScript(s);
      setEditorCode(s.code);
      botCodeRef.current = s.code;
      if (socket && (phase === 'playing' || phase === 'between_rounds')) {
        socket.emit('update_script', { script: s.code });
      }
    } catch (err) {
      console.error('Failed to load script');
    }
  }

  function joinQueue() {
    if (!socket) return;
    setPhase('queuing');
    socket.emit('join_queue', {
      script:     botCodeRef.current,
      scriptName: activeScript?.name || 'unknown',
      rated:      true,
    });
  }

  function leaveQueue() {
    if (!socket) return;
    socket.emit('leave_queue');
    setPhase('menu');
  }

  function sendInvite() {
    if (!friendUsername.trim() || !socket) return;
    setInviteError('');
    socket.emit('invite_friend', { username: friendUsername.trim(), rated: friendRated });
    setInviteSent(true);
  }

  function handleCodeChange(newCode) {
    setEditorCode(newCode);
    botCodeRef.current = newCode || '';
    if (socket && phase === 'playing') {
      socket.emit('update_script', { script: newCode });
    }
  }

  function buildBotState(blinkData, mySlot) {
    return {
      self:          blinkData.self,
      sonar_results: blinkData.sonarResults || [],
      my_mines: (blinkData.mines || [])
        .filter(m => m.owner === mySlot)
        .map(m => ({ id:m.id, x:m.x, y:m.y, z:m.z, target_depth:m.targetDepth, settled:m.settled })),
      hit_log:   blinkData.hitLog || [],
      round:     blinkData.round,
      blink:     blinkData.blink,
      time_left: blinkData.timeLeft,
    };
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button className="btn btn-ghost" style={{ fontSize:'12px', padding:'6px 14px' }}
          onClick={() => navigate('/menu')}>← Menu</button>

        <div style={S.matchInfo}>
          {opponent && (
            <span style={S.vsText}>
              <span style={{ color:'var(--teal)' }}>{user?.username}</span>
              <span style={{ color:'var(--text-muted)', margin:'0 12px' }}>vs</span>
              <span style={{ color:'var(--orange)' }}>{opponent.username}</span>
            </span>
          )}
          {phase === 'playing' && (
            <span style={S.timerText}>{String(Math.max(0,timeLeft)).padStart(2,'0')}s</span>
          )}
          {phase === 'between_rounds' && (
            <span style={{ ...S.timerText, color:'var(--orange)' }}>Next round in {betweenTime}s</span>
          )}
        </div>

        <div style={S.topRight}>
          {opponent && (
            <span style={S.scoreText}>
              {roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}
            </span>
          )}
          {(phase === 'playing' || phase === 'between_rounds') && (
            <button className="btn btn-ghost" style={{ fontSize:'12px', padding:'6px 14px' }}
              onClick={() => setShowEditor(!showEditor)}>
              {showEditor ? 'Hide Code' : 'Edit Code'}
            </button>
          )}
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={S.main}>

        {/* PRE-MATCH MENU */}
        {phase === 'menu' && (
          <div style={S.centerPanel}>
            <h2 style={S.panelTitle}>{friendMode ? 'Play with a Friend' : 'Ready to Fight?'}</h2>

            {/* FRIEND INVITE */}
            {friendMode && (
              <div style={{ width:'100%', maxWidth:'400px', marginBottom:'24px' }}>
                {!inviteSent ? (
                  <>
                    <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'12px' }}>
                      Enter your friend's username to send them a match invite.
                    </p>
                    <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                      <input
                        placeholder="friend_username"
                        value={friendUsername}
                        onChange={e => setFriendUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendInvite()}
                        style={{ flex:1 }}
                      />
                      <button className="btn btn-teal" onClick={sendInvite}>Send</button>
                    </div>
                    <label style={{ fontSize:'12px', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px' }}>
                      <input type="checkbox" checked={friendRated}
                        onChange={e => setFriendRated(e.target.checked)} />
                      Rated match (affects ELO)
                    </label>
                    {inviteError && <p className="error-msg">{inviteError}</p>}
                  </>
                ) : (
                  <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'16px', textAlign:'center' }}>
                    <p style={{ color:'var(--text-secondary)', marginBottom:'8px' }}>
                      Invite sent to <span style={{ color:'var(--teal)' }}>{friendUsername}</span>
                    </p>
                    <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'12px' }}>
                      Waiting for them to accept...
                    </p>
                    <button className="btn btn-ghost" style={{ fontSize:'12px' }}
                      onClick={() => { setInviteSent(false); setFriendUsername(''); }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SCRIPT SELECTOR */}
            <div style={S.scriptSelect}>
              <p style={S.label}>Active bot script:</p>
              {scripts.length === 0 ? (
                <p style={S.muted}>
                  No scripts saved.{' '}
                  <button className="btn btn-ghost" style={{ fontSize:'12px', padding:'4px 10px' }}
                    onClick={() => navigate('/editor')}>Go to Editor</button>
                </p>
              ) : (
                <div style={S.scriptList}>
                  {scripts.map(s => (
                    <button key={s.id} onClick={() => selectScript(s)}
                      style={{
                        ...S.scriptBtn,
                        borderColor: activeScript?.id===s.id ? 'var(--teal)' : 'var(--border)',
                        color:       activeScript?.id===s.id ? 'var(--teal)' : 'var(--text-secondary)',
                      }}>
                      {s.name}
                      <span style={S.scriptLang}>{s.language?.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!friendMode && (
              <>
                <button className="btn btn-teal"
                  style={{ fontSize:'16px', padding:'14px 48px', marginTop:'24px' }}
                  onClick={joinQueue} disabled={!activeScript}>
                  Find Match
                </button>
                {!activeScript && (
                  <p style={{ ...S.muted, marginTop:'12px' }}>Save a script in the Editor first</p>
                )}
              </>
            )}
          </div>
        )}

        {/* QUEUING */}
        {phase === 'queuing' && (
          <div style={S.centerPanel}>
            <div style={S.searching}>
              <div style={S.pulse} />
              <h2 style={S.panelTitle}>Searching for opponent...</h2>
              <p style={S.muted}>Using: {activeScript?.name}</p>
              <button className="btn btn-ghost" style={{ marginTop:'24px' }} onClick={leaveQueue}>Cancel</button>
            </div>
          </div>
        )}

        {/* MATCH FOUND */}
        {phase === 'found' && (
          <div style={S.centerPanel}>
            <h2 style={{ color:'var(--teal)', fontSize:'24px' }}>Match Found!</h2>
            <p style={S.muted}>vs <span style={{ color:'var(--orange)' }}>{opponent?.username}</span> (ELO {opponent?.elo})</p>
            <p style={{ ...S.muted, marginTop:'12px' }}>Preparing battle stations...</p>
          </div>
        )}

        {/* PLAYING / BETWEEN ROUNDS */}
        {(phase === 'playing' || phase === 'between_rounds') && (
          <div style={S.cockpitArea}>

            {/* BETWEEN ROUNDS OVERLAY */}
            {phase === 'between_rounds' && (
              <div style={S.betweenOverlay}>
                <div style={S.betweenCard}>
                  <h3 style={{ fontSize:'18px', marginBottom:'8px' }}>
                    {roundResult?.winner === slot ? '✅ Round Won'
                      : roundResult?.winner === null ? '🤝 Round Draw'
                      : '❌ Round Lost'}
                  </h3>
                  <p style={{ color:'var(--text-muted)', marginBottom:'12px' }}>
                    Score: {roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}
                  </p>

                  {/* SCRIPT CHANGE */}
                  {scripts.length > 0 && (
                    <div style={{ marginBottom:'16px', textAlign:'left' }}>
                      <p style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'6px' }}>
                        Change script for next round:
                      </p>
                      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                        {scripts.map(s => (
                          <button key={s.id} onClick={() => selectScript(s)}
                            style={{
                              background: activeScript?.id===s.id ? 'rgba(29,158,117,0.15)' : 'var(--bg-tertiary)',
                              border: `1px solid ${activeScript?.id===s.id ? 'var(--teal)' : 'var(--border)'}`,
                              color:  activeScript?.id===s.id ? 'var(--teal)' : 'var(--text-secondary)',
                              padding:'6px 12px', borderRadius:'4px',
                              fontFamily:'JetBrains Mono, monospace', fontSize:'12px',
                              cursor:'pointer', textAlign:'left',
                            }}>
                            {s.name}
                            <span style={{ fontSize:'10px', opacity:0.6, marginLeft:'6px' }}>
                              {s.language?.toUpperCase()}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p style={{ color:'var(--text-muted)', fontSize:'12px', marginBottom:'12px' }}>
                    Next round in <span style={{ color:'var(--teal)', fontWeight:'bold' }}>{betweenTime}s</span>
                    {' '}— or press Ready
                  </p>

                  {opponentReady && (
                    <p style={{ fontSize:'11px', color:'var(--teal)', marginBottom:'8px' }}>
                      ✓ Opponent is ready
                    </p>
                  )}

                  <button className="btn btn-teal" style={{ width:'100%' }}
                    onClick={() => socket?.emit('player_ready', {})}>
                    ✓ Ready — Start Next Round
                  </button>
                </div>
              </div>
            )}

            {/* CANVAS */}
            <canvas ref={canvasRef} width={780} height={460} style={S.canvas} />

            {/* HIT LOG */}
            <div style={S.hitLog}>
              <div style={S.hitLogTitle}>HIT LOG</div>
              {hitLog.slice(-8).reverse().map((h, i) => (
                <div key={i} style={{ ...S.hitEntry, color: h.target===slot?'#E24B4A':'#1D9E75' }}>
                  [{h.blink}] {h.target===slot?'▼ RECEIVED':'▲ DEALT'} {h.damage} HP
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MATCH FINISHED */}
        {phase === 'finished' && (
          <div style={S.centerPanel}>
            <h2 style={{
              fontSize:'28px', marginBottom:'12px',
              color: matchResult?.winner===slot ? 'var(--teal)'
                : matchResult?.winner===null ? 'var(--text-secondary)'
                : 'var(--orange)',
            }}>
              {matchResult?.winner===slot ? '🏆 Victory'
                : matchResult?.winner===null ? '🤝 Draw'
                : '💀 Defeat'}
            </h2>
            {matchResult?.disconnected && <p style={S.muted}>Opponent disconnected</p>}
            <p style={{ color:'var(--text-secondary)', marginBottom:'24px' }}>
              Final score: {roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}
            </p>
            <div style={{ display:'flex', gap:'12px' }}>
              <button className="btn btn-teal" onClick={() => {
                setPhase('menu'); setGameState(null); setOpponent(null);
                setMatchResult(null); setHitLog([]); setRoundScores({p1:0,p2:0,draws:0});
              }}>Play Again</button>
              {matchResult?.matchId && (
                <button className="btn btn-teal"
                  onClick={() => navigate(`/replay/${matchResult.matchId}`)}>
                  Watch Replay
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => navigate('/menu')}>Main Menu</button>
            </div>
          </div>
        )}

        {/* SLIDE-IN CODE EDITOR */}
        {showEditor && (
          <div style={S.editorPanel}>
            <div style={S.editorPanelTop}>
              <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                {activeScript?.name || 'unsaved'} — changes apply next blink
              </span>
              <button onClick={() => setShowEditor(false)} style={S.closeBtn}>✕</button>
            </div>
            <MonacoEditor
              height="100%"
              language={activeScript?.language==='c'?'c':'python'}
              theme="vs-dark"
              value={editorCode}
              onChange={handleCodeChange}
              options={{ fontSize:12, fontFamily:'JetBrains Mono, monospace', minimap:{enabled:false}, lineNumbers:'on', wordWrap:'on', tabSize:4 }}
            />
          </div>
        )}
      </div>

      {/* INCOMING INVITE POPUP */}
      {incomingInvite && (
        <div style={S.modalOverlay}>
          <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:'12px', padding:'32px', textAlign:'center', maxWidth:'340px' }}>
            <h3 style={{ fontSize:'16px', marginBottom:'8px' }}>Match Invite</h3>
            <p style={{ color:'var(--text-secondary)', marginBottom:'4px' }}>
              <span style={{ color:'var(--teal)' }}>{incomingInvite.from}</span> wants to play
            </p>
            <p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'24px' }}>
              {incomingInvite.rated ? 'Rated match' : 'Unrated match'}
            </p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn btn-ghost" style={{ flex:1 }}
                onClick={() => { socket?.emit('decline_invite', { from:incomingInvite.from }); setIncomingInvite(null); }}>
                Decline
              </button>
              <button className="btn btn-teal" style={{ flex:1 }}
                onClick={() => { socket?.emit('accept_invite', { from:incomingInvite.from, rated:incomingInvite.rated }); setIncomingInvite(null); }}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  root:        { height:'100vh', display:'flex', flexDirection:'column', backgroundColor:'var(--bg-primary)', overflow:'hidden' },
  topBar:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  matchInfo:   { display:'flex', alignItems:'center', gap:'16px' },
  vsText:      { fontSize:'14px', fontWeight:'500' },
  timerText:   { fontSize:'20px', fontWeight:'700', color:'var(--teal)', fontVariantNumeric:'tabular-nums' },
  topRight:    { display:'flex', alignItems:'center', gap:'12px' },
  scoreText:   { fontSize:'18px', fontWeight:'700', color:'var(--text-primary)' },
  main:        { flex:1, display:'flex', overflow:'hidden', position:'relative' },
  centerPanel: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px' },
  panelTitle:  { fontSize:'24px', fontWeight:'500', marginBottom:'24px' },
  label:       { fontSize:'12px', color:'var(--text-secondary)', marginBottom:'10px' },
  muted:       { fontSize:'13px', color:'var(--text-muted)' },
  scriptSelect:{ width:'100%', maxWidth:'400px' },
  scriptList:  { display:'flex', flexDirection:'column', gap:'8px' },
  scriptBtn:   { background:'var(--bg-secondary)', border:'1px solid', borderRadius:'6px', padding:'10px 14px', fontFamily:'JetBrains Mono, monospace', fontSize:'13px', cursor:'pointer', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'all 0.15s' },
  scriptLang:  { fontSize:'10px', color:'var(--text-muted)' },
  searching:   { display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' },
  pulse:       { width:'48px', height:'48px', borderRadius:'50%', background:'var(--teal)', opacity:0.6, animation:'pulse 1.5s ease-in-out infinite' },
  cockpitArea: { flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px', gap:'16px', position:'relative' },
  canvas:      { border:'1px solid var(--border)', borderRadius:'8px' },
  hitLog:      { width:'200px', flexShrink:0 },
  hitLogTitle: { fontSize:'9px', fontWeight:'500', letterSpacing:'.08em', color:'var(--text-muted)', marginBottom:'8px' },
  hitEntry:    { fontSize:'10px', lineHeight:'1.8', fontFamily:'JetBrains Mono, monospace' },
  betweenOverlay: { position:'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(10,14,26,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 },
  betweenCard: { background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:'12px', padding:'28px 40px', textAlign:'center', minWidth:'320px' },
  editorPanel: { position:'absolute', top:0, right:0, width:'480px', height:'100%', background:'var(--bg-secondary)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', zIndex:20 },
  editorPanelTop: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  closeBtn:    { background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'14px' },
  modalOverlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
};
