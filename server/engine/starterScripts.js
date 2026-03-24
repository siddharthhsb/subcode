// ─── PYTHON STARTER SCRIPT ───────────────────────────────────────────────────
const PYTHON_STARTER = `# ============================================================
#  SUBCODE — Beginner Starter Bot (Python)
#  Read every comment. This IS the tutorial.
# ============================================================
#
#  Your bot is a function called every 2 seconds (one "blink").
#  Each blink you receive the full game state and must return
#  exactly ONE action. That's it. That's the whole game.
#
# ============================================================

def bot(state):

    # ── WHO AM I? ────────────────────────────────────────────
    me = state["self"]

    my_x   = me["position"]["x"]   # 0 (West)  to 9 (East)
    my_y   = me["position"]["y"]   # 0 (North) to 9 (South)
    my_z   = me["position"]["z"]   # 0 (Surface) to 9 (Seafloor)

    my_hp         = me["health"]       # 0–100. You start at 100.
    my_torpedoes  = me["torpedoes"]    # Starts at 10 per round
    my_mines      = me["mines"]        # Starts at 20 per round
    is_out        = me["out_of_bounds"]# True if x<0,x>9,y<0,y>9
    is_powered    = me["powered"]      # False if your code crashed last blink

    # ── WHAT CAN I SEE? ──────────────────────────────────────
    # sonar_results contains enemies and mines within 3 units of you.
    # Detection radius is always 3 units for YOU finding the enemy.
    # But if YOU move fast, the enemy can detect you from further away:
    #   slow/idle  → enemy detects you from 3 units
    #   fast       → enemy detects you from 5 units
    #   max        → enemy detects you from 7 units
    sonar = state["sonar_results"]

    enemy = None
    for contact in sonar:
        if contact["type"] == "enemy_sub":
            enemy = contact  # enemy has .x .y .z

    # ── ROUND INFO ───────────────────────────────────────────
    round_num  = state["round"]      # 1, 2, or 3
    blink_num  = state["blink"]      # blink count this round
    time_left  = state["time_left"]  # seconds remaining (starts 60)

    # ── MY DEPLOYED MINES ────────────────────────────────────
    my_mines_deployed = state["my_mines"]
    # Each mine: { id, x, y, z, target_depth, settled }

    # ── HIT LOG ──────────────────────────────────────────────
    hit_log = state["hit_log"]
    # Each entry: { blink, type: "received"/"dealt", source, damage }

    # ============================================================
    #  ACTIONS — return exactly one of these every blink
    # ============================================================
    #
    #  MOVE:  { "action": "move", "dx": ?, "dy": ?, "dz": ?, "speed": ? }
    #    dx, dy, dz each = -1, 0, or +1  (not all zero)
    #    speed = "slow" (1 unit, silent)
    #           "fast"  (2 units, louder — detectable from 5 units)
    #           "max"   (3 units, loud  — detectable from 7 units)
    #
    #  FIRE:  { "action": "fire", "target": { "x": ?, "y": ?, "z": ? } }
    #    Fires a torpedo toward the target at 6 units/blink.
    #    Does NOT stop at target — keeps going until it hits or exits.
    #    Blast = 3x3x3 cube = 50 HP damage.
    #
    #  MINE:  { "action": "mine", "target_depth": ? }
    #    Deploys a mine at your current (x, y).
    #    Mine sinks/floats to target_depth at 1 unit/blink.
    #    Active IMMEDIATELY. Blast = 3x3x3 cube = 50 HP damage.
    #    WARNING: Friendly fire is ON. Your own mines can kill you.
    #
    #  IDLE:  { "action": "idle" }
    #    Do nothing this blink. Stays silent (noise radius = 3).
    #
    # ============================================================

    # ── STARTER LOGIC ────────────────────────────────────────
    # This is a simple example bot. It does three things:
    #   1. Steers back into bounds if out of bounds
    #   2. Fires at the enemy if detected on sonar
    #   3. Otherwise moves toward the center of the map

    # 1. OUT OF BOUNDS CHECK — steer back immediately
    #    Out of bounds costs -20 HP per second. Don't stay there.
    if is_out:
        dx = 0
        dy = 0
        if my_x < 0: dx = 1   # too far West, go East
        if my_x > 9: dx = -1  # too far East, go West
        if my_y < 0: dy = 1   # too far North, go South
        if my_y > 9: dy = -1  # too far South, go North
        return { "action": "move", "dx": dx, "dy": dy, "dz": 0, "speed": "slow" }

    # 2. ENEMY SPOTTED — fire a torpedo
    if enemy is not None and my_torpedoes > 0:
        return {
            "action": "fire",
            "target": { "x": enemy["x"], "y": enemy["y"], "z": enemy["z"] }
        }

    # 3. DEFAULT — move toward center (5, 5, 5) slowly
    dx = 0
    dy = 0
    dz = 0
    if my_x < 5: dx = 1
    elif my_x > 5: dx = -1
    if my_y < 5: dy = 1
    elif my_y > 5: dy = -1
    if my_z < 5: dz = 1
    elif my_z > 5: dz = -1

    # If already at center, idle
    if dx == 0 and dy == 0 and dz == 0:
        return { "action": "idle" }

    return { "action": "move", "dx": dx, "dy": dy, "dz": dz, "speed": "slow" }
`;

// ─── C STARTER SCRIPT ────────────────────────────────────────────────────────
const C_STARTER = `/* ============================================================
   SUBCODE — Beginner Starter Bot (C)
   Read every comment. This IS the tutorial.
   ============================================================

   Your bot is a function called every 2 seconds (one "blink").
   Each blink you receive the full game state as a JSON string
   via stdin and must print exactly ONE action JSON to stdout.

   ============================================================ */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* The engine calls your bot like this every blink:
   - Writes the full state JSON to your process stdin
   - Reads your action JSON from your process stdout
   - Kills your process after 50ms if you don't respond

   You don't need to parse the full JSON manually.
   We provide simple helper macros below to extract values.
   For a real bot you may want a proper JSON library.        */

/* ── SIMPLE JSON HELPERS ─────────────────────────────────────
   These are basic string-search helpers.
   They work for this starter bot but are not production-grade.
   Feel free to replace with cJSON or any JSON library.      */

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

/* ── MAIN ────────────────────────────────────────────────────
   Read state from stdin, decide action, print to stdout.    */

int main() {
    /* Read the full state JSON from stdin */
    char state[65536];
    if (!fgets(state, sizeof(state), stdin)) {
        /* If we can't read state, idle safely */
        printf("{\\"action\\": \\"idle\\"}\\n");
        return 0;
    }

    /* ── WHO AM I? ──────────────────────────────────────────
       Extract my position and status from the state JSON.   */
    double my_x        = get_num(state, "x");
    double my_y        = get_num(state, "y");
    double my_z        = get_num(state, "z");
    double my_hp       = get_num(state, "health");
    double my_torps    = get_num(state, "torpedoes");
    double time_left   = get_num(state, "time_left");
    int    is_out      = contains(state, "\\"out_of_bounds\\": true");
    int    has_enemy   = contains(state, "\\"enemy_sub\\"");

    /* ── WHAT CAN I SEE? ────────────────────────────────────
       sonar_results contains enemies and mines within 3 units.
       Detection radius for you finding enemy = always 3 units.
       If YOU move fast, enemy can detect you from further:
         slow/idle → enemy detects you from 3 units
         fast      → enemy detects you from 5 units
         max       → enemy detects you from 7 units           */

    /* ── ACTIONS — print exactly one of these ───────────────

       MOVE:
         {"action":"move","dx":?,"dy":?,"dz":?,"speed":"slow"}
         dx,dy,dz each = -1, 0, or 1  (not all zero)
         speed: "slow" (1 unit, silent)
                "fast"  (2 units, louder)
                "max"   (3 units, loud)

       FIRE:
         {"action":"fire","target":{"x":?,"y":?,"z":?}}
         Fires torpedo at 6 units/blink. Keeps going past target.
         Blast = 3x3x3 cube = 50 HP damage.

       MINE:
         {"action":"mine","target_depth":?}
         Deploys mine at your (x,y). Sinks to target_depth.
         Active immediately. Blast = 3x3x3 cube = 50 HP.
         WARNING: Friendly fire is ON.

       IDLE:
         {"action":"idle"}
         Do nothing this blink.                               */

    /* ── STARTER LOGIC ──────────────────────────────────────
       1. Steer back if out of bounds (-20 HP/sec out there)
       2. Fire at enemy if detected on sonar
       3. Move toward center (5,5,5)                         */

    /* 1. OUT OF BOUNDS — steer back immediately */
    if (is_out) {
        int dx = 0, dy = 0;
        if (my_x < 0) dx = 1;
        if (my_x > 9) dx = -1;
        if (my_y < 0) dy = 1;
        if (my_y > 9) dy = -1;
        printf("{\\"action\\":\\"move\\",\\"dx\\":%d,\\"dy\\":%d,\\"dz\\":0,\\"speed\\":\\"slow\\"}\\n",
               dx, dy);
        return 0;
    }

    /* 2. ENEMY SPOTTED — fire torpedo */
    if (has_enemy && my_torps > 0) {
        /* Extract enemy position — simplified: finds first x after enemy_sub */
        const char *ep = strstr(state, "\\"enemy_sub\\"");
        double ex = -1, ey = -1, ez = -1;
        if (ep) {
            ex = get_num(ep, "x");
            ey = get_num(ep, "y");
            ez = get_num(ep, "z");
        }
        if (ex >= 0) {
            printf("{\\"action\\":\\"fire\\",\\"target\\":{\\"x\\":%.0f,\\"y\\":%.0f,\\"z\\":%.0f}}\\n",
                   ex, ey, ez);
            return 0;
        }
    }

    /* 3. MOVE TOWARD CENTER (5, 5, 5) */
    int dx = 0, dy = 0, dz = 0;
    if (my_x < 5) dx = 1;
    else if (my_x > 5) dx = -1;
    if (my_y < 5) dy = 1;
    else if (my_y > 5) dy = -1;
    if (my_z < 5) dz = 1;
    else if (my_z > 5) dz = -1;

    /* Already at center — idle */
    if (dx == 0 && dy == 0 && dz == 0) {
        printf("{\\"action\\":\\"idle\\"}\\n");
        return 0;
    }

    printf("{\\"action\\":\\"move\\",\\"dx\\":%d,\\"dy\\":%d,\\"dz\\":%d,\\"speed\\":\\"slow\\"}\\n",
           dx, dy, dz);
    return 0;
}
`;

module.exports = { PYTHON_STARTER, C_STARTER };
