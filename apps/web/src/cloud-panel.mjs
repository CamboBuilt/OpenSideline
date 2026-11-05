/**
 * Stateless cloud UI; all dynamic user/team/game names are HTML escaped.
 * Used only on the scorer page. No roster data is shown to signed-out users.
 */
export function renderCloudPanel(model, escapeHtml) {
  const safe=escapeHtml;
  const {configured,loading,user,games=[],teams=[],message='',selectedTeam=''}=model;
  const teamOptions=teams.map(t=>`<option value="${safe(t.id)}" ${selectedTeam===t.id?'selected':''}>${safe(t.name)}</option>`).join('');
  const gameRows=games.map((entry,i)=>{
    const game=entry.snapshot,home=game.teams?.home?.name??'Home',away=game.teams?.away?.name??'Away';
    const timestamp=entry.updated_at?new Date(entry.updated_at).toLocaleString():'Recently saved';
    return `<div class="cloud-game-row">
      <div class="cloud-game-details"><strong>${safe(away)} vs. ${safe(home)}</strong>
        <small>Revision ${safe(entry.version)} · ${safe(timestamp)}</small></div>
      <button class="btn subtle" type="button" data-cloud-load="${i}">Open</button>
    </div>`;
  }).join('');
  let content;
  if(!configured){
    content=`<div class="cloud-not-connected"><p><b>Cloud connection not configured.</b> Your scorer still saves locally in this browser.</p>
      <p>To enable private accounts and cloud saves, connect a Supabase project, apply the database migration with row-level security, then configure its public URL and publishable key.</p>
      <p class="fineprint">Never add a Supabase secret or service-role key to browser files. No roster data has been sent to a cloud service.</p></div>`;
  }else if(loading){
    content='<p class="cloud-status">Connecting to your private cloud project…</p>';
  }else if(!user){
    content=`<p>Sign in with your email address. We'll send a one-time sign-in link. After signing in, you can save this game privately to your account.</p>
      <form id="cloud-login-form" class="cloud-inline-form"><input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" required/>
        <button class="btn primary" type="submit">Email sign-in link</button></form>
      <p class="fineprint">Cloud saves are private to your account. This is not yet public live scoring or QR lineup sharing.</p>`;
  }else{
    content=`<div class="cloud-signed-in"><span>Signed in: <strong>${safe(user.email??'Private account')}</strong></span>
      <button class="btn subtle" data-cloud-action="signout" type="button">Sign out</button></div>
      <div class="cloud-section"><h3>Save your current game</h3>
        <p>Save only when you're ready. Your local game remains available offline. If another device changed this game, we'll refuse to overwrite it.</p>
        <label for="cloud-team-picker">Team (optional)</label>
        <select id="cloud-team-picker" data-cloud-team><option value="">Private game (no team)</option>${teamOptions}</select>
        <button type="button" class="btn primary" data-cloud-action="save">Save current game to cloud</button>
      </div>
      <div class="cloud-section"><h3>My teams</h3>
        <form id="cloud-team-form" class="cloud-inline-form">
          <input name="name" maxlength="80" placeholder="New team name" aria-label="Team name" required/>
          <button class="btn subtle" type="submit">Create team</button>
        </form>
        <p class="fineprint">Teams are private to their owner in this release; coach invitations are a later step.</p>
      </div>
      <div class="cloud-section"><div class="cloud-games-header"><h3>My cloud games</h3>
        <button class="btn subtle" type="button" data-cloud-action="refresh">Refresh list</button></div>
        ${gameRows||'<p class="fineprint">No cloud games saved to this account yet.</p>'}
      </div>`;
  }
  return `<div class="modal-backdrop" data-command="close-cloud">
    <div class="modal cloud-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-title">
      <div class="modal-head"><div><div class="eyebrow">OPTIONAL CLOUD SYNC</div><h2 id="cloud-title">My OpenSideline</h2>
        <p>Private team and game storage. The baseball scorer works without an account.</p></div>
        <button type="button" class="close-button" data-command="close-cloud" aria-label="Close cloud account panel">×</button></div>
      ${content}
      ${message?`<p class="cloud-status" role="status">${safe(message)}</p>`:''}
    </div>
  </div>`;
}
