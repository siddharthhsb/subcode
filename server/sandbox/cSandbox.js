const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const DOCKER_IMAGE  = 'subcode-c-sandbox';
const COMPILE_TIMEOUT = 10000;  // 10 seconds to compile
const RUN_TIMEOUT     = 50;     // 50ms to run each blink

// ─── BUILD THE DOCKER IMAGE ───────────────────────────────────────────────────
// Call this once when the server starts.
// Builds the sandbox Docker image from our Dockerfile.
async function buildSandboxImage() {
  try {
    const dockerfilePath = path.join(__dirname);
    execSync(`docker build -t ${DOCKER_IMAGE} "${dockerfilePath}"`, {
      timeout: 60000,
      stdio: 'pipe',
    });
    console.log('C sandbox Docker image built successfully');
    return true;
  } catch (err) {
    console.error('Failed to build C sandbox image:', err.message);
    return false;
  }
}

// ─── COMPILE C CODE ───────────────────────────────────────────────────────────
// Compiles submitted C code inside Docker.
// Returns { success: true, binaryPath } or { success: false, errors }
async function compileCCode(code, userId) {
  // Create a temp directory for this compilation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `subcode-${userId}-`));
  const srcPath = path.join(tmpDir, 'bot.c');
  const binPath = path.join(tmpDir, 'bot');

  try {
    // Write the C code to a temp file
    fs.writeFileSync(srcPath, code);

    // Run gcc inside Docker to compile it
    // --rm        = remove container after it exits
    // -v          = mount the temp dir so Docker can read/write it
    // --network=none = no internet access
    // --memory=64m   = max 64MB RAM
    // --cpus=0.5     = max half a CPU core
    const compileCmd = [
      'docker', 'run', '--rm',
      '--network=none',
      '--memory=64m',
      '--cpus=0.5',
      '-v', `${tmpDir}:/sandbox`,
      DOCKER_IMAGE,
      'gcc', '-O2', '-o', '/sandbox/bot', '/sandbox/bot.c',
      '-lm',  // link math library
    ];

    await runCommand(compileCmd, COMPILE_TIMEOUT);

    return { success: true, binaryPath: binPath, tmpDir };

  } catch (err) {
    // Clean up temp directory
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

    // Parse gcc error output into structured errors
    const errors = parseGccErrors(err.stderr || err.message || '');
    return { success: false, errors };
  }
}

// ─── RUN C BOT FOR ONE BLINK ─────────────────────────────────────────────────
// Runs the compiled binary with the game state piped to stdin.
// Returns the action JSON from stdout, or { action: 'idle' } on any failure.
async function runCBot(binaryPath, state) {
  const stateJson = JSON.stringify(state);

  return new Promise((resolve) => {
    let output = '';
    let errOutput = '';
    let resolved = false;

    const done = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    try {
      // Run the compiled binary inside Docker
      // Read-only filesystem, no network, strict resource limits
      const proc = spawn('docker', [
        'run', '--rm',
        '--network=none',
        '--memory=32m',
        '--cpus=0.25',
        '--read-only',
        '-i',  // interactive (we pipe stdin)
        '-v', `${path.dirname(binaryPath)}:/sandbox:ro`,  // read-only mount
        DOCKER_IMAGE,
        '/sandbox/bot',
      ]);

      // Send game state to the bot via stdin
      proc.stdin.write(stateJson + '\n');
      proc.stdin.end();

      // Collect stdout (the bot's action)
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errOutput += data.toString(); });

      // Kill after 50ms timeout
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        done({ action: 'idle', error: 'Timeout (50ms)' });
      }, RUN_TIMEOUT);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (output.trim()) {
          try {
            const action = JSON.parse(output.trim());
            done(action);
          } catch (e) {
            done({ action: 'idle', error: 'Invalid JSON output' });
          }
        } else {
          done({ action: 'idle', error: errOutput || 'No output' });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        done({ action: 'idle', error: err.message });
      });

    } catch (err) {
      done({ action: 'idle', error: err.message });
    }
  });
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────
// Call this when a match ends to clean up temp files.
function cleanupBinary(tmpDir) {
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
  } catch (e) {}
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function runCommand(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1));
    let stdout = '', stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Compile timeout'));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`gcc exited with code ${code}`);
        err.stderr = stderr;
        reject(err);
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      err.stderr = stderr;
      reject(err);
    });
  });
}

// Parse gcc error output into { line, message } objects
function parseGccErrors(raw) {
  const errors = [];
  const lines  = raw.split('\n');
  for (const line of lines) {
    // gcc error format: filename:linenum:colnum: error: message
    const match = line.match(/:(\d+):\d+:\s+(error|warning):\s+(.+)/);
    if (match) {
      errors.push({
        line:    parseInt(match[1]),
        type:    match[2],
        message: match[3],
      });
    }
  }
  return errors.length > 0 ? errors : [{ line: 1, message: raw }];
}

module.exports = { buildSandboxImage, compileCCode, runCBot, cleanupBinary };