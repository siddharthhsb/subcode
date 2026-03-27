import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { loadPyodide, runPythonBot } from '../engine/pythonSandbox';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';

const API = 'http://localhost:4000';

// ─── COCKPIT CANVAS RENDERER ─────────────────────────────────────────────────
function drawCockpit(canvas, gameState, slot, botCode) {
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
  const WHITE    = '#E8F0E8';
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

  // ── BACKGROUND ──
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
    ctx.letterSpacing = '2px';
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
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

  // ── TITLE BAR ──
  ctx.fillStyle = GREEN_DIM;
  ctx.font = `11px ${MONO}`;
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'center';
  ctx.fillText(`SUBCODE  //  ${slot?.toUpperCase() || 'PLAYER'} STATION`, W / 2, 18);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  // ── TOP STAT CARDS ──
  const cardY  = 26;
  const cardH  = 72;
  const cPad   = 8;
  const cW     = (W - cPad * 5) / 4;

  // Card 1 — DEPTH
  const c1x = cPad;
  card(c1x, cardY, cW, cardH);
  cardLabel(c1x + 12, cardY + 16, 'DEPTH');
  bigValue(c1x + 12, cardY + 44, `Z : ${depth}`, depth > 7 ? RED : depth > 5 ? AMBER : GREEN);
  smallText(c1x + 12, cardY + 60, depth === 0 ? 'SURFACE' : depth === 9 ? 'SEAFLOOR' : depth > 5 ? 'DEEP' : 'SHALLOW');

  // Card 2 — SPEED
  const c2x = cPad * 2 + cW;
  const speedColor = speed === 'max' ? RED : speed === 'fast' ? AMBER : GREEN;
  card(c2x, cardY, cW, cardH);
  cardLabel(c2x + 12, cardY + 16, 'SPEED');
  bigValue(c2x + 12, cardY + 44, speed.toUpperCase(), speedColor);
  const unitsPerBlink = speed === 'max' ? 3 : speed === 'fast' ? 2 : 1;
  smallText(c2x + 12, cardY + 60,
    speed === 'idle' ? 'NO MOVEMENT' : `${unitsPerBlink} UNIT${unitsPerBlink > 1 ? 'S' : ''}/BLINK`,
    speedColor);

  // Card 3 — POSITION
  const c3x = cPad * 3 + cW * 2;
  card(c3x, cardY, cW, cardH);
  cardLabel(c3x + 12, cardY + 16, 'POSITION');
  ctx.fillStyle = oob ? RED : GREEN;
  ctx.font = `bold 16px ${MONO}`;
  ctx.fillText(`(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`, c3x + 12, cardY + 42);
  smallText(c3x + 12, cardY + 56, 'X  ·  Y  ·  Z');
  smallText(c3x + 12, cardY + 68, oob ? 'OUT OF BOUNDS  -20HP/s' : 'IN BOUNDS', oob ? RED : GREEN_DIM);

  // Card 4 — HULL INTEGRITY
  const c4x = cPad * 4 + cW * 3;
  const hpColor = hp > 50 ? GREEN : hp > 25 ? AMBER : RED;
  card(c4x, cardY, cW, cardH);
  cardLabel(c4x + 12, cardY + 16, 'HULL INTEGRITY');
  bigValue(c4x + 12, cardY + 44, `${hp}%`, hpColor);
  // HP bar
  const hbX = c4x + 12, hbY = cardY + 52, hbW = cW - 24, hbH = 8;
  ctx.fillStyle = '#0a1428';
  roundRect(hbX, hbY, hbW, hbH, 2);
  ctx.fill();
  ctx.fillStyle = hpColor;
  roundRect(hbX, hbY, hbW * (hp / 100), hbH, 2);
  ctx.fill();

  // ── MAIN ROW ──
  const mainY  = cardY + cardH + cPad;
  const mainH  = H - mainY - 36;
  const sonarW = Math.floor(W * 0.38);
  const contW  = Math.floor(W * 0.36);
  const weapW  = W - sonarW - contW - cPad * 4;
  const sonarX = cPad;
  const contX  = sonarX + sonarW + cPad;
  const weapX  = contX + contW + cPad;

  // ════════════════════════════
  // ACTIVE SONAR CARD
  // ════════════════════════════
  card(sonarX, mainY, sonarW, mainH);
  cardLabel(sonarX + 12, mainY + 16, 'ACTIVE SONAR');

  const sCX = sonarX + sonarW / 2;
  const sCY = mainY + 16 + (mainH - 16) / 2 - 10;
  const sR  = Math.min(sonarW - 40, mainH - 50) / 2;
  const uPx = sR / 5;

  // Ocean clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(sCX, sCY, sR, 0, Math.PI * 2);
  ctx.clip();

  // Ocean bg
  const og = ctx.createRadialGradient(sCX, sCY - 15, 0, sCX, sCY, sR);
  og.addColorStop(0,   '#0D2B3E');
  og.addColorStop(0.6, '#071C2A');
  og.addColorStop(1,   '#020E18');
  ctx.fillStyle = og;
  ctx.fillRect(sCX - sR, sCY - sR, sR * 2, sR * 2);

  // Wave animation
  const wt = Date.now() / 3000;
  for (let i = 0; i < 10; i++) {
    const wy = sCY - sR + i * (sR * 2 / 10) + (wt * 5) % (sR * 2 / 10);
    ctx.beginPath();
    ctx.moveTo(sCX - sR, wy);
    for (let xw = -sR; xw <= sR; xw += 6) {
      ctx.lineTo(sCX + xw, wy + Math.sin((xw + wt * 30) * 0.06) * 3);
    }
    ctx.strokeStyle = 'rgba(10,45,65,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Range rings
  [1,2,3,4,5].forEach(r => {
    ctx.beginPath();
    ctx.arc(sCX, sCY, r * uPx, 0, Math.PI * 2);
    ctx.strokeStyle = r === 3 ? 'rgba(0,200,100,0.25)' : 'rgba(0,200,100,0.1)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Range labels
  ctx.fillStyle = 'rgba(0,200,100,0.4)';
  ctx.font = `8px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('500m', sCX + 2 * uPx + 3, sCY - 3);
  ctx.fillText('1km',  sCX + 4 * uPx + 3, sCY - 3);

  // Crosshairs
  ctx.strokeStyle = 'rgba(0,200,100,0.12)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(sCX - sR, sCY); ctx.lineTo(sCX + sR, sCY);
  ctx.moveTo(sCX, sCY - sR); ctx.lineTo(sCX, sCY + sR);
  ctx.stroke();

  // Sweep
  const sw = ((Date.now() / 1000) * Math.PI * 2) % (Math.PI * 2);
  ctx.save();
  ctx.translate(sCX, sCY);
  ctx.rotate(sw);
  for (let i = 0; i < 35; i++) {
    const alpha = (1 - i / 35) * 0.28;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, sR, -i * 0.044, -(i + 1) * 0.044, true);
    ctx.closePath();
    ctx.fillStyle = `rgba(0,255,150,${alpha})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(sR, 0);
  ctx.strokeStyle = 'rgba(0,255,150,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Contacts
  for (const contact of sonar) {
    const dx = contact.x - pos.x;
    const dy = contact.y - pos.y;
    const px = sCX + dx * uPx;
    const py = sCY + dy * uPx;

    if (contact.type === 'enemy_sub') {
      const blink2 = Math.sin(Date.now() / 200) > 0;
      ctx.beginPath();
      ctx.arc(px, py, blink2 ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = AMBER;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,184,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = contact.owner === slot ? '#FFFF44' : '#FF8800';
      ctx.fill();
    }
  }

  // Self dot
  ctx.beginPath();
  ctx.arc(sCX, sCY, 5, 0, Math.PI * 2);
  ctx.fillStyle = GREEN;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sCX, sCY, 9, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,255,150,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore(); // end clip

  // Degree marks outside
  ctx.textAlign = 'center';
  for (let deg = 0; deg < 360; deg += 30) {
    const rad  = (deg - 90) * Math.PI / 180;
    const ti   = sR - 6;
    const to   = sR + 2;
    ctx.beginPath();
    ctx.moveTo(sCX + ti * Math.cos(rad), sCY + ti * Math.sin(rad));
    ctx.lineTo(sCX + to * Math.cos(rad), sCY + to * Math.sin(rad));
    ctx.strokeStyle = 'rgba(0,180,80,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const lr = sR + 12;
    ctx.fillStyle = 'rgba(0,180,80,0.55)';
    ctx.font = `8px ${MONO}`;
    ctx.fillText(deg === 0 ? '360' : String(deg),
      sCX + lr * Math.cos(rad), sCY + lr * Math.sin(rad) + 3);
  }
  ctx.textAlign = 'left';

  // Outer ring
  ctx.beginPath();
  ctx.arc(sCX, sCY, sR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,200,100,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Contact bearing label below sonar
  const enemy = sonar.find(c => c.type === 'enemy_sub');
  if (enemy) {
    const dx  = enemy.x - pos.x;
    const dy  = enemy.y - pos.y;
    const brg = ((Math.atan2(dy, dx) * 180 / Math.PI + 360 + 90) % 360).toFixed(0);
    const rng = Math.sqrt(dx * dx + dy * dy).toFixed(1);
    ctx.fillStyle = AMBER;
    ctx.font = `bold 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(`CONTACT  BRG ${brg}°  ·  RNG ${rng}u`, sCX, mainY + mainH - 10);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('NO CONTACTS DETECTED', sCX, mainY + mainH - 10);
    ctx.textAlign = 'left';
  }

  // ════════════════════════════
  // CONTACTS CARD
  // ════════════════════════════
  card(contX, mainY, contW, mainH);
  cardLabel(contX + 12, mainY + 16, 'CONTACTS');

  let cyy = mainY + 30;

  if (sonar.length === 0) {
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `11px ${MONO}`;
    ctx.fillText('NO CONTACTS', contX + 12, cyy + 20);
    ctx.font = `10px ${MONO}`;
    ctx.fillText('Sonar range: 3 units', contX + 12, cyy + 38);
    ctx.fillText('Move closer to detect enemy', contX + 12, cyy + 52);
    ctx.fillText('Enemy detects you based on', contX + 12, cyy + 70);
    ctx.fillText('your speed (slow/fast/max)', contX + 12, cyy + 84);
  } else {
    sonar.forEach((contact, i) => {
      const dx  = contact.x - pos.x;
      const dy  = contact.y - pos.y;
      const rng = Math.sqrt(dx * dx + dy * dy).toFixed(1);
      const brg = ((Math.atan2(dy, dx) * 180 / Math.PI + 360 + 90) % 360).toFixed(0);
      const isEnemy = contact.type === 'enemy_sub';
      const cid  = isEnemy ? `TGT-0${i + 1}` : `MINE-0${i + 1}`;
      const cc   = isEnemy ? AMBER : contact.owner === slot ? '#FFFF44' : '#FF8800';
      const rowH = isEnemy ? 90 : 60;

      // Contact row bg
      roundRect(contX + 8, cyy - 2, contW - 16, rowH, 3);
      ctx.fillStyle = isEnemy ? 'rgba(255,184,0,0.08)' : 'rgba(255,136,0,0.06)';
      ctx.fill();
      ctx.strokeStyle = isEnemy ? 'rgba(255,184,0,0.3)' : 'rgba(255,136,0,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = cc;
      ctx.font = `bold 12px ${MONO}`;
      ctx.fillText(
        `${cid}  ·  BRG ${brg}°  ·  RNG ~${rng}u`,
        contX + 14, cyy + 13
      );

      ctx.fillStyle = GREEN_DIM;
      ctx.font = `10px ${MONO}`;
      ctx.fillText(`DEPTH  ~Z:${contact.z ?? '?'}`, contX + 14, cyy + 27);

      if (isEnemy) {
        const noiseR = contact.noiseRadius ?? 3;
        const noise  = noiseR >= 5 ? 'HIGH  (SPEED: MAX)' : noiseR >= 4 ? 'MED   (SPEED: FAST)' : 'LOW   (SPEED: SLOW)';
        ctx.fillText(`NOISE  ${noise}`, contX + 14, cyy + 41);
        const closing = parseFloat(rng) < 3 ? 'VERY CLOSE — DANGER' : parseFloat(rng) < 4 ? 'CLOSING' : 'DISTANT';
        ctx.fillStyle = parseFloat(rng) < 3 ? RED : GREEN_DIM;
        ctx.fillText(`STATUS  ${closing}`, contX + 14, cyy + 55);

        // Estimated track
        ctx.fillStyle = GREEN_DIM;
        ctx.font = `9px ${MONO}`;
        const intercept = (parseFloat(rng) / 3 * 2).toFixed(0);
        ctx.fillText(`Intercept ~${intercept}s at current course`, contX + 14, cyy + 72);
      }

      cyy += rowH + 8;
    });

    // Estimated track section
    if (enemy) {
      const dx  = enemy.x - pos.x;
      const dy  = enemy.y - pos.y;
      const rng = Math.sqrt(dx * dx + dy * dy).toFixed(1);
      const brg = ((Math.atan2(dy, dx) * 180 / Math.PI + 360 + 90) % 360).toFixed(0);

      cyy += 4;
      ctx.fillStyle = GREEN_DIM;
      ctx.font = `10px ${MONO}`;
      ctx.letterSpacing = '1px';
      ctx.fillText('ESTIMATED TRACK', contX + 12, cyy);
      ctx.letterSpacing = '0px';
      cyy += 14;
      ctx.fillStyle = GREEN_MID;
      ctx.font = `10px ${MONO}`;
      ctx.fillText(`TGT-01 heading ${brg}° at ~${speed} speed`, contX + 12, cyy);
      cyy += 14;
      const intercept = (parseFloat(rng) / 3 * 2).toFixed(0);
      ctx.fillText(`Intercept in ~${intercept}s at current course`, contX + 12, cyy);
    }
  }

  // ════════════════════════════
  // WEAPONS CARD
  // ════════════════════════════
  card(weapX, mainY, weapW, mainH);
  cardLabel(weapX + 12, mainY + 16, 'WEAPONS');

  const wbX  = weapX + 10;
  const wbW  = weapW - 20;
  let   wyy  = mainY + 28;

  // TORPEDO block
  const tbH = 64;
  roundRect(wbX, wyy, wbW, tbH, 4);
  ctx.fillStyle = torpedoes > 0 ? 'rgba(0,255,150,0.06)' : 'rgba(255,68,68,0.05)';
  ctx.fill();
  ctx.strokeStyle = torpedoes > 0 ? 'rgba(0,255,150,0.3)' : 'rgba(255,68,68,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = torpedoes > 0 ? GREEN : RED;
  ctx.font = `bold 16px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`[ TORPEDO ]  x${torpedoes}`, wbX + wbW / 2, wyy + 24);
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = torpedoes > 0 ? GREEN_DIM : RED;
  ctx.fillText(
    torpedoes > 0 ? `ARMED  ·  6u/blink  ·  50 HP` : 'EXPENDED',
    wbX + wbW / 2, wyy + 40
  );
  ctx.fillStyle = GREEN_DIM;
  ctx.font = `9px ${MONO}`;
  ctx.fillText('fire at target (x,y,z)', wbX + wbW / 2, wyy + 54);
  ctx.textAlign = 'left';
  wyy += tbH + 10;

  // MINE block
  const mbH = 64;
  roundRect(wbX, wyy, wbW, mbH, 4);
  ctx.fillStyle = mines > 0 ? 'rgba(255,184,0,0.06)' : 'rgba(255,68,68,0.05)';
  ctx.fill();
  ctx.strokeStyle = mines > 0 ? 'rgba(255,184,0,0.35)' : 'rgba(255,68,68,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = mines > 0 ? AMBER : RED;
  ctx.font = `bold 16px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`[ MINE ]  x${mines}`, wbX + wbW / 2, wyy + 24);
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = mines > 0 ? 'rgba(255,184,0,0.6)' : RED;
  ctx.fillText(
    mines > 0 ? `READY  ·  1u/blink depth  ·  50 HP` : 'EXPENDED',
    wbX + wbW / 2, wyy + 40
  );
  ctx.fillStyle = 'rgba(255,184,0,0.4)';
  ctx.font = `9px ${MONO}`;
  ctx.fillText('deploy at (x,y), target_depth', wbX + wbW / 2, wyy + 54);
  ctx.textAlign = 'left';
  wyy += mbH + 10;

  // Noise indicator
  const noiseColor = speed === 'max' ? RED : speed === 'fast' ? AMBER : GREEN;
  const noiseLabel = speed === 'max' ? 'HIGH — ENEMY RANGE: 5u' :
                     speed === 'fast' ? 'MED — ENEMY RANGE: 4u' :
                     'LOW — ENEMY RANGE: 3u';
  ctx.fillStyle = GREEN_DIM;
  ctx.font = `9px ${MONO}`;
  ctx.letterSpacing = '1px';
  ctx.fillText('NOISE LEVEL', wbX, wyy);
  ctx.letterSpacing = '0px';
  wyy += 12;
  // Noise bar
  ctx.fillStyle = '#0a1428';
  roundRect(wbX, wyy, wbW, 10, 2);
  ctx.fill();
  const noisePct = speed === 'max' ? 1 : speed === 'fast' ? 0.67 : 0.33;
  ctx.fillStyle = noiseColor;
  roundRect(wbX, wyy, wbW * noisePct, 10, 2);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  roundRect(wbX, wyy, wbW, 10, 2);
  ctx.stroke();
  wyy += 14;
  ctx.fillStyle = noiseColor;
  ctx.font = `9px ${MONO}`;
  ctx.fillText(noiseLabel, wbX, wyy);
  wyy += 14;

  // Friendly fire warning
  ctx.fillStyle = 'rgba(255,68,68,0.5)';
  ctx.font = `9px ${MONO}`;
  ctx.fillText('FRIENDLY FIRE: ON  ·  NO AMMO REFILL', wbX, wyy);

  // ── BOTTOM BAR ──
  const botBarY = H - 28;
  ctx.fillStyle = '#050e1e';
  ctx.fillRect(0, botBarY, W, 28);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, botBarY);
  ctx.lineTo(W, botBarY);
  ctx.stroke();

  const items = [
    `ROUND: ${round}/3`,
    `BLINK: ${blink}`,
    `TIME: ${Math.max(0, timeLeft)}s`,
    `HP: ${hp}`,
    `TORP: ${torpedoes}/6`,
    `MINES: ${mines}/6`,
    `SPEED: ${speed.toUpperCase()}`,
    powered ? 'POWER: ON' : 'POWER: LOST',
  ];
  ctx.textAlign = 'center';
  items.forEach((item, i) => {
    const ix = (W / items.length) * (i + 0.5);
    ctx.fillStyle = item.includes('LOST') ? RED : item.includes('0/6') ? 'rgba(255,68,68,0.7)' : GREEN_DIM;
    ctx.font = `9px ${MONO}`;
    ctx.fillText(item, ix, botBarY + 17);
  });
  ctx.textAlign = 'left';

  // ── POWER LOSS OVERLAY ──
  if (!powered) {
    ctx.fillStyle = 'rgba(255,0,0,0.1)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RED;
    ctx.font = `bold 14px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('⚠  POWER LOST — SUB SINKING  ⚠', W / 2, H / 2 - 10);
    if (self.lastError) {
      ctx.fillStyle = '#FF8888';
      ctx.font = `11px ${MONO}`;
      ctx.fillText(`ERROR: ${self.lastError.message}`, W / 2, H / 2 + 10);
    }
    ctx.textAlign = 'left';
  }
}

// ─── MATCH PAGE COMPONENT ─────────────────────────────────────────────────────
export default function Match() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const { socket }    = useSocket();

  // Match state
  const [phase, setPhase]           = useState('menu');
  // phases: menu | queuing | found | playing | between_rounds | finished
  const [slot, setSlot]             = useState(null);   // 'p1' or 'p2'
  const [matchId, setMatchId]       = useState(null);
  const [opponent, setOpponent]     = useState(null);
  const [gameState, setGameState]   = useState(null);
  const [roundScores, setRoundScores] = useState({ p1: 0, p2: 0, draws: 0 });
  const [timeLeft, setTimeLeft]     = useState(60);
  const [betweenTime, setBetweenTime] = useState(30);
  const [matchResult, setMatchResult] = useState(null);
  const [hitLog, setHitLog]         = useState([]);
  const [roundResult, setRoundResult] = useState(null);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editorCode, setEditorCode] = useState('');
  const [scripts, setScripts]       = useState([]);
  const [activeScript, setActiveScript] = useState(null);

  // Refs
  const canvasRef      = useRef(null);
  const pyodideRef     = useRef(null);
  const botCodeRef     = useRef('');
  const slotRef        = useRef(null);
  const gameStateRef   = useRef(null);
  const betweenTimerRef = useRef(null);
  const friendMode     = searchParams.get('mode') === 'friend';

  // ── LOAD SCRIPTS + PYODIDE ──────────────────────────────────────────────
  useEffect(() => {
    loadUserScripts();
    loadPyodide().then(ok => {
      pyodideRef.current = ok;
    });
  }, []);

  // ── KEEP REFS IN SYNC ───────────────────────────────────────────────────
  useEffect(() => { slotRef.current = slot; }, [slot]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    let animFrame;
    let running = true;

    function animate() {
    if (!running) return;
    if (canvasRef.current && gameStateRef.current && slot) {
        drawCockpit(canvasRef.current, gameStateRef.current, slot, botCodeRef.current);
    }
    animFrame = requestAnimationFrame(animate);
    }

    animFrame = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animFrame);
    };
  }, [slot]);

  // ── SOCKET EVENTS ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('match_found', (data) => {
      setSlot(data.slot);
      slotRef.current = data.slot;
      setMatchId(data.matchId);
      setOpponent(data.opponent);
      setPhase('found');
      setTimeout(() => setPhase('playing'), 2000);
    });

    socket.on('blink', (data) => {
      setGameState(data);
      setTimeLeft(data.timeLeft);
      setRoundScores(data.roundScores || { p1: 0, p2: 0, draws: 0 });

      // Add new hit events to the log
      if (data.hitLog?.length > 0) {
        setHitLog(prev => [...prev.slice(-20), ...data.hitLog]);
      }

      // Run Python bot and send action back
      if (slotRef.current && pyodideRef.current && botCodeRef.current) {
        runPythonBot(botCodeRef.current, buildBotState(data, slotRef.current))
          .then(action => {
            socket.emit('bot_action', { action });
          });
      }
    });

    socket.on('round_end', (data) => {
      setRoundResult(data.result);
      setRoundScores(data.roundScores);
      setPhase('between_rounds');

      // Countdown
      let t = data.timeoutSecs;
      setBetweenTime(t);
      betweenTimerRef.current = setInterval(() => {
        t--;
        setBetweenTime(t);
        if (t <= 0) clearInterval(betweenTimerRef.current);
      }, 1000);
    });

    socket.on('round_start', (data) => {
      setPhase('playing');
      setRoundResult(null);
      clearInterval(betweenTimerRef.current);
    });

    socket.on('match_end', (data) => {
      setMatchResult(data);
      setPhase('finished');
    });

    socket.on('opponent_disconnected', (data) => {
      setMatchResult({ winner: data.winner, disconnected: true });
      setPhase('finished');
    });

    return () => {
      socket.off('match_found');
      socket.off('blink');
      socket.off('round_end');
      socket.off('round_start');
      socket.off('match_end');
      socket.off('opponent_disconnected');
    };
  }, [socket]);

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  async function loadUserScripts() {
    try {
      const res = await axios.get(`${API}/api/scripts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScripts(res.data.scripts);
      if (res.data.scripts.length > 0) {
        const s = res.data.scripts[0];
        setActiveScript(s);
        setEditorCode(s.code);
        botCodeRef.current = s.code;
      }
    } catch (err) {
      console.error('Failed to load scripts');
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

  function selectScript(script) {
    setActiveScript(script);
    setEditorCode(script.code);
    botCodeRef.current = script.code;
  }

  function handleCodeChange(newCode) {
    setEditorCode(newCode);
    botCodeRef.current = newCode || '';
    // Send updated code to server (for between-round updates)
    if (socket && phase === 'playing') {
      socket.emit('update_script', { script: newCode });
    }
  }

  // ── BUILD BOT STATE ───────────────────────────────────────────────────────
  function buildBotState(blinkData, mySlot) {
    return {
      self: blinkData.self,
      sonar_results: blinkData.sonarResults || [],
      my_mines: (blinkData.mines || [])
        .filter(m => m.owner === mySlot)
        .map(m => ({
          id: m.id, x: m.x, y: m.y, z: m.z,
          target_depth: m.targetDepth, settled: m.settled,
        })),
      hit_log: blinkData.hitLog || [],
      round:     blinkData.round,
      blink:     blinkData.blink,
      time_left: blinkData.timeLeft,
    };
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* ── TOP BAR ── */}
      <div style={styles.topBar}>
        <button className="btn btn-ghost"
          style={{ fontSize: '12px', padding: '6px 14px' }}
          onClick={() => navigate('/menu')}>
          ← Menu
        </button>

        <div style={styles.matchInfo}>
          {opponent && (
            <span style={styles.vsText}>
              <span style={{ color: 'var(--teal)' }}>{user?.username}</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 12px' }}>vs</span>
              <span style={{ color: 'var(--orange)' }}>{opponent.username}</span>
            </span>
          )}
          {phase === 'playing' && (
            <span style={styles.timerText}>
              {String(Math.max(0, timeLeft)).padStart(2, '0')}s
            </span>
          )}
          {phase === 'between_rounds' && (
            <span style={{ ...styles.timerText, color: 'var(--orange)' }}>
              Next round in {betweenTime}s
            </span>
          )}
        </div>

        <div style={styles.topRight}>
          {/* Round scores */}
          {opponent && (
            <span style={styles.scoreText}>
              {roundScores[slot] ?? 0} — {roundScores[slot === 'p1' ? 'p2' : 'p1'] ?? 0}
            </span>
          )}
          {(phase === 'playing' || phase === 'between_rounds') && (
            <button className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '6px 14px' }}
              onClick={() => setShowEditor(!showEditor)}>
              {showEditor ? 'Hide Code' : 'Edit Code'}
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={styles.main}>

        {/* ── PRE-MATCH MENU ── */}
        {phase === 'menu' && (
          <div style={styles.centerPanel}>
            <h2 style={styles.panelTitle}>Ready to Fight?</h2>

            {/* Script selector */}
            <div style={styles.scriptSelect}>
              <p style={styles.label}>Active bot script:</p>
              {scripts.length === 0 ? (
                <p style={styles.muted}>
                  No scripts saved.{' '}
                  <button className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => navigate('/editor')}>
                    Go to Editor
                  </button>
                </p>
              ) : (
                <div style={styles.scriptList}>
                  {scripts.map(s => (
                    <button key={s.id}
                      onClick={() => selectScript(s)}
                      style={{
                        ...styles.scriptBtn,
                        borderColor: activeScript?.id === s.id
                          ? 'var(--teal)' : 'var(--border)',
                        color: activeScript?.id === s.id
                          ? 'var(--teal)' : 'var(--text-secondary)',
                      }}>
                      {s.name}
                      <span style={styles.scriptLang}>{s.language.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="btn btn-teal"
              style={{ fontSize: '16px', padding: '14px 48px', marginTop: '24px' }}
              onClick={joinQueue}
              disabled={!activeScript}>
              Find Match
            </button>

            {!activeScript && (
              <p style={{ ...styles.muted, marginTop: '12px' }}>
                Save a script in the Editor first
              </p>
            )}
          </div>
        )}

        {/* ── QUEUING ── */}
        {phase === 'queuing' && (
          <div style={styles.centerPanel}>
            <div style={styles.searching}>
              <div style={styles.pulse} />
              <h2 style={styles.panelTitle}>Searching for opponent...</h2>
              <p style={styles.muted}>Using: {activeScript?.name}</p>
              <button className="btn btn-ghost"
                style={{ marginTop: '24px' }}
                onClick={leaveQueue}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── MATCH FOUND ── */}
        {phase === 'found' && (
          <div style={styles.centerPanel}>
            <h2 style={{ color: 'var(--teal)', fontSize: '24px' }}>Match Found!</h2>
            <p style={styles.muted}>
              vs <span style={{ color: 'var(--orange)' }}>{opponent?.username}</span>
              {' '}(ELO {opponent?.elo})
            </p>
            <p style={{ ...styles.muted, marginTop: '12px' }}>Preparing battle stations...</p>
          </div>
        )}

        {/* ── PLAYING / BETWEEN ROUNDS ── */}
        {(phase === 'playing' || phase === 'between_rounds') && (
          <div style={styles.cockpitArea}>

            {/* Between rounds overlay */}
            {phase === 'between_rounds' && (
              <div style={styles.betweenOverlay}>
                <div style={styles.betweenCard}>
                  <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>
                    {roundResult?.winner === slot
                      ? '✅ Round Won'
                      : roundResult?.winner === null
                      ? '🤝 Round Draw'
                      : '❌ Round Lost'}
                  </h3>
                  <p style={styles.muted}>
                    Score: {roundScores[slot] ?? 0} — {roundScores[slot === 'p1' ? 'p2' : 'p1'] ?? 0}
                  </p>
                  <p style={{ ...styles.muted, marginTop: '8px' }}>
                    Next round starts in{' '}
                    <span style={{ color: 'var(--teal)' }}>{betweenTime}s</span>
                  </p>
                  <p style={{ ...styles.muted, fontSize: '11px', marginTop: '8px' }}>
                    Edit your code now — changes apply at round start
                  </p>
                </div>
              </div>
            )}

            {/* Canvas cockpit */}
            <canvas
              ref={canvasRef}
              width={780}
              height={460}
              style={styles.canvas}
            />

            {/* Hit log */}
            <div style={styles.hitLog}>
              <div style={styles.hitLogTitle}>HIT LOG</div>
              {hitLog.slice(-8).reverse().map((h, i) => (
                <div key={i} style={{
                  ...styles.hitEntry,
                  color: h.target === slot ? '#E24B4A' : '#1D9E75',
                }}>
                  [{h.blink}] {h.target === slot ? '▼ RECEIVED' : '▲ DEALT'} {h.damage} HP
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MATCH FINISHED ── */}
        {phase === 'finished' && (
          <div style={styles.centerPanel}>
            <h2 style={{
              fontSize: '28px',
              color: matchResult?.winner === slot
                ? 'var(--teal)'
                : matchResult?.winner === null
                ? 'var(--text-secondary)'
                : 'var(--orange)',
              marginBottom: '12px',
            }}>
              {matchResult?.winner === slot
                ? '🏆 Victory'
                : matchResult?.winner === null
                ? '🤝 Draw'
                : '💀 Defeat'}
            </h2>

            {matchResult?.disconnected && (
              <p style={styles.muted}>Opponent disconnected</p>
            )}

            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Final score: {roundScores[slot] ?? 0} — {roundScores[slot === 'p1' ? 'p2' : 'p1'] ?? 0}
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-teal"
                onClick={() => {
                  setPhase('menu');
                  setGameState(null);
                  setOpponent(null);
                  setMatchResult(null);
                  setHitLog([]);
                  setRoundScores({ p1: 0, p2: 0, draws: 0 });
                }}>
                Play Again
              </button>
              {matchResult?.matchId && (
                <button className="btn btn-teal"
                  onClick={() => navigate(`/replay/${matchResult.matchId}`)}>
                  Watch Replay
                </button>
              )}
              <button className="btn btn-ghost"
                onClick={() => navigate('/menu')}>
                Main Menu
              </button>
            </div>
          </div>
        )}

        {/* ── SLIDE-IN CODE EDITOR ── */}
        {showEditor && (
          <div style={styles.editorPanel}>
            <div style={styles.editorPanelTop}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {activeScript?.name || 'unsaved'} — changes apply next blink
              </span>
              <button
                onClick={() => setShowEditor(false)}
                style={styles.closeBtn}>
                ✕
              </button>
            </div>
            <MonacoEditor
              height="100%"
              language={activeScript?.language === 'c' ? 'c' : 'python'}
              theme="vs-dark"
              value={editorCode}
              onChange={handleCodeChange}
              options={{
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                tabSize: 4,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-primary)',
    overflow: 'hidden',
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
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  vsText: {
    fontSize: '14px',
    fontWeight: '500',
  },
  timerText: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--teal)',
    fontVariantNumeric: 'tabular-nums',
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  scoreText: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  centerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  panelTitle: {
    fontSize: '24px',
    fontWeight: '500',
    marginBottom: '24px',
  },
  label: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '10px',
  },
  muted: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  scriptSelect: {
    width: '100%',
    maxWidth: '400px',
  },
  scriptList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  scriptBtn: {
    background: 'var(--bg-secondary)',
    border: '1px solid',
    borderRadius: '6px',
    padding: '10px 14px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
  scriptLang: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  searching: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  pulse: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'var(--teal)',
    opacity: 0.6,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  cockpitArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '16px',
    gap: '16px',
    position: 'relative',
  },
  canvas: {
    border: '1px solid var(--border)',
    borderRadius: '8px',
  },
  hitLog: {
    width: '200px',
    flexShrink: 0,
  },
  hitLogTitle: {
    fontSize: '9px',
    fontWeight: '500',
    letterSpacing: '.08em',
    color: 'var(--text-muted)',
    marginBottom: '8px',
  },
  hitEntry: {
    fontSize: '10px',
    lineHeight: '1.8',
    fontFamily: 'JetBrains Mono, monospace',
  },
  betweenOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(10,14,26,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  betweenCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '32px 48px',
    textAlign: 'center',
  },
  editorPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '480px',
    height: '100%',
    background: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
  },
  editorPanelTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
  },
};