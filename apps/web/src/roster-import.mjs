/**
 * Import a roster and optional starting defensive positions from CSV or JSON.
 * Pure parser: no browser APIs, network access, or third-party dependencies.
 *
 * Supported CSV: number,name,position,batting_order (headers may be reordered).
 * JSON: [{ number, name, position }] or { teamName, roster:[...] }.
 * position is one of P,C,1B,2B,3B,SS,LF,CF,RF or the digits 1..9.
 */
export const POSITION_CODES = Object.freeze({
  'P':1,'C':2,'1B':3,'2B':4,'3B':5,'SS':6,'LF':7,'CF':8,'RF':9,
});
const aliases=Object.freeze({
  P:1,PITCHER:1,C:2,CATCHER:2,'1B':3,FIRSTBASE:3,FIRSTBASEMAN:3,
  '2B':4,SECONDBASE:4,SECONDBASEMAN:4,'3B':5,THIRDBASE:5,THIRDBASEMAN:5,
  SS:6,SHORTSTOP:6,LF:7,LEFTFIELD:7,CF:8,CENTERFIELD:8,RF:9,RIGHTFIELD:9,
});
const optionalPosition = value => value == null || String(value).trim()==='' ||
  ['BENCH','SUB','SUBSTITUTE','DH','UTILITY','UTIL','NA','N/A','-'].includes(String(value).trim().toUpperCase());
export function parsePosition(value) {
  if (optionalPosition(value)) return null;
  const clean=String(value).trim().toUpperCase().replace(/[\s_-]+/g,'');
  const number=Number(clean);
  if (/^[1-9]$/.test(clean)) return number;
  if (Object.hasOwn(aliases,clean)) return aliases[clean];
  throw new Error(`Unknown defensive position: ${String(value).slice(0,30)}. Use P, C, 1B, 2B, 3B, SS, LF, CF or RF.`);
}

export function parseCsv(source) {
  const rows=[];let row=[],field='',quote=false;
  const input=source.replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++) {
    const char=input[i];
    if(quote) {
      if(char==='"' && input[i+1]==='"') { field+='"'; i++; }
      else if(char==='"') quote=false;
      else field+=char;
    } else if(char==='"') {
      if(field!=='') throw new Error('Unexpected quote in CSV field.');
      quote=true;
    } else if(char===',') { row.push(field.trim());field=''; }
    else if(char==='\n'||char==='\r') {
      if(char==='\r'&&input[i+1]==='\n')i++;
      row.push(field.trim());
      if(row.some(value=>value!==''))rows.push(row);
      row=[];field='';
    } else field+=char;
  }
  if(quote)throw new Error('CSV has an unclosed quoted field.');
  row.push(field.trim());
  if(row.some(value=>value!==''))rows.push(row);
  return rows;
}
const headers={
  name:['name','player','playername','fullname','athlete'],
  number:['number','no','num','jersey','jerseynumber','uniform','uniformnumber'],
  position:['position','pos','defense','fieldingposition','fieldposition'],
  order:['battingorder','order','batting','lineup','battingposition'],
};
const canonical = val=>String(val??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const toRecord = (record,index) => {
  if(!record || typeof record!=='object'||Array.isArray(record)) throw new Error('Every player must be a record.');
  const name=String(record.name??record.player??record.playerName??'').trim();
  const number=String(record.number??record.jersey??record.jerseyNumber??index+1).trim();
  if(!name || name.length>60 || /[\r\n]/.test(name))throw new Error(`Player ${index+1}: name must be 1–60 characters.`);
  if(!/^\d{1,3}$/.test(number))throw new Error(`Player ${index+1}: jersey number must have 1–3 digits.`);
  const position=parsePosition(record.position??record.pos??null);
  const orderValue=record.batting_order??record.battingOrder??record.order;
  const order=orderValue==null||String(orderValue).trim()===''?null:Number(orderValue);
  if(order!==null && (!Number.isInteger(order)||order<1||order>30))throw new Error('Batting order must be 1–30.');
  return {name,number,position,order};
};

export function parseRosterImport(contents, filename='', side=null) {
  const text=String(contents??'');
  if(!text.trim())throw new Error('The imported file is empty.');
  if(text.length>128*1024)throw new Error('Import must be 128 KB or smaller.');
  const isJson=/\.json$/i.test(filename)||/^[\s\uFEFF]*[\[{]/.test(text);
  let raw,teamName=null;
  if(isJson){
    let parsed;
    try { parsed=JSON.parse(text.replace(/^\uFEFF/,'')); }
    catch{throw new Error('Invalid JSON roster file.');}
    if(Array.isArray(parsed))raw=parsed;
    else if(parsed && typeof parsed==='object') {
      const rosterSource=parsed.teams && side ? parsed.teams[side] : parsed;
      if(!rosterSource)throw new Error('This game JSON does not contain the selected team.');
      teamName=rosterSource.teamName??rosterSource.name??null;
      raw=rosterSource.roster??rosterSource.players;
    }
  }else{
    const rows=parseCsv(text);
    if(!rows.length)throw new Error('No CSV rows found.');
    const rawHeaders=rows[0].map(canonical);
    const found=Object.fromEntries(Object.entries(headers).map(([key,choices])=>
      [key,rawHeaders.findIndex(h=>choices.includes(h))]));
    const hasHeader=found.name>=0;
    if(hasHeader && rows.length===1)throw new Error('The CSV contains a header but no players.');
    if(hasHeader) {
      raw=rows.slice(1).map(row=>({
        name:row[found.name],
        number:found.number>=0?row[found.number]:undefined,
        position:found.position>=0?row[found.position]:undefined,
        order:found.order>=0?row[found.order]:undefined,
      }));
    }else {
      raw=rows.map(row=>({
        number:row[0],name:row[1],position:row[2],order:row[3],
      }));
    }
  }
  if(!Array.isArray(raw)||raw.length<1||raw.length>30)
    throw new Error('Import requires 1–30 players.');
  const players=raw.map(toRecord);
  const usedPositions=new Set();
  const usedOrders=new Set();
  for(const player of players){
    if(player.position!==null){
      if(usedPositions.has(player.position))throw new Error('Two imported players have the same defensive position.');
      usedPositions.add(player.position);
    }
    if(player.order!==null){
      if(usedOrders.has(player.order))throw new Error('Two players have the same batting order.');
      usedOrders.add(player.order);
    }
  }
  if(players.some(p=>p.order!==null)) players.sort((a,b)=>(a.order??Infinity)-(b.order??Infinity));
  return {teamName:teamName===null?null:String(teamName).trim().slice(0,60),players};
}

export function importedRosterText(players){
  return players.map(player=>`#${player.number} ${player.name}`).join('\n');
}

export function matchImportedDefense(roster, importedPlayers){
  const selected={},used=new Set();
  for(const player of importedPlayers){
    if(player.position===null)continue;
    const matches=roster.filter(candidate=>
      String(candidate.number)===String(player.number) && candidate.name===player.name);
    if(matches.length!==1)continue;
    if(used.has(matches[0].id))continue;
    selected[String(player.position)]=matches[0].id;
    used.add(matches[0].id);
  }
  return selected;
}
