'use strict';
/* ============================================================================
   THE AZURE CLIENT ID.  It lives here and in one JSON file beside it, and it
   is not written anywhere else in the codebase.

   TO MAKE SIGN-IN REAL you must register your OWN application:

     1. portal.azure.com -> Microsoft Entra ID -> App registrations -> New
        · Supported account types: "Personal Microsoft accounts only"
        · Platform: "Mobile and desktop applications", and turn ON
          "Allow public client flows" (the device-code grant is a public
          client flow; without this the token endpoint refuses it)
        · It is a PUBLIC client: it has no secret, and one must never be
          added here.  A secret shipped in a desktop app is not a secret.
     2. Ask Mojang to approve that application for the Minecraft scopes.
        Until they do, steps 5 and 6 of the chain (login_with_xbox and
        /minecraft/profile) will refuse the token even though Microsoft
        issued it happily.  This is Mojang's gate, not a bug here.
     3. Put the application (client) id in ONE of:
          · the KESTREL_MSA_CLIENT_ID environment variable, or
          · auth.config.json next to this file, as { "clientId": "..." }, or
          · auth.config.json in the app data folder (%APPDATA%/Kestrel),
            which is the one to use for a packaged build.

   DO NOT paste in a client id belonging to another launcher.  It is
   registered to somebody else, the Mojang approval attached to it is theirs,
   and using it makes your users' sign-ins look like theirs.

   WITH NO CLIENT ID the launcher does not pretend.  It runs the same
   device-code screen against a local stub and says on screen, in the panel
   and on the account row, that nothing was signed in.  See msauth.js.

   LEAST PRIVILEGE.  SCOPE is the whole of what is asked for: the right to
   sign in to Xbox Live, and a refresh token so it need not be asked twice.
   Nothing about mail, files, contacts or the profile behind the account.
   ========================================================================= */

const fs = require('node:fs');
const path = require('node:path');

/* the value that ships, and the only string that means "not configured" */
const PLACEHOLDER = 'REPLACE-WITH-YOUR-AZURE-APPLICATION-CLIENT-ID';

/* least privilege: these two, and no third */
const SCOPE = 'XboxLive.signin offline_access';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIG_FILE = 'auth.config.json';

function readFileId(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8');
    const j = JSON.parse(raw);
    const v = j && typeof j.clientId === 'string' ? j.clientId.trim() : '';
    return v ? { id: v, source: path.join(dir, CONFIG_FILE) } : null;
  } catch (e) { return null; }
}

/* dataRoot is %APPDATA%/<brand>, so a packaged build can be configured
   without unpacking the asar.  It wins over the copy in the source tree. */
function resolve(dataRoot) {
  const env = String(process.env.KESTREL_MSA_CLIENT_ID || '').trim();
  const found = (env ? { id: env, source: 'KESTREL_MSA_CLIENT_ID' } : null)
    || (dataRoot ? readFileId(dataRoot) : null)
    || readFileId(__dirname)
    || { id: PLACEHOLDER, source: 'built-in placeholder' };

  const live = found.id !== PLACEHOLDER && GUID_RE.test(found.id);
  let why = '';
  if (!live) {
    why = found.id === PLACEHOLDER || !found.id
      ? 'no Azure application client id is configured'
      : 'the configured client id is not a GUID';
  }
  return { clientId: live ? found.id : '', live, source: found.source, why, scope: SCOPE };
}

module.exports = { resolve, PLACEHOLDER, SCOPE, CONFIG_FILE };
