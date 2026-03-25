// ─── PYTHON SANDBOX ───────────────────────────────────────────────────────────
// Loads Pyodide (Python in WebAssembly) and runs player bot code safely.
// Called once per blink with the current game state.
// Returns an action object or { action: 'idle' } on any error.

let pyodide = null;
let pyodideLoading = false;
let pyodideReady = false;

// ─── LOAD PYODIDE ────────────────────────────────────────────────────────────
// Call this once when the match starts. Pyodide is ~7MB so we load it early.
export async function loadPyodide() {
  if (pyodideReady) return true;
  if (pyodideLoading) {
    // Already loading — wait for it
    while (pyodideLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return pyodideReady;
  }

  pyodideLoading = true;
  try {
    // Load Pyodide from CDN
    if (!window.loadPyodide) {
      await loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
    }
    pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
    });
    pyodideReady = true;
    console.log('Pyodide loaded — Python sandbox ready');
    return true;
  } catch (err) {
    console.error('Failed to load Pyodide:', err);
    return false;
  } finally {
    pyodideLoading = false;
  }
}

// ─── RUN BOT ─────────────────────────────────────────────────────────────────
// Runs the player's bot function with the given state.
// Returns { action } on success, { action: 'idle' } + error info on failure.
export async function runPythonBot(code, state) {
  if (!pyodideReady || !pyodide) {
    return { action: 'idle', error: 'Pyodide not loaded' };
  }

  try {
    // Wrap the player's code + a call to bot(state)
    // We pass state as a JSON string and parse it inside Python
    const stateJson = JSON.stringify(state);

    const wrappedCode = `
import json
import traceback

_state = json.loads('''${escapeForPython(stateJson)}''')

${code}

try:
    _result = bot(_state)
    if isinstance(_result, dict):
        _output = json.dumps(_result)
    else:
        _output = '{"action":"idle","error":"bot() must return a dict"}'
except Exception as e:
    _tb = traceback.format_exc()
    _output = json.dumps({"action": "idle", "error": str(e), "traceback": _tb})
`;

    // Run with a 50ms timeout using Promise.race
    const result = await Promise.race([
      runPyodide(wrappedCode),
      timeout(50, { action: 'idle', error: 'Execution timeout (50ms)' }),
    ]);

    return result;

  } catch (err) {
    return {
      action: 'idle',
      error:  err.message || 'Unknown error',
    };
  }
}

// ─── VALIDATE AND COMPILE BOT CODE ───────────────────────────────────────────
// Checks if the code has a valid bot() function and no syntax errors.
// Returns { valid: true } or { valid: false, error, line }
export async function validatePythonCode(code) {
  if (!pyodideReady || !pyodide) {
    return { valid: false, error: 'Pyodide not loaded' };
  }

  try {
    const checkCode = `
import ast, json
try:
    tree = ast.parse('''${escapeForPython(code)}''')
    has_bot = any(
        isinstance(node, ast.FunctionDef) and node.name == 'bot'
        for node in ast.walk(tree)
    )
    if not has_bot:
        result = json.dumps({"valid": False, "error": "No bot() function found", "line": 1})
    else:
        result = json.dumps({"valid": True})
except SyntaxError as e:
    result = json.dumps({"valid": False, "error": str(e.msg), "line": e.lineno})
`;
    const resultStr = await runPyodide(checkCode, 'result');
    return JSON.parse(resultStr);
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function runPyodide(code, outputVar = '_output') {
  await pyodide.runPythonAsync(code);
  const raw = pyodide.globals.get(outputVar);
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return { action: 'idle' };
}

function timeout(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Escape single quotes in JSON so it can be safely embedded in Python triple-quoted string
function escapeForPython(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}