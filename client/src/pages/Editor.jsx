import { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:4000';

// ─── STARTER SCRIPTS ─────────────────────────────────────────────────────────
const PYTHON_STARTER = `# ============================================================
#  SUBCODE — Beginner Starter Bot (Python)
#  Read every comment. This IS the tutorial.
# ============================================================

def bot(state):
    me       = state["self"]
    my_x     = me["position"]["x"]
    my_y     = me["position"]["y"]
    my_z     = me["position"]["z"]
    my_hp    = me["health"]
    my_torps = me["torpedoes"]
    is_out   = me["out_of_bounds"]
    sonar    = state["sonar_results"]

    # Find enemy on sonar
    enemy = None
    for contact in sonar:
        if contact["type"] == "enemy_sub":
            enemy = contact

    # 1. Steer back if out of bounds (-20 HP/sec out there)
    if is_out:
        dx = 1 if my_x < 0 else (-1 if my_x > 9 else 0)
        dy = 1 if my_y < 0 else (-1 if my_y > 9 else 0)
        return { "action": "move", "dx": dx, "dy": dy, "dz": 0, "speed": "slow" }

    # 2. Fire at enemy if detected
    if enemy and my_torps > 0:
        return { "action": "fire", "target": { "x": enemy["x"], "y": enemy["y"], "z": enemy["z"] } }

    # 3. Move toward center (5,5,5)
    dx = (1 if my_x < 5 else -1) if my_x != 5 else 0
    dy = (1 if my_y < 5 else -1) if my_y != 5 else 0
    dz = (1 if my_z < 5 else -1) if my_z != 5 else 0
    if dx == 0 and dy == 0 and dz == 0:
        return { "action": "idle" }
    return { "action": "move", "dx": dx, "dy": dy, "dz": dz, "speed": "slow" }
`;

const C_STARTER = `/* ============================================================
   SUBCODE — Beginner Starter Bot (C)
   Read every comment. This IS the tutorial.
   ============================================================ */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

double get_num(const char *json, const char *key) {
    char search[64];
    snprintf(search, sizeof(search), "\\"%s\\":", key);
    const char *p = strstr(json, search);
    if (!p) return -999;
    p += strlen(search);
    while (*p == ' ') p++;
    return atof(p);
}

int contains(const char *json, const char *substr) {
    return strstr(json, substr) != NULL;
}

int main() {
    char state[65536];
    if (!fgets(state, sizeof(state), stdin)) {
        printf("{\\"action\\": \\"idle\\"}\\n");
        return 0;
    }

    double my_x     = get_num(state, "x");
    double my_y     = get_num(state, "y");
    double my_z     = get_num(state, "z");
    double my_torps = get_num(state, "torpedoes");
    int    is_out   = contains(state, "\\"out_of_bounds\\": true");
    int    has_enemy = contains(state, "\\"enemy_sub\\"");

    /* 1. Out of bounds — steer back */
    if (is_out) {
        int dx = 0, dy = 0;
        if (my_x < 0) dx = 1;  if (my_x > 9) dx = -1;
        if (my_y < 0) dy = 1;  if (my_y > 9) dy = -1;
        printf("{\\"action\\":\\"move\\",\\"dx\\":%d,\\"dy\\":%d,\\"dz\\":0,\\"speed\\":\\"slow\\"}\\n", dx, dy);
        return 0;
    }

    /* 2. Fire at enemy */
    if (has_enemy && my_torps > 0) {
        const char *ep = strstr(state, "\\"enemy_sub\\"");
        double ex = get_num(ep, "x"), ey = get_num(ep, "y"), ez = get_num(ep, "z");
        if (ex >= 0) {
            printf("{\\"action\\":\\"fire\\",\\"target\\":{\\"x\\":%.0f,\\"y\\":%.0f,\\"z\\":%.0f}}\\n", ex, ey, ez);
            return 0;
        }
    }

    /* 3. Move toward center */
    int dx = 0, dy = 0, dz = 0;
    if (my_x < 5) dx = 1; else if (my_x > 5) dx = -1;
    if (my_y < 5) dy = 1; else if (my_y > 5) dy = -1;
    if (my_z < 5) dz = 1; else if (my_z > 5) dz = -1;
    if (dx == 0 && dy == 0 && dz == 0) { printf("{\\"action\\":\\"idle\\"}\\n"); return 0; }
    printf("{\\"action\\":\\"move\\",\\"dx\\":%d,\\"dy\\":%d,\\"dz\\":%d,\\"speed\\":\\"slow\\"}\\n", dx, dy, dz);
    return 0;
}
`;

// ─── REFERENCE PANEL CONTENT ─────────────────────────────────────────────────
const REFERENCE_SECTIONS = [
  {
    title: 'State Object',
    content: `state["self"]["position"]     # {x, y, z}
state["self"]["health"]        # 0–100
state["self"]["torpedoes"]     # remaining (10/round)
state["self"]["mines"]         # remaining (20/round)
state["self"]["speed"]         # last speed used
state["self"]["noise_radius"]  # 3 / 5 / 7
state["self"]["out_of_bounds"] # True if x<0,x>9,y<0,y>9
state["self"]["powered"]       # False if code crashed
state["sonar_results"]         # list of contacts
state["my_mines"]              # your deployed mines
state["hit_log"]               # damage events
state["round"]                 # 1, 2, or 3
state["blink"]                 # blink number
state["time_left"]             # seconds left (starts 99)`
  },
  {
    title: 'Actions',
    content: `# Move (dx/dy/dz each = -1, 0, or 1)
{"action":"move","dx":1,"dy":0,"dz":-1,"speed":"slow"}

# Fire torpedo at absolute coordinate
{"action":"fire","target":{"x":8,"y":8,"z":8}}

# Deploy mine at current (x,y), sinks to target_depth
{"action":"mine","target_depth":5}

# Do nothing
{"action":"idle"}`
  },
  {
    title: 'Speed & Noise',
    content: `Speed    Units/blink  Enemy detects you from
slow     1            3 units  (silent)
fast     2            5 units
max      3            7 units

Your sonar always detects enemy within 3 units.
Moving fast makes YOU louder, not your sonar better.`
  },
  {
    title: 'Grid & Bounds',
    content: `Grid: 10 x 10 x 10
X: 0 (West)    → 9 (East)
Y: 0 (North)   → 9 (South)
Z: 0 (Surface) → 9 (Seafloor)

P1 starts: (1,1,1)   P2 starts: (8,8,8)

Out of bounds (X or Y): -20 HP/sec (no stacking)
Z is clamped at 0 and 9 — no damage.`
  },
  {
    title: 'Weapons',
    content: `TORPEDOES (10/round)
  • 6 units/blink, straight 3D line
  • Continues past target until hit or grid exit
  • Blast: 3x3x3 cube = 50 HP

MINES (20/round)
  • Deployed at your (x,y)
  • Sinks to target_depth at 1 unit/blink
  • Active immediately
  • Blast: 3x3x3 cube = 50 HP
  • Friendly fire is ON

CHAIN REACTIONS
  • Mine inside blast zone also detonates
  • Chains resolve before next blink`
  },
  {
    title: 'Round Rules',
    content: `Best of 3 rounds. First to 2 wins.

Round ends when:
  • Any sub takes weapon damage (first hit)
  • Two subs occupy same cell (instant draw)
  • 99s timer runs out (higher HP wins)

Between rounds: 60s to edit your code.
Mid-round edits apply on the next blink.

Code crash → sub loses power → forced dz+1
Fix and save to restore power.`
  },
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Editor() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // Editor state
  const [code, setCode]           = useState('');
  const [language, setLanguage]   = useState(user?.language || 'python');
  const [scripts, setScripts]     = useState([]);
  const [currentScript, setCurrentScript] = useState(null);
  const [scriptName, setScriptName]       = useState('');

  // UI state
  const [showSaveAs, setShowSaveAs]     = useState(false);
  const [showReference, setShowReference] = useState(true);
  const [openSection, setOpenSection]   = useState(null);
  const [toast, setToast]               = useState('');
  const [loading, setLoading]           = useState(false);

  const toastTimer = useRef(null);

  // Load scripts on mount
  useEffect(() => {
    loadScripts();
    // Load starter script for user's language by default
    setCode(language === 'python' ? PYTHON_STARTER : C_STARTER);
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  async function loadScripts() {
    try {
      const res = await axios.get(`${API}/api/scripts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScripts(res.data.scripts);
    } catch (err) {
      console.error('Failed to load scripts');
    }
  }

  async function loadScript(script) {
    setCode(script.code);
    setLanguage(script.language);
    setCurrentScript(script);
    setScriptName(script.name);
    showToast(`Loaded: ${script.name}`);
  }

  async function saveScript() {
    if (!currentScript) {
      setShowSaveAs(true);
      return;
    }
    setLoading(true);
    try {
      await axios.put(`${API}/api/scripts/${currentScript.id}`,
        { code, name: scriptName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Script saved');
      loadScripts();
    } catch (err) {
      showToast('Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function saveAsScript() {
    if (!scriptName.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/scripts`,
        { name: scriptName, language, code },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCurrentScript(res.data.script);
      setShowSaveAs(false);
      showToast(`Saved as: ${scriptName}`);
      loadScripts();
    } catch (err) {
      showToast('Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function deleteScript(id, e) {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/api/scripts/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (currentScript?.id === id) {
        setCurrentScript(null);
        setScriptName('');
        setCode(language === 'python' ? PYTHON_STARTER : C_STARTER);
      }
      loadScripts();
      showToast('Script deleted');
    } catch (err) {
      showToast('Delete failed');
    }
  }

  function switchLanguage(lang) {
    setLanguage(lang);
    setCurrentScript(null);
    setScriptName('');
    setCode(lang === 'python' ? PYTHON_STARTER : C_STARTER);
  }

  return (
    <div style={styles.root}>

      {/* ── TOP BAR ── */}
      <div style={styles.topBar}>
        <button className="btn btn-ghost" style={styles.backBtn}
          onClick={() => navigate('/menu')}>
          ← Menu
        </button>

        <div style={styles.topCenter}>
          {/* Language toggle */}
          <div style={styles.langToggle}>
            {['python', 'c'].map(lang => (
              <button key={lang}
                onClick={() => switchLanguage(lang)}
                style={{
                  ...styles.langBtn,
                  background: language === lang ? 'var(--teal)' : 'transparent',
                  color: language === lang ? '#fff' : 'var(--text-secondary)',
                }}>
                {lang === 'python' ? '🐍 Python' : '⚙️ C'}
              </button>
            ))}
          </div>

          {/* Script name */}
          <span style={styles.scriptName}>
            {currentScript ? scriptName : '[ unsaved ]'}
          </span>
        </div>

        <div style={styles.topRight}>
          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setShowSaveAs(true)}>
            Save As
          </button>
          <button className="btn btn-teal" style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={saveScript} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div style={styles.main}>

        {/* ── LEFT: SCRIPT MANAGER ── */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarTitle}>Saved Scripts</div>
          {scripts.length === 0 && (
            <p style={styles.emptyMsg}>No saved scripts yet.<br />Write some code and hit Save.</p>
          )}
          {scripts.map(s => (
            <div key={s.id}
              onClick={() => loadScript(s)}
              style={{
                ...styles.scriptItem,
                background: currentScript?.id === s.id ? 'var(--bg-tertiary)' : 'transparent',
                borderColor: currentScript?.id === s.id ? 'var(--teal)' : 'transparent',
              }}>
              <div>
                <div style={styles.scriptItemName}>{s.name}</div>
                <div style={styles.scriptItemLang}>{s.language.toUpperCase()}</div>
              </div>
              <button
                onClick={(e) => deleteScript(s.id, e)}
                style={styles.deleteBtn}>
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* ── CENTER: MONACO EDITOR ── */}
        <div style={styles.editorWrap}>
          <MonacoEditor
            height="100%"
            language={language === 'python' ? 'python' : 'c'}
            theme="vs-dark"
            value={code}
            onChange={val => setCode(val || '')}
            options={{
              fontSize: 14,
              fontFamily: 'JetBrains Mono, monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              tabSize: 4,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* ── RIGHT: REFERENCE PANEL ── */}
        <div style={{
          ...styles.refPanel,
          width: showReference ? '260px' : '36px',
        }}>
          <button
            onClick={() => setShowReference(!showReference)}
            style={styles.refToggle}
            title={showReference ? 'Hide reference' : 'Show reference'}>
            {showReference ? '▶ REF' : '◀'}
          </button>

          {showReference && (
            <div style={styles.refContent}>
              <div style={styles.refTitle}>Quick Reference</div>
              {REFERENCE_SECTIONS.map((sec, i) => (
                <div key={i}>
                  <button
                    onClick={() => setOpenSection(openSection === i ? null : i)}
                    style={styles.refSectionBtn}>
                    {openSection === i ? '▼' : '▶'} {sec.title}
                  </button>
                  {openSection === i && (
                    <pre style={styles.refCode}>{sec.content}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SAVE AS MODAL ── */}
      {showSaveAs && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal} className="card">
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Save Script As</h3>
            <input
              placeholder="Script name..."
              value={scriptName}
              onChange={e => setScriptName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveAsScript()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }}
                onClick={() => setShowSaveAs(false)}>
                Cancel
              </button>
              <button className="btn btn-teal" style={{ flex: 1 }}
                onClick={saveAsScript} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}
    </div>
  );
}

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
    gap: '12px',
    flexShrink: 0,
  },
  backBtn: {
    fontSize: '12px',
    padding: '6px 14px',
  },
  topCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: 1,
    justifyContent: 'center',
  },
  langToggle: {
    display: 'flex',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  langBtn: {
    padding: '5px 14px',
    border: 'none',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  scriptName: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  topRight: {
    display: 'flex',
    gap: '8px',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '200px',
    borderRight: '1px solid var(--border)',
    padding: '12px 8px',
    overflowY: 'auto',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '0 8px 10px',
  },
  emptyMsg: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    padding: '8px',
    lineHeight: '1.6',
  },
  scriptItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid',
    marginBottom: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  scriptItemName: {
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  scriptItemLang: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
    borderRadius: '4px',
  },
  editorWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  refPanel: {
    borderLeft: '1px solid var(--border)',
    transition: 'width 0.2s',
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  refToggle: {
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    color: 'var(--teal)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
    padding: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  refContent: {
    overflowY: 'auto',
    flex: 1,
    padding: '8px',
  },
  refTitle: {
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '4px 0 10px',
  },
  refSectionBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '5px 0',
    width: '100%',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  },
  refCode: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    padding: '8px 0',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.6',
    overflowX: 'auto',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: '320px',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '10px 24px',
    borderRadius: '6px',
    fontSize: '13px',
    zIndex: 200,
  },
};