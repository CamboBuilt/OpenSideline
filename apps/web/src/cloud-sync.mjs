/**
 * Browser-side private cloud operations. Authenticated Supabase client required.
 * The scoring engine validates event journals before they leave the browser.
 * Atomic saves use a server-side expected-version check (no silent overwrites).
 */
import { replayGame } from '../../../packages/scoring-engine/src/index.mjs';

export class CloudConflictError extends Error {
  constructor(message='This game changed in the cloud. Open the current cloud version or preserve your local copy.') {
    super(message);
    this.name='CloudConflictError';
  }
}
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const unwrap = (response,context) => {
  if(response?.error) throw new Error(`${context}: ${response.error.message??'Request failed'}`);
  return response?.data;
};
const ownedUser = async client => {
  const response=await client.auth.getUser();
  if(response?.error) throw new Error('Cloud session: '+response.error.message);
  const user=response?.data?.user;
  assert(user?.id, 'Sign in before accessing private cloud games.');
  return user;
};
export function validateCloudSnapshot(game) {
  const state=replayGame(game);
  assert(game.id?.startsWith('game-') && game.id.length<=120,'Invalid game identifier.');
  const encoded=JSON.stringify(game);
  assert(new TextEncoder().encode(encoded).byteLength<=1024*1024,
    'Game is too large for the current cloud limit (1 MB). Export it locally.');
  return {state,bytes:encoded.length};
}
export function createCloudGateway(client) {
  assert(client?.auth?.getUser && client?.from && client?.rpc,'Invalid cloud client.');
  return {
    client,
    async getUser(){return ownedUser(client)},
    onAuthStateChange(callback) {
      const {data}=client.auth.onAuthStateChange((event,session)=>callback(event,session));
      return ()=>data.subscription.unsubscribe();
    },
    async emailSignIn(email,redirectUrl){
      assert(typeof email==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
        'Enter a valid email address.');
      assert(typeof redirectUrl==='string' && /^https?:\/\//.test(redirectUrl),
        'Invalid login redirect.');
      unwrap(await client.auth.signInWithOtp({
        email:email.trim(),
        options:{emailRedirectTo:redirectUrl},
      }),'Email login');
    },
    async signOut(){unwrap(await client.auth.signOut(),'Sign out')},
    async listTeams(){
      await ownedUser(client);
      const query=client.from('teams').select('id,name,created_at').order('created_at',{ascending:false}).limit(30);
      return unwrap(await query,'Load teams')??[];
    },
    async createTeam(name){
      const user=await ownedUser(client);
      const cleaned=String(name??'').trim();
      assert(cleaned.length>=1&&cleaned.length<=80,'Team name must be 1–80 characters.');
      const query=client.from('teams').insert({owner_id:user.id,name:cleaned}).select('id,name,created_at').single();
      return unwrap(await query,'Create team');
    },
    async listGames(){
      await ownedUser(client);
      const query=client.from('games').select(
        'local_game_id,team_id,snapshot,version,updated_at'
      ).order('updated_at',{ascending:false}).limit(30);
      const rows=unwrap(await query,'Load games')??[];
      // Untrusted remote snapshots must pass the same game-journal replay checks.
      return rows.map(row=>{
        validateCloudSnapshot(row.snapshot);
        return row;
      });
    },
    async saveGame(game,{expectedVersion=null,teamId=null}={}){
      await ownedUser(client);
      validateCloudSnapshot(game);
      assert(expectedVersion===null || Number.isSafeInteger(expectedVersion)&&expectedVersion>=1,
        'Invalid expected cloud version.');
      if(teamId!==null) assert(typeof teamId==='string'&&teamId.length<80,'Invalid team ID.');
      const response=await client.rpc('save_game_snapshot',{
        p_local_game_id:game.id,p_snapshot:game,
        p_expected_version:expectedVersion,p_team_id:teamId,
      });
      if(response?.error){
        if(['P0001','23505'].includes(response.error.code)){
          throw new CloudConflictError(response.error.message);
        }
        throw new Error('Cloud save: '+response.error.message);
      }
      const data=Array.isArray(response.data)?response.data[0]:response.data;
      assert(Number.isSafeInteger(data?.new_version),
        'Cloud did not confirm the saved version.');
      return {version:data.new_version,updatedAt:data.saved_at};
    },
  };
}
