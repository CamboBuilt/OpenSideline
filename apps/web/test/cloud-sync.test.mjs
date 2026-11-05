import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,appendEvent} from '../../../packages/scoring-engine/src/index.mjs';
import {createCloudGateway,CloudConflictError,validateCloudSnapshot} from '../src/cloud-sync.mjs';
import {assertCloudConfig,isCloudConfigured} from '../src/cloud-runtime.mjs';
import {renderCloudPanel} from '../src/cloud-panel.mjs';

function fakeClient(userId='test-user'){
  const games=new Map(),teams=[];
  let signedIn=Boolean(userId);
  const state={signedIn,requestedEmails:[],lastRequest:null};
  const client={
    auth:{
      async getUser(){return signedIn?{data:{user:{id:userId,email:'coach@example.test'}}}:{data:{user:null}};},
      async signInWithOtp(payload){state.requestedEmails.push(payload);return {data:{user:null},error:null};},
      async signOut(){signedIn=false;state.signedIn=false;return {error:null};},
      onAuthStateChange(callback){return {data:{subscription:{unsubscribe(){}}}};},
    },
    from(table){
      if(table==='games'){
        return {select(){return this},order(){return this},async limit(){
          return {data:[...games.values()].map(row=>({...row})),error:null};
        }};
      }
      if(table==='teams'){
        return {
          select(){return this},order(){return this},async limit(){
            return {data:teams.map(x=>({...x})),error:null};
          },
          insert(row){this.input=row;return this},
          single(){
            const created={...this.input,id:'team-'+(teams.length+1),created_at:'2026-11-05'};
            teams.push(created);return Promise.resolve({data:created,error:null});
          },
        };
      }
      throw new Error('Unexpected database table');
    },
    async rpc(name,params){
      state.lastRequest={name,params};
      if(name!=='save_game_snapshot')throw new Error('Unexpected RPC');
      const {p_local_game_id:id,p_expected_version:expected,p_snapshot:snapshot}=params;
      const current=games.get(id);
      if(current && expected!==current.version)
        return {error:{code:'P0001',message:'Cloud version conflict.'}};
      if(!current && expected!==null)
        return {error:{code:'P0001',message:'Missing remote game.'}};
      const version=(current?.version??0)+1;
      games.set(id,{
        local_game_id:id,snapshot,version,team_id:null,updated_at:'2026-11-05T13:00:00Z',
      });
      return {data:[{new_version:version,saved_at:'2026-11-05T13:00:00Z'}],error:null};
    },
  };
  return {client,games,teams,state};
}
const game=()=>createGame({
  awayRoster:[{id:'a1',name:'Away One'}],homeRoster:[{id:'h1',name:'Home One'}],
});
test('unconfigured cloud never requires a remote SDK',()=>{
  assert.equal(isCloudConfigured(),false);
  assert.throws(()=>assertCloudConfig(),/not connected/i);
  assert.throws(()=>assertCloudConfig({url:'http://example.com',publishableKey:'sb_publishable_test'}),/HTTPS/);
  assert.throws(()=>assertCloudConfig({url:'https://example.supabase.co',publishableKey:'sb_secret_bad'}),/Never include/);
  assert.equal(assertCloudConfig({url:'https://project.supabase.co/',publishableKey:'sb_publishable_test'}).url,
    'https://project.supabase.co');
  const legacyToken=role=>['eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({role})).toString('base64url'),'signature'].join('.');
  assert.throws(()=>assertCloudConfig({
    url:'https://project.supabase.co',publishableKey:legacyToken('service_role'),
  }),/anon\/public/i);
  assert.doesNotThrow(()=>assertCloudConfig({
    url:'https://project.supabase.co',publishableKey:legacyToken('anon'),
  }));

});
test('cloud game saves require valid event replay and authenticated user',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client);
  const g=game();
  const result=await gateway.saveGame(g);
  assert.equal(result.version,1);
  assert.equal(fx.state.lastRequest.name,'save_game_snapshot');
  assert.equal(fx.state.lastRequest.params.p_local_game_id,g.id);
  assert.equal(fx.state.lastRequest.params.p_expected_version,null);
  assert.equal((await gateway.listGames()).length,1);
  assert.throws(()=>validateCloudSnapshot({...g,events:[{type:'INVALID'}]}),/Unknown scoring action/i);
});
test('cloud save uses server revisions and refuses stale/unknown saves',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client),g=game();
  assert.equal((await gateway.saveGame(g)).version,1);
  const next=appendEvent(g,{type:'BALL'});
  assert.equal((await gateway.saveGame(next,{expectedVersion:1})).version,2);
  await assert.rejects(gateway.saveGame(next,{expectedVersion:1}),CloudConflictError);
  await assert.rejects(gateway.saveGame(next),CloudConflictError);
  assert.equal(fx.games.get(g.id).version,2);
  assert.equal(fx.games.get(g.id).snapshot.events.length,1);
});
test('cross-account user session required for saves and game lists',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client);
  await gateway.signOut();
  await assert.rejects(gateway.listGames(),/Sign in/i);
  await assert.rejects(gateway.saveGame(game()),/Sign in/i);
});
test('email login validates email and redirects using Supabase OTP',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client);
  await assert.rejects(gateway.emailSignIn('not-email','https://example.com'),/valid email/i);
  await gateway.emailSignIn('coach@example.test','https://example.com/');
  assert.equal(fx.state.requestedEmails[0].email,'coach@example.test');
  assert.equal(fx.state.requestedEmails[0].options.emailRedirectTo,'https://example.com/');
});
test('team creation and listing are scoped to the signed-in user',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client);
  await assert.rejects(gateway.createTeam(''),/Team name/i);
  const created=await gateway.createTeam(' Demo Tigers ');
  assert.equal(created.owner_id,'test-user');
  assert.equal(created.name,'Demo Tigers');
  assert.equal((await gateway.listTeams())[0].name,'Demo Tigers');
});
test('cloud loading rejects malicious or corrupt remote game snapshots',async()=>{
  const fx=fakeClient(),gateway=createCloudGateway(fx.client);
  const g=game();await gateway.saveGame(g);
  fx.games.get(g.id).snapshot.events=[{type:'UNSUPPORTED'}];
  await assert.rejects(gateway.listGames(),/Unknown scoring action/i);
});
test('cloud panel escapes account, team and game names',()=>{
  const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
  const html=renderCloudPanel({
    configured:true,loading:false,user:{email:'<script>alert(1)</script>'},
    teams:[{id:'t',name:'<b>Bad</b>'}],selectedTeam:'t',
    games:[{snapshot:{teams:{home:{name:'<img src=x>'},away:{name:'Safe'}}},
      version:1,updated_at:'2026-11-05'}],
  },esc);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x>'));
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;b&gt;/);
  assert.match(html,/My cloud games/);
});
test('signed-out cloud panel never shows private team or game names',()=>{
  const html=renderCloudPanel({
    configured:true,loading:false,user:null,
    teams:[{id:'t',name:'SECRET TEAM'}],
    games:[{snapshot:{teams:{home:{name:'SECRET GAME'},away:{name:'X'}}}}],
  },String);
  assert.ok(!html.includes('SECRET TEAM'));
  assert.ok(!html.includes('SECRET GAME'));
  assert.match(html,/Email sign-in link/);
});
