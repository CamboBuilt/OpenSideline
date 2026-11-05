import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRosterImport,parseCsv,parsePosition,importedRosterText,matchImportedDefense,
} from '../src/roster-import.mjs';

test('CSV with headers imports batting order and 9 defensive positions',()=>{
  const csv='number,name,position,batting_order\n12,Jordan Lane,SS,2\n24,Alex Rivera,P,1\n7,Casey Hall,C,3';
  const parsed=parseRosterImport(csv,'roster.csv');
  assert.deepEqual(parsed.players.map(p=>p.number),['24','12','7']);
  assert.deepEqual(parsed.players.map(p=>p.position),[1,6,2]);
  assert.equal(importedRosterText(parsed.players),'#24 Alex Rivera\n#12 Jordan Lane\n#7 Casey Hall');
});
test('quoted commas and embedded line breaks are parsed as data, not separators',()=>{
  const rows=parseCsv('number,name,position\r\n12,"O’Neal, Casey",SS\r\n7,"Alex\nRivera",CF\r\n');
  assert.equal(rows[1][1],'O’Neal, Casey');
  assert.equal(rows[2][1],'Alex\nRivera');
  assert.equal(parseRosterImport('number,name,position\n12,"O’Neal, Casey",SS').players[0].name,'O’Neal, Casey');
});
test('headerless CSV accepts number/name/position sequence',()=>{
  const parsed=parseRosterImport('12,Sam Taylor,6\n7,Jules Gray,8','players.csv');
  assert.deepEqual(parsed.players.map(p=>p.position),[6,8]);
});
test('header name and optional position can be reordered',()=>{
  const parsed=parseRosterImport('Position,Player Name,Jersey Number\nRF,Pat White,18','team.csv');
  assert.equal(parsed.players[0].name,'Pat White');
  assert.equal(parsed.players[0].number,'18');
  assert.equal(parsed.players[0].position,9);
});
test('JSON arrays accept simplified roster entries and optional positions',()=>{
  const parsed=parseRosterImport(JSON.stringify([
    {name:'Terry Lee',number:10,position:'2B'},
    {name:'Cameron Fox',number:11},
  ]),'roster.json');
  assert.equal(parsed.players[0].position,4);
  assert.equal(parsed.players[1].position,null);
  assert.equal(parsed.teamName,null);
});
test('JSON object carries teamName and roster array',()=>{
  const parsed=parseRosterImport(JSON.stringify({
    teamName:'Demo Meteors',
    roster:[{name:'Jordan One',number:'5',position:'left field'}],
  }),'lineup.json');
  assert.equal(parsed.teamName,'Demo Meteors');
  assert.equal(parsed.players[0].position,7);
});
test('JSON game export selects the requested home or away team roster',()=>{
  const file=JSON.stringify({teams:{
    home:{name:'Home Club',roster:[{id:'h1',name:'Home Player',number:'9'}]},
    away:{name:'Away Club',roster:[{id:'a1',name:'Away Player',number:'8'}]},
  }});
  assert.equal(parseRosterImport(file,'game.json','home').teamName,'Home Club');
  assert.equal(parseRosterImport(file,'game.json','away').players[0].name,'Away Player');
});
test('player fielding position parsing supports aliases and unassigned/bench',()=>{
  assert.equal(parsePosition('shortstop'),6);
  assert.equal(parsePosition('2B'),4);
  assert.equal(parsePosition('RF'),9);
  assert.equal(parsePosition(1),1);
  assert.equal(parsePosition('DH'),null);
  assert.equal(parsePosition('BENCH'),null);
  assert.throws(()=>parsePosition('10'),/Unknown defensive position/i);
});
test('imported assignments match players by number+name even if the batting order changed',()=>{
  const imported=parseRosterImport('number,name,position\n12,Jamie Lane,SS\n22,Avery Lee,RF','defense.csv').players;
  const actual=[{id:'away-2',number:'22',name:'Avery Lee'},{id:'away-1',number:'12',name:'Jamie Lane'}];
  assert.deepEqual(matchImportedDefense(actual,imported),{'6':'away-1','9':'away-2'});
});
test('imported assignments never guess by batting position or mismatched roster',()=>{
  const imported=parseRosterImport('number,name,position\n12,Jamie Lane,SS','defense.csv').players;
  const actual=[{id:'away-1',number:'12',name:'Someone Else'}];
  assert.deepEqual(matchImportedDefense(actual,imported),{});
});
test('malformed files, duplicate defense positions, duplicate batting order are rejected',()=>{
  assert.throws(()=>parseRosterImport('','team.csv'),/empty/i);
  assert.throws(()=>parseRosterImport('number,name\n','team.csv'),/no players/i);
  assert.throws(()=>parseRosterImport('number,name\n12,"Bad','team.csv'),/quoted/i);
  assert.throws(()=>parseRosterImport('{bad}','roster.json'),/Invalid JSON/i);
  assert.throws(()=>parseRosterImport('number,name,position\n1,Amy,P\n2,Bob,P','roster.csv'),/same defensive position/i);
  assert.throws(()=>parseRosterImport('number,name,batting_order\n1,Amy,1\n2,Bob,1','roster.csv'),/same batting order/i);
  assert.throws(()=>parseRosterImport('number,name\nA1,Amy','roster.csv'),/jersey number/i);
});
test('large inputs, excessive players and unknown positions fail without modifying the game',()=>{
  assert.throws(()=>parseRosterImport('a'.repeat(130*1024),'large.csv'),/128 KB/i);
  const file='number,name\n'+Array.from({length:31},(_,i)=>`${i+1},Player ${i+1}`).join('\n');
  assert.throws(()=>parseRosterImport(file,'too-many.csv'),/1–30 players/i);
  assert.throws(()=>parseRosterImport('number,name,position\n1,Player,goalkeeper','roster.csv'),/Unknown defensive position/i);
});
