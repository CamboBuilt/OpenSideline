/**
 * Optional browser integration. No external SDK is loaded when cloud is
 * unconfigured, so the local/offline scorer works exactly as before.
 *
 * For a fully productionized build, bundle and pin @supabase/supabase-js
 * locally instead of fetching an unpinned major version at runtime.
 */
import { CLOUD_CONFIG } from '../cloud-config.mjs';
import { createCloudGateway } from './cloud-sync.mjs';

const CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
let loading=null;

export function isCloudConfigured(config=CLOUD_CONFIG){
  return typeof config?.url==='string' && config.url.trim().length>0
    && typeof config.publishableKey==='string' && config.publishableKey.trim().length>0;
}
export function assertCloudConfig(config=CLOUD_CONFIG){
  if(!isCloudConfigured(config))throw new Error('Cloud is not connected. Configure your Supabase project first.');
  let target;
  try{target=new URL(config.url)}catch{throw new Error('Invalid Supabase URL.');}
  if(target.protocol!=='https:' && !(target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname)))
    throw new Error('Cloud URL must use HTTPS outside local development.');
  if(config.publishableKey.startsWith('sb_secret_') || /service_role/i.test(config.publishableKey))
    throw new Error('Never include a Supabase service-role or secret key in browser configuration.');
  // Legacy Supabase keys are JWTs. Catch accidentally pasted service-role
  // JWTs as well as newer sb_secret_* keys before the client is initialized.
  if(config.publishableKey.split('.').length===3){
    let role=null;
    try{
      const part=config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      role=JSON.parse(atob(part)).role;
    }catch{throw new Error('Invalid legacy Supabase key. Use a publishable or anon key.');}
    if(role!=='anon')
      throw new Error('Only legacy anon/public keys may be used in browser configuration.');
  }
  return {...config,url:target.origin};
}
async function loadSupabaseBrowser(){
  if(typeof window==='undefined')throw new Error('Cloud login requires a browser.');
  if(window.supabase?.createClient)return window.supabase;
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=CDN;
    script.async=true;
    script.crossOrigin='anonymous';
    script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Supabase SDK did not initialize.'));
    script.onerror=()=>reject(new Error('Unable to load the cloud sign-in library. Check your connection.'));
    document.head.appendChild(script);
  }).catch(error=>{loading=null;throw error});
  return loading;
}
export async function connectCloud(config=CLOUD_CONFIG){
  const normalized=assertCloudConfig(config);
  const sdk=await loadSupabaseBrowser();
  const client=sdk.createClient(normalized.url,normalized.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
  });
  return createCloudGateway(client);
}
