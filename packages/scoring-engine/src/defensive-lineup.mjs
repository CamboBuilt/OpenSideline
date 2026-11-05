/**
 * Defensive positions are independent from batting order.
 * Every saved lineup is a full 1–9 snapshot. Empty spots are null, which also
 * makes this work for demos with fewer than nine roster members.
 */
import { FIELDING_POSITIONS } from './fielding.mjs';

const validObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const emptyDefensiveLineup = () => Object.fromEntries(
  Object.keys(FIELDING_POSITIONS).map(position => [position, null])
);

export function validateDefensiveLineup(assignments, roster) {
  if (!validObject(assignments)) throw new Error('Defensive lineup must be an object.');
  const known = new Set(roster.map(player => player.id));
  const normalized = emptyDefensiveLineup();
  const used = new Set();

  for (const position of Object.keys(assignments)) {
    if (!Object.hasOwn(normalized, position)) {
      throw new Error(`Unknown defensive position: ${position}.`);
    }
    const playerId = assignments[position];
    if (playerId === null || playerId === '') continue;
    if (typeof playerId !== 'string' || !known.has(playerId)) {
      throw new Error('Every defensive player must be on that team’s roster.');
    }
    if (used.has(playerId)) throw new Error('A player cannot occupy two defensive positions.');
    used.add(playerId);
    normalized[position] = playerId;
  }
  return normalized;
}
