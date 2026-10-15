// Server side of the "النشر" tab: talks to Post for Me (https://api.postforme.dev) so the API key
// never reaches the browser. Every call must carry a Firebase ID token of an agency account
// (listed in agency_users), the same check the n8n webhooks use.
//
// Setup: add POSTFORME_API_KEY in Vercel → Project → Settings → Environment Variables.

const PFM_API = 'https://api.postforme.dev/v1';
const FIREBASE_WEB_KEY = 'AIzaSyCBC6_DRCiMwoGPIM1uexpfvXQIaeF-DOc';
const DB_URL = 'https://socail-media-creation-default-rtdb.firebaseio.com';

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'tiktok_business', 'youtube', 'linkedin', 'x', 'threads', 'pinterest', 'bluesky'];
const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_STATUS_IDS = 40;

const tokenCache = new Map();

class HttpError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code || null;
    }
}

async function readJson(res) {
    const text = await res.text();
    try { return text ? JSON.parse(text) : {}; } catch (e) { return { message: text }; }
}

// Returns the uid of a signed-in agency account, or throws 401/403
async function verifyAgency(idToken) {
    if (!idToken || idToken.length > 4096) throw new HttpError(401, 'Sign in first', 'auth');
    const cached = tokenCache.get(idToken);
    if (cached && cached.until > Date.now()) return cached.uid;

    const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    const user = lookup.ok ? ((await readJson(lookup)).users || [])[0] : null;
    if (!user || !user.localId) throw new HttpError(401, 'Sign in again', 'auth');

    const allowed = await fetch(`${DB_URL}/agency_users/${encodeURIComponent(user.localId)}.json?auth=${encodeURIComponent(idToken)}`);
    if (!allowed.ok || (await readJson(allowed)) !== true) throw new HttpError(403, 'This account is not on the agency list', 'forbidden');

    if (tokenCache.size > 500) tokenCache.clear();
    tokenCache.set(idToken, { uid: user.localId, until: Date.now() + 5 * 60 * 1000 });
    return user.localId;
}

async function pfm(method, path, body) {
    const res = await fetch(PFM_API + path, {
        method,
        headers: { 'Authorization': `Bearer ${process.env.POSTFORME_API_KEY}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await readJson(res);
    if (!res.ok) {
        const msg = Array.isArray(data.error) ? data.error.join(', ') : (data.message || (data.error && data.error.message) || data.error || `Post for Me error ${res.status}`);
        throw new HttpError(res.status >= 500 ? 502 : 400, String(msg), 'provider');
    }
    return data;
}

// Only what the page needs: never send account tokens to the browser
const publicAccount = a => ({
    id: a.id,
    platform: a.platform,
    username: a.username || '',
    name: (a.metadata && a.metadata.display_name) || a.username || '',
    photo: a.profile_photo_url || '',
    clientId: a.external_id || '',
    status: a.status
});

function requireId(value, label) {
    if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(400, `Bad ${label}`, 'input');
    return value;
}

// Keeps only the fields Post for Me accepts on a post
function cleanPost(post) {
    if (!post || typeof post !== 'object') throw new HttpError(400, 'Missing post', 'input');
    const accounts = Array.isArray(post.social_accounts) ? post.social_accounts : [];
    if (!accounts.length || accounts.length > 50) throw new HttpError(400, 'Pick at least one account', 'input');
    accounts.forEach(id => requireId(id, 'account'));
    const media = (Array.isArray(post.media) ? post.media : []).slice(0, 35).map(m => {
        if (!m || typeof m.url !== 'string' || !/^https:\/\//.test(m.url)) throw new HttpError(400, 'Media must be a public https link', 'input');
        const out = { url: m.url };
        if (typeof m.thumbnail_url === 'string' && /^https:\/\//.test(m.thumbnail_url)) out.thumbnail_url = m.thumbnail_url;
        return out;
    });
    const out = {
        caption: typeof post.caption === 'string' ? post.caption.slice(0, 70000) : '',
        social_accounts: accounts,
        media,
        scheduled_at: post.scheduled_at ? new Date(post.scheduled_at).toISOString() : null
    };
    if (post.platform_configurations && typeof post.platform_configurations === 'object') {
        out.platform_configurations = {};
        Object.keys(post.platform_configurations).forEach(p => {
            if (PLATFORMS.includes(p) && post.platform_configurations[p] && typeof post.platform_configurations[p] === 'object') {
                out.platform_configurations[p] = post.platform_configurations[p];
            }
        });
    }
    if (typeof post.external_id === 'string' && post.external_id.length <= 200) out.external_id = post.external_id;
    return out;
}

async function listAccounts() {
    const all = [];
    for (let offset = 0; offset < 2000; offset += 100) {
        const page = await pfm('GET', `/social-accounts?limit=100&offset=${offset}&status=connected`);
        (page.data || []).forEach(a => all.push(publicAccount(a)));
        if (!page.data || page.data.length < 100) break;
    }
    return all;
}

async function postStatus(id) {
    const [post, results] = await Promise.all([
        pfm('GET', `/social-posts/${encodeURIComponent(id)}`),
        pfm('GET', `/social-post-results?post_id=${encodeURIComponent(id)}&limit=50`)
    ]);
    return {
        id,
        status: post.status,
        scheduledAt: post.scheduled_at || null,
        results: (results.data || []).map(r => ({
            accountId: r.social_account_id,
            success: !!r.success,
            error: r.error ? (typeof r.error === 'string' ? r.error : (r.error.message || JSON.stringify(r.error))) : null,
            url: (r.platform_data && (r.platform_data.url || r.platform_data.permalink)) || null
        }))
    };
}

const actions = {
    async accounts() {
        return { accounts: await listAccounts() };
    },
    async connect(body) {
        const platform = body.platform;
        if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Unknown platform', 'input');
        const request = { platform, external_id: requireId(body.clientId, 'client') };
        // Post for Me's shared LinkedIn app only connects company pages
        if (platform === 'linkedin') request.platform_data = { linkedin: { connection_type: 'organization' } };
        const data = await pfm('POST', '/social-accounts/auth-url', request);
        return { url: data.url };
    },
    async disconnect(body) {
        await pfm('POST', `/social-accounts/${encodeURIComponent(requireId(body.accountId, 'account'))}/disconnect`);
        return { ok: true };
    },
    async 'upload-url'() {
        const data = await pfm('POST', '/media/create-upload-url');
        return { uploadUrl: data.upload_url, mediaUrl: data.media_url };
    },
    async create(body) {
        const data = await pfm('POST', '/social-posts', cleanPost(body.post));
        return { id: data.id, status: data.status, scheduledAt: data.scheduled_at || null };
    },
    async update(body) {
        const id = requireId(body.id, 'post');
        const data = await pfm('PUT', `/social-posts/${encodeURIComponent(id)}`, cleanPost(body.post));
        return { id: data.id, status: data.status, scheduledAt: data.scheduled_at || null };
    },
    async delete(body) {
        await pfm('DELETE', `/social-posts/${encodeURIComponent(requireId(body.id, 'post'))}`);
        return { ok: true };
    },
    async status(body) {
        const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, MAX_STATUS_IDS).map(id => requireId(id, 'post'));
        const posts = await Promise.all(ids.map(id => postStatus(id).catch(e => ({ id, error: e.message }))));
        return { posts };
    }
};

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method !== 'POST') throw new HttpError(405, 'Use POST', 'method');
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = actions[body.action];
        if (!action) throw new HttpError(400, 'Unknown action', 'input');
        const header = req.headers.authorization || req.headers.Authorization || '';
        await verifyAgency(header.replace(/^Bearer\s+/i, ''));
        if (!process.env.POSTFORME_API_KEY) throw new HttpError(503, 'Post for Me is not set up yet', 'not_configured');
        res.status(200).json(await action(body));
    } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        res.status(status).json({ error: e instanceof HttpError ? e.message : 'Server error', code: e.code || 'server' });
    }
}

export const _test = { cleanPost, tokenCache };
