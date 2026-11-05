import test from 'node:test';
import assert from 'node:assert/strict';
import { replayGame } from '../../../packages/scoring-engine/src/index.mjs';

const store=new Map(),handlers={};
const app={
  innerHTML:'',
  addEventListener(name,fn){handlers[name]=fn;},
};
globalThis.BroadcastChannel=undefined;
globalThis.localStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,String(value)),
};
globalThis.location={search:''};
globalThis.window={addEventListener(){}};
globalThis.document={
  title:'',
  querySelector:selector=>selector==='#app'?app:null,
};
globalThis.confirm=()=>true;
globalThis.FormData=class {
  constructor(form){this.fields=form.fields??{};}
  get(key){return this.fields[key]??null;}
};
await import('../src/main.mjs');
const click=(dataset)=>handlers.click({
  target:{closest:()=>({dataset,disabled:false})},
});
const submit=(id,fields,extra={})=>handlers.submit({
  target:{id,fields,matches:selector=>Boolean(extra.slot!==undefined&&selector==='[data-substitution-slot]'),
    dataset:{substitutionSlot:String(extra.slot??'')}},
  preventDefault(){},
});
const current=()=>JSON.parse(store.get('opensideline:baseball:v1'));

test('scorer renders with rules, roster import, defense and game-day actions',()=>{
  assert.match(app.innerHTML,/Live scorer/);
  assert.match(app.innerHTML,/Defense/);
  click({command:'open-setup'});
  assert.match(app.innerHTML,/Active batting order/);
  assert.match(app.innerHTML,/Rules example/);
  assert.match(app.innerHTML,/Import CSV \/ JSON roster/);
});
test('nine-batter setup keeps two bench players and allows a pinch hitter',()=>{
  const roster=Array.from({length:11},(_,i)=>`#${i+1} Fictional ${i+1}`).join('\n');
  submit('setup-form',{
    awayName:'Away Demo',homeName:'Home Demo',
    awayRoster:roster,homeRoster:roster,
    awayOrder:'1,2,3,4,5,6,7,8,9',homeOrder:'1,2,3,4,5,6,7,8,9',
    preset:'adult',battingMode:'nine',innings:'9',allowReentry:null,
  });
  const v=replayGame(current());
  assert.equal(v.battingOrder.away.length,9);
  assert.equal(v.battingOrder.home.length,9);
  assert.equal(v.rules.allowReentry,false);
  click({command:'open-lineup'});
  assert.match(app.innerHTML,/Lineup &amp; substitutions|Lineup & substitutions/);
  assert.match(app.innerHTML,/Choose bench player/);
  submit('',{playerId:'away-10',kind:'PH'},{slot:0});
  const after=replayGame(current());
  assert.equal(after.batter.id,'away-10');
  assert.equal(after.battingOrder.away[0],'away-10');
  assert.equal(after.substitutions.at(-1).kind,'PH');
});
test('pitcher form changes pitcher for selected defensive team',()=>{
  click({lineupTeam:'home'});
  submit('pitcher-change-form',{playerId:'home-11'});
  const v=replayGame(current());
  assert.equal(v.defenseLineup.home['1'],'home-11');
  assert.equal(v.battingOrder.away[0],'away-10');
});
