/**
 * Optional fielding annotations for batted-ball plays. They describe the ball's
 * approximate location and the fielders involved, without guessing putouts,
 * assists, or making assumptions about batting-order vs defensive positions.
 *
 * Each annotation is a separate event, so undo/replay remain deterministic.
 */
export const FIELDING_POSITIONS = Object.freeze({
  1:'Pitcher', 2:'Catcher', 3:'First base', 4:'Second base',
  5:'Third base', 6:'Shortstop', 7:'Left field',
  8:'Center field', 9:'Right field',
});
export const HIT_LOCATIONS = Object.freeze({
  C:'Behind home plate', P:'Pitcher / middle', '1B':'First-base side',
  '2B':'Second-base side', SS:'Shortstop area', '3B':'Third-base side',
  LF:'Left field', LCF:'Left-center field', CF:'Center field',
  RCF:'Right-center field', RF:'Right field',
});
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
const object = v => v!==null && typeof v==='object' && !Array.isArray(v);

export function validateFieldingAnnotation(fielding, roster) {
  assert(object(fielding), 'Fielding details must be an object.');
  const location = fielding.location ?? null;
  assert(location===null || Object.hasOwn(HIT_LOCATIONS,location),
    'Choose a recognized ball location.');
  const sequence = fielding.sequence ?? [];
  assert(Array.isArray(sequence) && sequence.length<=8,
    'Choose at most eight fielders in the play.');
  const players = new Set(roster.map(p=>p.id));
  const validated=sequence.map((step,i)=>{
    assert(object(step) && Number.isInteger(step.position) && step.position>=1 && step.position<=9,
      `Fielder ${i+1} needs a defensive position from 1 to 9.`);
    const playerId = step.playerId ?? null;
    assert(playerId===null || (typeof playerId==='string' && players.has(playerId)),
      `Fielder ${i+1} must belong to the defensive team's roster.`);
    return {position:step.position,playerId};
  });
  assert(location!==null || validated.length>0,
    'Choose at least a ball location or a defensive fielder.');
  return {location,sequence:validated};
}

export function describeFielding(fielding, roster) {
  const location = fielding.location ? `to ${HIT_LOCATIONS[fielding.location]}` : '';
  const codes = fielding.sequence.map(step=>step.position).join('–');
  const players = fielding.sequence
    .filter(step=>step.playerId)
    .map(step=>{
      const player=roster.find(p=>p.id===step.playerId);
      return `${step.position} ${player ? player.name : '(unknown)'}`;
    });
  const parts=[location];
  if(codes)parts.push(`fielded ${codes}`);
  if(players.length)parts.push(players.join(' → '));
  return parts.filter(Boolean).join(' · ');
}
