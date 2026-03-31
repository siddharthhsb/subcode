import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { loadPyodide, runPythonBot } from '../engine/pythonSandbox';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function drawSonar(canvas, gameState, slot) {
  if (!canvas || !gameState) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CX = W/2, CY = H/2, R = Math.min(W,H)/2 - 4;
  const uPx = R/5;
  const MONO = '"Courier New", monospace';
  const self  = gameState.self || {};
  const sonar = gameState.sonarResults || [];
  const pos   = self.position || { x:0, y:0, z:0 };

  ctx.clearRect(0,0,W,H);
  ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2);
  const g = ctx.createRadialGradient(CX,CY-15,0,CX,CY,R);
  g.addColorStop(0,'#0D2B3E'); g.addColorStop(0.5,'#071C2A'); g.addColorStop(1,'#020E18');
  ctx.fillStyle=g; ctx.fill();

  [0.25,0.5,0.75,1].forEach(f=>{
    ctx.beginPath(); ctx.arc(CX,CY,R*f,0,Math.PI*2);
    ctx.strokeStyle=f===0.75?'rgba(0,200,100,0.22)':'rgba(0,200,100,0.1)';
    ctx.lineWidth=0.8; ctx.stroke();
  });

  ctx.strokeStyle='rgba(0,200,100,0.08)'; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(CX-R,CY); ctx.lineTo(CX+R,CY);
  ctx.moveTo(CX,CY-R); ctx.lineTo(CX,CY+R); ctx.stroke();

  const sw=((Date.now()/1000)*Math.PI*2)%(Math.PI*2);
  for(let i=0;i<40;i++){
    const a=sw-i*0.05; ctx.beginPath(); ctx.moveTo(CX,CY);
    ctx.arc(CX,CY,R,a,a+0.05); ctx.closePath();
    ctx.fillStyle=`rgba(0,255,150,${(1-i/40)*0.22})`; ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(CX,CY);
  ctx.lineTo(CX+R*Math.cos(sw),CY+R*Math.sin(sw));
  ctx.strokeStyle='rgba(0,255,150,0.9)'; ctx.lineWidth=1.5; ctx.stroke();

  for(const c of sonar){
    const dx=c.x-pos.x, dy=c.y-pos.y;
    const px=CX+dx*uPx, py=CY+dy*uPx;
    if(c.type==='enemy_sub'){
      const bl=Math.sin(Date.now()/200)>0;
      ctx.beginPath(); ctx.arc(px,py,bl?6:5,0,Math.PI*2); ctx.fillStyle='#FFB800'; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,11,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,184,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2);
      ctx.fillStyle=c.owner===slot?'#CCFF00':'#FF8800'; ctx.fill();
    }
  }

  ctx.beginPath(); ctx.arc(CX,CY,6,0,Math.PI*2); ctx.fillStyle='#00FF9F'; ctx.fill();
  ctx.beginPath(); ctx.arc(CX,CY,11,0,Math.PI*2);
  ctx.strokeStyle='rgba(0,255,150,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2);
  ctx.strokeStyle='rgba(0,200,100,0.4)'; ctx.lineWidth=1.5; ctx.stroke();

  ctx.textAlign='center';
  for(let d=0;d<360;d+=30){
    const rad=(d-90)*Math.PI/180;
    ctx.beginPath();
    ctx.moveTo(CX+(R-6)*Math.cos(rad),CY+(R-6)*Math.sin(rad));
    ctx.lineTo(CX+(R+2)*Math.cos(rad),CY+(R+2)*Math.sin(rad));
    ctx.strokeStyle='rgba(0,180,80,0.5)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='rgba(0,180,80,0.5)'; ctx.font=`8px ${MONO}`;
    ctx.fillText(d===0?'360':String(d),CX+(R+13)*Math.cos(rad),CY+(R+13)*Math.sin(rad)+3);
  }
  ctx.textAlign='left';
}

function Cockpit({ gameState, slot, onEditCode }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    let running = true;
    function animate() {
      if (!running) return;
      if (canvasRef.current && gameState) drawSonar(canvasRef.current, gameState, slot);
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [gameState, slot]);

  if (!gameState) return null;

  const self       = gameState.self || {};
  const sonar      = gameState.sonarResults || [];
  const pos        = self.position || { x:0, y:0, z:0 };
  const hp         = self.hp ?? 100;
  const torps      = self.torpedoes ?? 0;
  const mines      = self.mines ?? 0;
  const speed      = self.speed || 'idle';
  const depth      = pos.z ?? 0;
  const powered    = self.powered !== false;
  const oob        = self.outOfBounds || false;
  const round      = gameState.round || 1;
  const blink      = gameState.blink || 0;
  const timeLeft   = Math.max(0, gameState.timeLeft ?? 0);
  const lastAction = self.lastAction || null;

  const hpColor  = hp>50?'#00FF9F':hp>25?'#FFB800':'#FF4444';
  const spColor  = speed==='max'?'#FF4444':speed==='fast'?'#FFB800':'#00FF9F';
  const depColor = depth>7?'#FF4444':depth>5?'#FFB800':'#00FF9F';

  let ndx=0, ndy=0, ndz=0;
  if(lastAction?.action==='move'){
    const spd=lastAction.speed==='max'?3:lastAction.speed==='fast'?2:1;
    ndx=(lastAction.dx||0)*spd; ndy=(lastAction.dy||0)*spd; ndz=(lastAction.dz||0)*spd;
  }
  const nx=Math.round(pos.x)+ndx, ny=Math.round(pos.y)+ndy;
  const mdx=lastAction?.dx||0, mdy=lastAction?.dy||0, zdz=lastAction?.dz||0;

  const dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]];
  const arrows=['↖','↑','↗','←','●','→','↙','↓','↘'];
  const zArrows=[[-1,'↑'],[0,'●'],[1,'↓']];

  const noiseLabel=speed==='max'?'HIGH · 5u':speed==='fast'?'MED · 4u':'LOW · 3u';
  const noiseC=speed==='max'?'#FF4444':speed==='fast'?'#FFB800':'#00FF9F';
  const noisePct=speed==='max'?100:speed==='fast'?67:33;

  const enemy=sonar.find(c=>c.type==='enemy_sub');
  const enemyBrg=enemy?((Math.atan2(enemy.y-pos.y,enemy.x-pos.x)*180/Math.PI+360+90)%360).toFixed(0):null;
  const enemyRng=enemy?Math.sqrt((enemy.x-pos.x)**2+(enemy.y-pos.y)**2).toFixed(1):null;
  const eta=enemy?Math.max(1,(parseFloat(enemyRng)/3*2)).toFixed(0):null;

  return (
    <div style={C.root}>
      <div style={C.top}>
        <div style={C.tc}>
          <div style={C.tl}>DEPTH</div>
          <div style={{...C.tv,color:depColor}}>Z : {depth}</div>
          <div style={C.ts}>{depth===0?'SURFACE':depth===9?'SEAFLOOR':depth>5?'DEEP':'SHALLOW'}</div>
        </div>
        <div style={{...C.tc,borderLeft:'1px solid #0d2a1a'}}>
          <div style={C.tl}>SPEED</div>
          <div style={{...C.tv,color:spColor}}>{speed.toUpperCase()}</div>
          <div style={{...C.ts,color:spColor}}>{speed==='max'?'3 UNITS / BLINK':speed==='fast'?'2 UNITS / BLINK':speed==='slow'?'1 UNIT / BLINK':'NO MOVEMENT'}</div>
        </div>
        <div style={{...C.tc,borderLeft:'1px solid #0d2a1a'}}>
          <div style={C.tl}>POSITION</div>
          <div style={{...C.tv,color:oob?'#FF4444':'#00FF9F',fontSize:'22px'}}>({Math.round(pos.x)}, {Math.round(pos.y)})</div>
          <div style={{...C.ts,color:oob?'#FF4444':'#1a5c3a'}}>X · Y · {oob?'OUT OF BOUNDS':'IN BOUNDS'}</div>
        </div>
        <div style={{...C.tc,borderLeft:'1px solid #0d2a1a',flex:1.6}}>
          <div style={C.tl}>HULL INTEGRITY</div>
          <div style={{...C.tv,color:hpColor}}>{hp}%</div>
          <div style={C.hpbar}><div style={{...C.hpfill,width:`${hp}%`,background:hpColor}}/></div>
          <div style={{...C.ts,color:hpColor}}>{hp===100?'NOMINAL':hp>50?'DAMAGED — combat effective':hp>25?'CRITICAL — one hit remaining':'CRITICAL — IMMINENT DESTRUCTION'}</div>
        </div>
      </div>

      <div style={C.main}>
        <div style={C.lp}>
          <div style={C.card}>
            <div style={C.cl}>HEADING — NEXT BLINK</div>
            <div style={{display:'flex',alignItems:'flex-start',gap:'8px'}}>
              <div>
                <div style={C.axlbl}>X · Y</div>
                <div style={C.grid}>
                  {dirs.map(([dx,dy],i)=>{
                    const isActive=dx===mdx&&dy===mdy&&lastAction?.action==='move';
                    const isCenter=dx===0&&dy===0;
                    return <div key={i} style={{...C.cell,background:isActive?'rgba(0,255,150,0.15)':isCenter?'#0d2a1a':'#0a1428',border:`1px solid ${isActive?'rgba(0,255,150,0.5)':'#0d2a1a'}`,color:isActive?'#00FF9F':'#1a5c3a',fontWeight:isActive?'bold':'normal'}}>{arrows[i]}</div>;
                  })}
                </div>
              </div>
              <div>
                <div style={C.axlbl}>Z</div>
                <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                  {zArrows.map(([dz,arrow])=>{
                    const isActive=dz===zdz&&lastAction?.action==='move';
                    const isCenter=dz===0;
                    return <div key={dz} style={{...C.cell,background:isActive?'rgba(0,255,150,0.15)':isCenter?'#0d2a1a':'#0a1428',border:`1px solid ${isActive?'rgba(0,255,150,0.5)':'#0d2a1a'}`,color:isActive?'#00FF9F':'#1a5c3a',fontWeight:isActive?'bold':'normal'}}>{arrow}</div>;
                  })}
                </div>
              </div>
              <div style={{flex:1,textAlign:'center',paddingTop:'12px'}}>
                <div style={C.nxtlbl}>NEXT BLINK</div>
                <div style={{fontSize:'17px',fontWeight:'bold',color:'#00FF9F',margin:'4px 0'}}>({nx}, {ny})</div>
                <div style={{fontSize:'10px',color:'#1a5c3a',lineHeight:'1.9',opacity:0.8}}>
                  {ndx!==0&&<>{ndx>0?`+${ndx}`:ndx} X · {ndx>0?'EAST':'WEST'}<br/></>}
                  {ndy!==0&&<>{ndy>0?`+${ndy}`:ndy} Y · {ndy>0?'SOUTH':'NORTH'}<br/></>}
                  {ndz!==0&&<>{ndz>0?`+${ndz}`:ndz} Z · {ndz>0?'DEEPER':'RISE'}<br/></>}
                  {ndx===0&&ndy===0&&ndz===0&&'HOLDING'}
                </div>
              </div>
            </div>
          </div>

          <div style={C.card}>
            <div style={C.cl}>NOISE LEVEL</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
              <div style={{fontSize:'11px',color:'#1a5c3a',opacity:0.7}}>EMITTING</div>
              <div style={{fontSize:'14px',fontWeight:'bold',color:noiseC}}>{noiseLabel}</div>
            </div>
            <div style={C.nbar}><div style={{height:'100%',borderRadius:'2px',width:`${noisePct}%`,background:noiseC}}/></div>
            <div style={{fontSize:'9px',color:'#1a5c3a',opacity:0.5,marginTop:'4px'}}>SLOW = 3u  ·  FAST = 4u  ·  MAX = 5u</div>
          </div>

          <div style={{...C.card,flex:1}}>
            <div style={C.cl}>WEAPONS</div>
            <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
              <div style={{...C.wcrd,background:'rgba(0,255,150,0.05)',border:`1px solid ${torps>0?'rgba(0,255,150,0.25)':'rgba(255,68,68,0.2)'}`}}>
                <div style={{fontSize:'10px',color:torps>0?'#00FF9F':'#FF4444',letterSpacing:'1px',marginBottom:'4px',opacity:0.8}}>TORPEDO</div>
                <div style={{fontSize:'36px',fontWeight:'bold',color:torps>0?'#00FF9F':'#FF4444',lineHeight:1}}>{torps}</div>
                <div style={{fontSize:'9px',color:'#1a5c3a',marginTop:'4px',opacity:0.6}}>6u/blink · 50 HP</div>
              </div>
              <div style={{...C.wcrd,background:'rgba(255,184,0,0.05)',border:`1px solid ${mines>0?'rgba(255,184,0,0.25)':'rgba(255,68,68,0.2)'}`}}>
                <div style={{fontSize:'10px',color:mines>0?'#FFB800':'#FF4444',letterSpacing:'1px',marginBottom:'4px',opacity:0.8}}>MINE</div>
                <div style={{fontSize:'36px',fontWeight:'bold',color:mines>0?'#FFB800':'#FF4444',lineHeight:1}}>{mines}</div>
                <div style={{fontSize:'9px',color:'#1a5c3a',marginTop:'4px',opacity:0.6}}>target · 50 HP</div>
              </div>
            </div>
            <div style={{fontSize:'9px',color:'rgba(255,68,68,0.45)',textAlign:'center',marginTop:'8px',letterSpacing:'1px'}}>FRIENDLY FIRE: ON · NO REFILL</div>
          </div>
        </div>

        <div style={C.sp}>
          <div style={C.slbl}>ACTIVE SONAR — BLINK {blink} · ROUND {round}/3 · {timeLeft}s</div>
          <canvas ref={canvasRef} width={340} height={340} style={{borderRadius:'50%',display:'block'}}/>
          <div style={C.sbrg}>{enemy?`CONTACT  BRG ${enemyBrg}°  ·  RNG ${enemyRng}u  ·  Z:${enemy.z??'?'}`:'NO CONTACTS DETECTED'}</div>
        </div>

        <div style={C.rp}>
          <div style={C.cl}>CONTACTS</div>
          {sonar.length===0?(
            <div style={C.card}>
              <div style={{fontSize:'13px',color:'#00FF9F',marginBottom:'8px'}}>NO CONTACTS</div>
              <div style={{fontSize:'10px',color:'#1a5c3a',lineHeight:1.8,opacity:0.7}}>Sonar range: 3 units<br/>Move closer to detect</div>
            </div>
          ):(
            <>
              {sonar.map((c,i)=>{
                const dx=c.x-pos.x, dy=c.y-pos.y;
                const rng=Math.sqrt(dx*dx+dy*dy).toFixed(1);
                const brg=((Math.atan2(dy,dx)*180/Math.PI+360+90)%360).toFixed(0);
                const isE=c.type==='enemy_sub';
                const cid=isE?`TGT-0${i+1}`:`MINE-0${i+1}`;
                const cc=isE?'#FFB800':c.owner===slot?'#CCFF00':'#FF8800';
                const nr=c.noiseRadius??3;
                const danger=parseFloat(rng)<2?'VERY CLOSE — DANGER':parseFloat(rng)<3.5?'CLOSING':'DISTANT';
                return (
                  <div key={i} style={{background:isE?'rgba(255,184,0,0.06)':'rgba(255,136,0,0.04)',border:`1px solid ${isE?'rgba(255,184,0,0.2)':'rgba(255,136,0,0.18)'}`,borderRadius:'3px',padding:'9px 12px',marginBottom:'8px'}}>
                    <div style={{fontSize:'12px',fontWeight:'bold',color:cc,marginBottom:'5px'}}>{cid} · BRG {brg}° · RNG {rng}u</div>
                    <div style={{fontSize:'10px',color:'#1a5c3a',lineHeight:1.9,opacity:0.85}}>
                      Z: {c.z??'?'}<br/>
                      {isE?(<>NOISE: {nr>=5?'HIGH (MAX)':nr>=4?'MED (FAST)':'LOW (SLOW)'}<br/><span style={{color:parseFloat(rng)<2?'#FF4444':'#1a5c3a'}}>THREAT: {danger}</span></>):(<>{c.owner===slot?'ALLY MINE':'HOSTILE — AVOID'}</>)}
                    </div>
                  </div>
                );
              })}
              {enemy&&eta&&(
                <div style={{...C.card,flex:1}}>
                  <div style={C.cl}>EST. TRACK</div>
                  <div style={{fontSize:'11px',color:'#00CC7A',lineHeight:2.1}}>TGT-01 · heading {enemyBrg}°<br/>at {speed} speed<br/>Intercept ~{eta}s</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={C.bot}>
        {[['ROUND',`${round}/3`],['BLINK',blink],['TIME',`${timeLeft}s`],['POWER',powered?'ON':'LOST'],['OOB',oob?'YES':'NO']].map(([lbl,val],i,arr)=>(
          <div key={lbl} style={{display:'flex',alignItems:'center',flex:1}}>
            <div style={{...C.bi,flex:1}}>
              <div style={C.bil}>{lbl}</div>
              <div style={{...C.biv,color:val==='LOST'||val==='YES'?'#FF4444':'#00FF9F'}}>{val}</div>
            </div>
            {i<arr.length-1&&<div style={C.bd}/>}
          </div>
        ))}
      </div>

      <button className="btn btn-ghost" onClick={onEditCode} style={{position:'absolute',top:8,right:8,fontSize:'11px',padding:'4px 10px',zIndex:5,opacity:0.7}}>Edit Code</button>

      {!powered&&(
        <div style={{position:'absolute',inset:0,background:'rgba(255,0,0,0.1)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:20}}>
          <div style={{fontSize:'20px',fontWeight:'bold',color:'#FF4444',fontFamily:'"Courier New",monospace'}}>POWER LOST — SUB SINKING</div>
          {self.lastError&&<div style={{fontSize:'13px',color:'#FF8888',marginTop:'10px',fontFamily:'"Courier New",monospace'}}>ERROR: {self.lastError.message}</div>}
        </div>
      )}
    </div>
  );
}

const MONO = '"Courier New", monospace';
const C = {
  root:  {position:'relative',width:'100%',height:'100%',background:'#050d14',display:'flex',flexDirection:'column',fontFamily:MONO,overflow:'hidden'},
  top:   {display:'flex',borderBottom:'1px solid #0d2a1a',background:'#040b10',flexShrink:0},
  tc:    {padding:'10px 16px',flex:1},
  tl:    {fontSize:'9px',color:'#1a5c3a',letterSpacing:'3px',marginBottom:'4px',opacity:0.6},
  tv:    {fontSize:'26px',fontWeight:'bold',lineHeight:1,marginBottom:'3px'},
  ts:    {fontSize:'10px',color:'#1a5c3a',opacity:0.7},
  hpbar: {height:'5px',background:'#0a1428',borderRadius:'2px',overflow:'hidden',margin:'5px 0 3px',border:'1px solid #0d2a1a'},
  hpfill:{height:'100%',borderRadius:'2px'},
  main:  {display:'flex',flex:1,overflow:'hidden'},
  lp:    {width:'240px',flexShrink:0,borderRight:'1px solid #0d2a1a',background:'#040b10',padding:'10px',display:'flex',flexDirection:'column',gap:'8px',overflowY:'auto'},
  card:  {background:'#060f18',border:'1px solid #0d2a1a',borderRadius:'3px',padding:'10px 12px'},
  cl:    {fontSize:'9px',color:'#1a5c3a',letterSpacing:'2px',marginBottom:'8px',opacity:0.55},
  axlbl: {fontSize:'8px',color:'#1a5c3a',textAlign:'center',marginBottom:'3px',opacity:0.55,letterSpacing:'1px'},
  grid:  {display:'grid',gridTemplateColumns:'repeat(3,22px)',gap:'2px'},
  cell:  {width:'22px',height:'22px',borderRadius:'2px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',cursor:'default'},
  nxtlbl:{fontSize:'8px',color:'#1a5c3a',letterSpacing:'1px',opacity:0.6},
  nbar:  {height:'6px',background:'#0a1428',borderRadius:'2px',overflow:'hidden',border:'1px solid #0d2a1a'},
  wcrd:  {flex:1,borderRadius:'3px',padding:'10px 8px',textAlign:'center'},
  sp:    {flex:1,background:'#040c12',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'12px',gap:'8px',borderRight:'1px solid #0d2a1a'},
  slbl:  {fontSize:'9px',color:'#1a5c3a',letterSpacing:'2px',alignSelf:'flex-start',opacity:0.6},
  sbrg:  {fontSize:'12px',fontWeight:'bold',color:'#FFB800',letterSpacing:'1px'},
  rp:    {width:'260px',flexShrink:0,background:'#040b10',padding:'10px',display:'flex',flexDirection:'column',gap:'0',overflowY:'auto'},
  bot:   {display:'flex',alignItems:'center',height:'32px',borderTop:'1px solid #0d2a1a',background:'#030910',flexShrink:0},
  bi:    {textAlign:'center'},
  bil:   {fontSize:'8px',color:'#1a5c3a',letterSpacing:'1px',opacity:0.55},
  biv:   {fontSize:'12px',fontWeight:'bold',marginTop:'1px'},
  bd:    {width:'1px',height:'20px',background:'#0d2a1a',flexShrink:0},
};

export default function Match() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { user, token } = useAuth();
  const { socket }      = useSocket();

  const [phase, setPhase]             = useState('menu');
  const [slot, setSlot]               = useState(null);
  const [opponent, setOpponent]       = useState(null);
  const [gameState, setGameState]     = useState(null);
  const [roundScores, setRoundScores] = useState({ p1:0, p2:0, draws:0 });
  const [timeLeft, setTimeLeft]       = useState(60);
  const [betweenTime, setBetweenTime] = useState(30);
  const [matchResult, setMatchResult] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [friendUsername, setFriendUsername] = useState('');
  const [friendRated, setFriendRated]       = useState(true);
  const [inviteSent, setInviteSent]         = useState(false);
  const [inviteError, setInviteError]       = useState('');
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [opponentReady, setOpponentReady]   = useState(false);
  const [showEditor, setShowEditor]     = useState(false);
  const [editorCode, setEditorCode]     = useState('');
  const [scripts, setScripts]           = useState([]);
  const [activeScript, setActiveScript] = useState(null);

  const pyodideRef      = useRef(null);
  const botCodeRef      = useRef('');
  const slotRef         = useRef(null);
  const betweenTimerRef = useRef(null);
  const friendMode = searchParams.get('mode') === 'friend';

  useEffect(() => {
    if (token) loadUserScripts();
    loadPyodide().then(ok => { pyodideRef.current = ok; });
  }, [token]);

  useEffect(() => { slotRef.current = slot; }, [slot]);

  useEffect(() => {
    if (!socket) return;
    socket.on('match_found', (data) => {
      setSlot(data.slot); slotRef.current = data.slot;
      setOpponent(data.opponent); setPhase('found');
      setTimeout(() => setPhase('playing'), 2000);
    });
    socket.on('blink', (data) => {
      setGameState(data); setTimeLeft(data.timeLeft);
      setRoundScores(data.roundScores || { p1:0, p2:0, draws:0 });
      if (slotRef.current && pyodideRef.current && botCodeRef.current)
        runPythonBot(botCodeRef.current, buildBotState(data, slotRef.current))
          .then(action => socket.emit('bot_action', { action }));
    });
    socket.on('round_end', (data) => {
      setRoundResult(data.result); setRoundScores(data.roundScores);
      setPhase('between_rounds'); setOpponentReady(false);
      let t = data.timeoutSecs || 30; setBetweenTime(t);
      clearInterval(betweenTimerRef.current);
      betweenTimerRef.current = setInterval(() => { t--; setBetweenTime(t); if(t<=0) clearInterval(betweenTimerRef.current); }, 1000);
    });
    socket.on('round_start',          ()     => { setPhase('playing'); setRoundResult(null); setOpponentReady(false); clearInterval(betweenTimerRef.current); });
    socket.on('match_end',            (data) => { setMatchResult(data); setPhase('finished'); clearInterval(betweenTimerRef.current); });
    socket.on('opponent_disconnected',(data) => { setMatchResult({ winner: data.winner, disconnected: true }); setPhase('finished'); });
    socket.on('opponent_ready',       ()     => setOpponentReady(true));
    socket.on('waiting_for_opponent', ()     => setOpponentReady(false));
    socket.on('invite_sent',          ()     => setInviteSent(true));
    socket.on('invite_error',   (data) => { setInviteSent(false); setInviteError(data.error||'Invite failed'); });
    socket.on('invite_declined',(data) => { setInviteSent(false); setInviteError(`${data.by} declined`); });
    socket.on('match_invite',   (data) => setIncomingInvite(data));
    return () => {
      ['match_found','blink','round_end','round_start','match_end','opponent_disconnected',
       'opponent_ready','waiting_for_opponent','invite_sent','invite_error','invite_declined','match_invite']
        .forEach(e => socket.off(e));
    };
  }, [socket]);

  async function loadUserScripts() {
    try {
      const res = await axios.get(`${API}/api/scripts`, { headers: { Authorization: `Bearer ${token}` } });
      setScripts(res.data.scripts);
      if (res.data.scripts.length > 0) {
        const s = res.data.scripts[0];
        const full = await axios.get(`${API}/api/scripts/${s.id}`, { headers: { Authorization: `Bearer ${token}` } });
        const script = full.data.script;
        setActiveScript(script); setEditorCode(script.code); botCodeRef.current = script.code;
      }
    } catch (err) { console.error('loadUserScripts:', err); }
  }

  async function selectScript(script) {
    try {
      const full = await axios.get(`${API}/api/scripts/${script.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const s = full.data.script;
      setActiveScript(s); setEditorCode(s.code); botCodeRef.current = s.code;
      if (socket && (phase==='playing'||phase==='between_rounds')) socket.emit('update_script', { script: s.code });
    } catch (err) { console.error('selectScript:', err); }
  }

  function joinQueue() { if(!socket) return; setPhase('queuing'); socket.emit('join_queue', { script: botCodeRef.current, scriptName: activeScript?.name||'unknown', rated: true }); }
  function leaveQueue() { if(!socket) return; socket.emit('leave_queue'); setPhase('menu'); }
  function sendInvite() { if(!friendUsername.trim()||!socket) return; setInviteError(''); socket.emit('invite_friend', { username: friendUsername.trim(), rated: friendRated }); setInviteSent(true); }
  function handleCodeChange(newCode) { setEditorCode(newCode); botCodeRef.current = newCode||''; if(socket&&phase==='playing') socket.emit('update_script', { script: newCode }); }
  function buildBotState(blinkData, mySlot) {
    return { self: blinkData.self, sonar_results: blinkData.sonarResults||[],
      my_mines: (blinkData.mines||[]).filter(m=>m.owner===mySlot).map(m=>({id:m.id,x:m.x,y:m.y,z:m.z,target_depth:m.targetDepth,settled:m.settled})),
      hit_log: blinkData.hitLog||[], round: blinkData.round, blink: blinkData.blink, time_left: blinkData.timeLeft };
  }

  const isPlaying = phase==='playing'||phase==='between_rounds';

  return (
    <div style={S.root}>
      {!isPlaying&&(
        <div style={S.topBar}>
          <button className="btn btn-ghost" style={{fontSize:'12px',padding:'6px 14px'}} onClick={()=>navigate('/menu')}>← Menu</button>
          <div style={S.matchInfo}>{opponent&&<span style={S.vsText}><span style={{color:'var(--teal)'}}>{user?.username}</span><span style={{color:'var(--text-muted)',margin:'0 12px'}}>vs</span><span style={{color:'var(--orange)'}}>{opponent.username}</span></span>}</div>
          <div style={S.topRight}>{opponent&&<span style={S.scoreText}>{roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}</span>}</div>
        </div>
      )}

      <div style={S.main}>
        {phase==='menu'&&(
          <div style={S.centerPanel}>
            <h2 style={S.panelTitle}>{friendMode?'Play with a Friend':'Ready to Fight?'}</h2>
            {friendMode&&(
              <div style={{width:'100%',maxWidth:'400px',marginBottom:'24px'}}>
                {!inviteSent?(<>
                  <p style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'12px'}}>Enter your friend's username.</p>
                  <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
                    <input placeholder="friend_username" value={friendUsername} onChange={e=>setFriendUsername(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendInvite()} style={{flex:1}}/>
                    <button className="btn btn-teal" onClick={sendInvite}>Send</button>
                  </div>
                  <label style={{fontSize:'12px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'6px'}}><input type="checkbox" checked={friendRated} onChange={e=>setFriendRated(e.target.checked)}/> Rated match</label>
                  {inviteError&&<p className="error-msg">{inviteError}</p>}
                </>):(
                  <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'8px',padding:'16px',textAlign:'center'}}>
                    <p style={{color:'var(--text-secondary)',marginBottom:'8px'}}>Invite sent to <span style={{color:'var(--teal)'}}>{friendUsername}</span></p>
                    <p style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'12px'}}>Waiting...</p>
                    <button className="btn btn-ghost" style={{fontSize:'12px'}} onClick={()=>{setInviteSent(false);setFriendUsername('');}}>Cancel</button>
                  </div>
                )}
              </div>
            )}
            <div style={S.scriptSelect}>
              <p style={S.label}>Active bot script:</p>
              {scripts.length===0?(
                <p style={S.muted}>No scripts saved. <button className="btn btn-ghost" style={{fontSize:'12px',padding:'4px 10px'}} onClick={()=>navigate('/editor')}>Go to Editor</button></p>
              ):(
                <div style={S.scriptList}>
                  {scripts.map(s=>(
                    <button key={s.id} onClick={()=>selectScript(s)} style={{...S.scriptBtn,borderColor:activeScript?.id===s.id?'var(--teal)':'var(--border)',color:activeScript?.id===s.id?'var(--teal)':'var(--text-secondary)'}}>
                      {s.name}<span style={S.scriptLang}>{s.language?.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!friendMode&&(<>
              <button className="btn btn-teal" style={{fontSize:'16px',padding:'14px 48px',marginTop:'24px'}} onClick={joinQueue} disabled={!activeScript}>Find Match</button>
              {!activeScript&&<p style={{...S.muted,marginTop:'12px'}}>Save a script in the Editor first</p>}
            </>)}
          </div>
        )}

        {phase==='queuing'&&(
          <div style={S.centerPanel}>
            <div style={S.searching}>
              <div style={S.pulse}/>
              <h2 style={S.panelTitle}>Searching for opponent...</h2>
              <p style={S.muted}>Using: {activeScript?.name}</p>
              <button className="btn btn-ghost" style={{marginTop:'24px'}} onClick={leaveQueue}>Cancel</button>
            </div>
          </div>
        )}

        {phase==='found'&&(
          <div style={S.centerPanel}>
            <h2 style={{color:'var(--teal)',fontSize:'24px'}}>Match Found!</h2>
            <p style={S.muted}>vs <span style={{color:'var(--orange)'}}>{opponent?.username}</span> (ELO {opponent?.elo})</p>
            <p style={{...S.muted,marginTop:'12px'}}>Preparing battle stations...</p>
          </div>
        )}

        {isPlaying&&(
          <div style={{flex:1,position:'relative',overflow:'hidden'}}>
            {phase==='between_rounds'&&(
              <div style={S.betweenOverlay}>
                <div style={S.betweenCard}>
                  <h3 style={{fontSize:'18px',marginBottom:'8px'}}>{roundResult?.winner===slot?'✅ Round Won':roundResult?.winner===null?'🤝 Round Draw':'❌ Round Lost'}</h3>
                  <p style={{color:'var(--text-muted)',marginBottom:'12px'}}>Score: {roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}</p>
                  {scripts.length>0&&(
                    <div style={{marginBottom:'16px',textAlign:'left'}}>
                      <p style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'6px'}}>Change script:</p>
                      <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                        {scripts.map(s=>(
                          <button key={s.id} onClick={()=>selectScript(s)} style={{background:activeScript?.id===s.id?'rgba(29,158,117,0.15)':'var(--bg-tertiary)',border:`1px solid ${activeScript?.id===s.id?'var(--teal)':'var(--border)'}`,color:activeScript?.id===s.id?'var(--teal)':'var(--text-secondary)',padding:'6px 12px',borderRadius:'4px',fontFamily:'JetBrains Mono, monospace',fontSize:'12px',cursor:'pointer',textAlign:'left'}}>
                            {s.name}<span style={{fontSize:'10px',opacity:0.6,marginLeft:'6px'}}>{s.language?.toUpperCase()}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p style={{color:'var(--text-muted)',fontSize:'12px',marginBottom:'12px'}}>Next round in <span style={{color:'var(--teal)',fontWeight:'bold'}}>{betweenTime}s</span> — or press Ready</p>
                  {opponentReady&&<p style={{fontSize:'11px',color:'var(--teal)',marginBottom:'8px'}}>✓ Opponent is ready</p>}
                  <button className="btn btn-teal" style={{width:'100%'}} onClick={()=>socket?.emit('player_ready',{})}>✓ Ready — Start Next Round</button>
                </div>
              </div>
            )}
            <Cockpit gameState={gameState} slot={slot} onEditCode={()=>setShowEditor(v=>!v)}/>
            {showEditor&&(
              <div style={S.editorPanel}>
                <div style={S.editorPanelTop}>
                  <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>{activeScript?.name||'unsaved'} — applies next blink</span>
                  <button onClick={()=>setShowEditor(false)} style={S.closeBtn}>✕</button>
                </div>
                <MonacoEditor height="100%" language={activeScript?.language==='c'?'c':'python'} theme="vs-dark" value={editorCode} onChange={handleCodeChange}
                  options={{fontSize:13,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},lineNumbers:'on',wordWrap:'on',tabSize:4}}/>
              </div>
            )}
          </div>
        )}

        {phase==='finished'&&(
          <div style={S.centerPanel}>
            <h2 style={{fontSize:'28px',marginBottom:'12px',color:matchResult?.winner===slot?'var(--teal)':matchResult?.winner===null?'var(--text-secondary)':'var(--orange)'}}>
              {matchResult?.winner===slot?'🏆 Victory':matchResult?.winner===null?'🤝 Draw':'💀 Defeat'}
            </h2>
            {matchResult?.disconnected&&<p style={S.muted}>Opponent disconnected</p>}
            <p style={{color:'var(--text-secondary)',marginBottom:'24px'}}>Final score: {roundScores[slot]??0} — {roundScores[slot==='p1'?'p2':'p1']??0}</p>
            <div style={{display:'flex',gap:'12px'}}>
              <button className="btn btn-teal" onClick={()=>{setPhase('menu');setGameState(null);setOpponent(null);setMatchResult(null);setRoundScores({p1:0,p2:0,draws:0});}}>Play Again</button>
              {matchResult?.matchId&&<button className="btn btn-teal" onClick={()=>navigate(`/replay/${matchResult.matchId}`)}>Watch Replay</button>}
              <button className="btn btn-ghost" onClick={()=>navigate('/menu')}>Main Menu</button>
            </div>
          </div>
        )}
      </div>

      {incomingInvite&&(
        <div style={S.modalOverlay}>
          <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'12px',padding:'32px',textAlign:'center',maxWidth:'340px'}}>
            <h3 style={{fontSize:'16px',marginBottom:'8px'}}>Match Invite</h3>
            <p style={{color:'var(--text-secondary)',marginBottom:'4px'}}><span style={{color:'var(--teal)'}}>{incomingInvite.from}</span> wants to play</p>
            <p style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'24px'}}>{incomingInvite.rated?'Rated match':'Unrated match'}</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{socket?.emit('decline_invite',{from:incomingInvite.from});setIncomingInvite(null);}}>Decline</button>
              <button className="btn btn-teal" style={{flex:1}} onClick={()=>{socket?.emit('accept_invite',{from:incomingInvite.from,rated:incomingInvite.rated});setIncomingInvite(null);}}>Accept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  root:        {height:'100vh',display:'flex',flexDirection:'column',backgroundColor:'var(--bg-primary)',overflow:'hidden'},
  topBar:      {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',borderBottom:'1px solid var(--border)',flexShrink:0},
  matchInfo:   {display:'flex',alignItems:'center',gap:'16px'},
  vsText:      {fontSize:'14px',fontWeight:'500'},
  topRight:    {display:'flex',alignItems:'center',gap:'12px'},
  scoreText:   {fontSize:'18px',fontWeight:'700',color:'var(--text-primary)'},
  main:        {flex:1,display:'flex',overflow:'hidden',position:'relative'},
  centerPanel: {flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px'},
  panelTitle:  {fontSize:'24px',fontWeight:'500',marginBottom:'24px'},
  label:       {fontSize:'12px',color:'var(--text-secondary)',marginBottom:'10px'},
  muted:       {fontSize:'13px',color:'var(--text-muted)'},
  scriptSelect:{width:'100%',maxWidth:'400px'},
  scriptList:  {display:'flex',flexDirection:'column',gap:'8px'},
  scriptBtn:   {background:'var(--bg-secondary)',border:'1px solid',borderRadius:'6px',padding:'10px 14px',fontFamily:'JetBrains Mono, monospace',fontSize:'13px',cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'},
  scriptLang:  {fontSize:'10px',color:'var(--text-muted)'},
  searching:   {display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'},
  pulse:       {width:'48px',height:'48px',borderRadius:'50%',background:'var(--teal)',opacity:0.6,animation:'pulse 1.5s ease-in-out infinite'},
  betweenOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,background:'rgba(10,14,26,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:30},
  betweenCard: {background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'12px',padding:'28px 40px',textAlign:'center',minWidth:'320px'},
  editorPanel: {position:'absolute',top:0,right:0,width:'480px',height:'100%',background:'var(--bg-secondary)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',zIndex:20},
  editorPanelTop:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',borderBottom:'1px solid var(--border)',flexShrink:0},
  closeBtn:    {background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'14px'},
  modalOverlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100},
};
