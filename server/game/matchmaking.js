// ─── MATCHMAKING QUEUE ────────────────────────────────────────────────────────
// Players join the queue and get paired by closest ELO.
// After 60 seconds waiting, the acceptable ELO gap widens.

const queue = [];  // array of waiting players

// ─── JOIN QUEUE ───────────────────────────────────────────────────────────────
function joinQueue(player) {
  // Don't add the same player twice
  if (queue.find(p => p.userId === player.userId)) {
    return false;
  }
  queue.push({
    ...player,
    joinedAt: Date.now(),
  });
  return true;
}

// ─── LEAVE QUEUE ─────────────────────────────────────────────────────────────
function leaveQueue(userId) {
  const idx = queue.findIndex(p => p.userId === userId);
  if (idx !== -1) queue.splice(idx, 1);
}

// ─── FIND MATCH ───────────────────────────────────────────────────────────────
// Tries to pair the player with the closest ELO opponent.
// ELO gap widens by 50 every 10 seconds of waiting (max 500).
function findMatch(player) {
  const waitSeconds = (Date.now() - player.joinedAt) / 1000;

  // Gap widens: starts at 100, adds 50 every 10 seconds, max 500
  const eloGap = Math.min(1000, 500 + Math.floor(waitSeconds / 5) * 100);

  let bestMatch = null;
  let bestDiff  = Infinity;

  for (const candidate of queue) {
    if (candidate.userId === player.userId) continue;

    const diff = Math.abs(candidate.elo - player.elo);
    if (diff <= eloGap && diff < bestDiff) {
      bestDiff  = diff;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// ─── RUN MATCHMAKING TICK ────────────────────────────────────────────────────
// Called every 2 seconds. Tries to pair any two players in the queue.
// Returns array of matched pairs: [{ p1, p2 }, ...]
function runMatchmakingTick() {
  const pairs   = [];
  const matched = new Set();

  for (const player of queue) {
    if (matched.has(player.userId)) continue;

    const opponent = findMatch(player);
    if (opponent && !matched.has(opponent.userId)) {
      pairs.push({ p1: player, p2: opponent });
      matched.add(player.userId);
      matched.add(opponent.userId);
    }
  }

  // Remove matched players from queue
  for (const pair of pairs) {
    leaveQueue(pair.p1.userId);
    leaveQueue(pair.p2.userId);
  }

  return pairs;
}

function getQueueLength() {
  return queue.length;
}

module.exports = { joinQueue, leaveQueue, findMatch, runMatchmakingTick, getQueueLength };