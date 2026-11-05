/**
 * OpenSideline game-day options; advisory league presets are not substitutes for
 * an organization's published rules. No automatic game-ending decisions.
 */
export const LEAGUE_PRESETS = Object.freeze({
  youth: Object.freeze({ label:'Youth / rec (example)', innings:6, battingMode:'continuous', allowReentry:true }),
  travel: Object.freeze({ label:'Travel ball (example)', innings:7, battingMode:'continuous', allowReentry:true }),
  school: Object.freeze({ label:'School / standard (example)', innings:7, battingMode:'nine', allowReentry:false }),
  adult: Object.freeze({ label:'Standard nine innings', innings:9, battingMode:'nine', allowReentry:false }),
});
export const MODES = Object.freeze(['continuous','nine','custom']);
export function normalizeGameRules(input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input))throw new Error('Game rules must be an object.');
  const preset=input.preset??'travel';
  if(!Object.hasOwn(LEAGUE_PRESETS,preset))throw new Error('Unknown example league preset.');
  const base=LEAGUE_PRESETS[preset];
  const innings=input.innings??base.innings;
  const battingMode=input.battingMode??base.battingMode;
  const allowReentry=input.allowReentry??base.allowReentry;
  if(!Number.isInteger(innings)||innings<1||innings>15)throw new Error('Innings must be between 1 and 15.');
  if(!MODES.includes(battingMode))throw new Error('Choose continuous, nine or custom batting.');
  if(typeof allowReentry!=='boolean')throw new Error('Reentry must be enabled or disabled.');
  return {preset,innings,battingMode,allowReentry};
}
export function validateBattingOrder(order, roster) {
  if(!Array.isArray(order)||order.length<1||order.length>30)throw new Error('Batting order needs 1–30 players.');
  const ids=new Set(roster.map(p=>p.id));
  if(order.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('Every batter must be on the roster.');
  if(new Set(order).size!==order.length)throw new Error('A player cannot occupy two batting slots.');
  return [...order];
}
export function chooseInitialBattingOrder(roster,rules,provided) {
  if(provided!==undefined && provided!==null)return validateBattingOrder(provided,roster);
  const ids=roster.map(p=>p.id);
  return validateBattingOrder(rules.battingMode==='nine'?ids.slice(0,9):ids,roster);
}
