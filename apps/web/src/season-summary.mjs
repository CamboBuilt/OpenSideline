/**
 * Local-only season rollups from exported/current OpenSideline games.
 * Never uploads youth player data or merges players merely by batting slot.
 */
import { replayGame } from '../../../packages/scoring-engine/src/index.mjs';
const fields=['PA','AB','H','R','RBI','BB','SO','HBP','doubles','triples','HR','SF','SB','CS','PO','A','E','DP'];
const totals=()=>Object.fromEntries(fields.map(key=>[key,0]));
export function summarizeSeason(games) {
  if(!Array.isArray(games)||games.length>50)throw new Error('Season archive supports up to 50 games.');
  const grouped=new Map();let completeGames=0;
  for(const game of games){
    if(!game?.events?.length)continue;
    const view=replayGame(game);
    completeGames++;
    for(const side of ['home','away']){
      const team=game.teams[side];
      for(const player of team.roster){
        const key=[team.name.trim().toLowerCase(),player.number,player.name.trim().toLowerCase()].join('|');
        if(!grouped.has(key))grouped.set(key,{team:team.name,number:player.number,name:player.name,games:0,totals:totals()});
        const entry=grouped.get(key);
        entry.games++;
        for(const stat of fields){
          const source=['PO','A','E','DP'].includes(stat)?view.fieldingStats[side][player.id]:view.playerStats[side][player.id];
          entry.totals[stat]+=source?.[stat]??0;
        }
      }
    }
  }
  return {games:completeGames,players:[...grouped.values()].sort((a,b)=>
    a.team.localeCompare(b.team)||a.name.localeCompare(b.name))};
}
export function seasonCsv(summary) {
  const header=['Team','Number','Name','Games',...fields];
  const quote=value=>{
    const str=String(value??'');
    return /[",\\r\\n]/.test(str)?'"'+str.replaceAll('"','""')+'"':str;
  };
  const rows=summary.players.map(p=>[p.team,p.number,p.name,p.games,...fields.map(k=>p.totals[k])].map(quote).join(','));
  return [header.join(','),...rows].join('\n')+'\n';
}
