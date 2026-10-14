// n8n Code node ("Run Once for All Items"). Put it right after the Webhook node.
// Lets a request through only if it carries the sign-in token of an agency account.
// The dashboard sends the token as payload.idToken (publish-post, form POST) or ?token= (zernio-auth, GET).
const DB = 'https://socail-media-creation-default-rtdb.firebaseio.com';
const helpers = this.helpers || (typeof $helpers !== 'undefined' ? $helpers : null);
const decodeBase64 = s => (typeof Buffer !== 'undefined'
  ? Buffer.from(s, 'base64').toString('utf8')
  : decodeURIComponent(escape(atob(s))));

const out = [];
for (const item of $input.all()) {
  const json = item.json;
  let body = json.body || {};
  let token = '';

  // publish-post: the whole request is a JSON string in the "payload" form field
  if (body && typeof body.payload === 'string') {
    const data = JSON.parse(body.payload);
    token = data.idToken || '';
    delete data.idToken;
    body = data; // later nodes keep using $json.body.profileId and $json.body.post
  }
  // zernio-auth: token in the query string
  if (!token && json.query && json.query.token) token = json.query.token;
  if (!token) throw new Error('Unauthorized: missing sign-in token');

  let uid = '';
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    uid = JSON.parse(decodeBase64(part)).user_id || '';
  } catch (e) {}
  if (!uid) throw new Error('Unauthorized: invalid sign-in token');

  // Firebase verifies the token's signature and expiry here; only accounts listed in agency_users read `true`
  const allowed = await helpers.httpRequest({
    url: `${DB}/agency_users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(token)}`,
    method: 'GET',
    json: true
  });
  if (allowed !== true) throw new Error('Unauthorized: not an agency account');

  const query = Object.assign({}, json.query);
  delete query.token;
  out.push({ json: Object.assign({}, json, { body, query }) });
}
return out;
