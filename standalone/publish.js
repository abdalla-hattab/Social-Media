// "النشر" tab: a Metricool-style planner for every client. Posts are the same cards the client
// calendar shows (board.cards); scheduling and publishing go through /api/social (Post for Me).
// Loaded after app_v140.js and workspace.js; uses their globals (boards, saveState, render,
// agencyIdToken, showToast).
(function () {
    const API_URL = '/api/social';
    const CLIENT_KEY = 'sm_pub_client';
    const VIEW_KEY = 'sm_pub_view';
    const NET_KEY = 'sm_pub_net';

    // Post for Me platform keys → label, colour and the key the client calendar uses in card.platforms
    const NETS = {
        instagram: { label: 'انستغرام', card: 'instagram', limit: 2200 },
        facebook: { label: 'فيسبوك', card: 'facebook', limit: 63206 },
        tiktok: { label: 'تيك توك', card: 'tiktok', limit: 2200 },
        tiktok_business: { label: 'تيك توك بزنس', card: 'tiktok', limit: 2200 },
        youtube: { label: 'يوتيوب', card: 'youtube', limit: 5000 },
        linkedin: { label: 'لينكدإن', card: 'linkedin', limit: 3000 },
        x: { label: 'X', card: 'twitter', limit: 280 },
        threads: { label: 'ثريدز', card: 'threads', limit: 500 },
        pinterest: { label: 'بنترست', card: 'pinterest', limit: 500 },
        bluesky: { label: 'بلوسكاي', card: 'bluesky', limit: 300 }
    };
    const CONNECTABLE = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'threads'];
    const CONNECT_NOTES = {
        instagram: 'لازم يكون الحساب Business أو Creator',
        facebook: 'بتختار صفحة الفيسبوك',
        tiktok: 'أي حساب تيك توك',
        youtube: 'قناة يوتيوب',
        linkedin: 'صفحة شركة بس',
        x: 'حساب X (تويتر)',
        threads: 'حساب ثريدز'
    };
    const STATE_LABELS = { draft: 'مسودة', scheduled: 'مجدول', processing: 'عم ينشر', published: 'انتشر', partial: 'انتشر جزئياً', failed: 'فشل' };
    const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const ICON_PATHS = {
        instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>',
        facebook: '<path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/>',
        tiktok: '<path d="M21 7.9V12a10 10 0 0 1-5-2v4.5a6.5 6.5 0 1 1-8-6.3v4.3a2.5 2.5 0 1 0 4 2V3h4.1A6 6 0 0 0 21 7.9z"/>',
        snapchat: '<path d="M16.9 7.8a4.9 4.9 0 0 0-9.8 0c0 4.3-.2 6.4-4.1 8.1 2 .9 2 .9 3 3 3 0 4 2 6 2s3-2 6-2c1-2.1 1-2.1 3-3-3.9-1.7-4.1-3.8-4.1-8.1z"/>',
        x: '<path d="M4 4l11.7 16H20L8.3 4zM4 20l6.8-6.8M13.2 10.8L20 4"/>',
        linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5M8 8v.01M12 16v-5M16 16v-3a2 2 0 0 0-4 0"/>',
        youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
        threads: '<path d="M16.5 11.2c-.3-3-2.2-4.6-4.9-4.6-3 0-5.1 2.2-5.1 5.4s2.1 5.4 5.3 5.4c2.6 0 4.6-1.5 4.6-3.8 0-2.1-1.7-3.3-4.2-3.3-2 0-3.2.9-3.2 2.2 0 1.2 1 2 2.4 2 2 0 3.1-1.4 3.1-4.3M19 7.5C17.6 4.7 15.2 3 12 3 6.9 3 3.5 6.6 3.5 12S6.9 21 12 21c3.6 0 6.2-1.8 7.3-5"/>',
        pinterest: '<circle cx="12" cy="12" r="9"/><path d="M11 8.5c2.8-.6 4.8.9 4.6 3.3-.2 2.1-1.7 3.6-3.4 3.4-1-.1-1.5-.8-1.4-1.6M12 11l-2.5 9"/>',
        bluesky: '<path d="M6.3 4.7C8.6 6.4 11 9.9 12 11.9c1-2 3.4-5.5 5.7-7.2 1.6-1.2 4.3-2.2 4.3.9 0 .6-.4 5.2-.6 5.9-.7 2.6-3.3 3.2-5.6 2.8 4 .7 5 3 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5L12 16l-.1 1c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.2-1.2-4.5 2.8-5.2-2.3.4-4.9-.2-5.6-2.8-.2-.7-.6-5.3-.6-5.9 0-3.1 2.7-2.1 4.3-.9z"/>',
        video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
        image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
        prev: '<path d="M9 6l6 6-6 6"/>',
        next: '<path d="M15 6l-6 6 6 6"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
        upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
        warn: '<path d="M12 3l9.5 17h-19zM12 10v4M12 17v.01"/>',
        error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
        copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
        trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
        refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
        heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
        comment: '<path d="M4 5h16v11H8l-4 4z"/>',
        send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
        bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
        music: '<path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/>'
    };
    const icon = (name, cls) => `<svg class="smp-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS[(NETS[name] || {}).card] || ''}</svg>`;
    const netIcon = net => `<span class="smp-net is-${net === 'tiktok_business' ? 'tiktok' : net}" title="${esc((NETS[net] || {}).label || net)}">${icon(net === 'tiktok_business' ? 'tiktok' : (net === 'twitter' ? 'x' : net))}</span>`;

    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const parseDay = str => {
        const p = String(str || '').split('-').map(n => parseInt(n, 10));
        return p.length === 3 && !p.some(isNaN) ? new Date(p[0], p[1], p[2]) : null;
    };
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const weekStart = d => addDays(startOfDay(d), -d.getDay());
    const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fromIsoDate = s => { const p = String(s || '').split('-').map(Number); return p.length === 3 && !p.some(isNaN) ? new Date(p[0], p[1] - 1, p[2]) : null; };
    const hue = s => { let h = 0; String(s).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; };
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
    };
    const toast = msg => { if (typeof showToast === 'function') showToast(msg); else alert(msg); };
    const plain = v => JSON.parse(JSON.stringify(v));

    const P = {
        clientId: store.get(CLIENT_KEY, 'all'),
        view: store.get(VIEW_KEY, 'week'),
        net: store.get(NET_KEY, 'all'),
        anchor: startOfDay(new Date())
    };

    // ---------- Data ----------

    function clientBoards() {
        return boards.filter(b => b && b.type === 'social_scheduler').slice(2).filter(b => !b.isInactive);
    }
    function findBoard(id) { return boards.find(b => b && b.id === id); }
    function findCard(boardId, cardId) {
        const b = findBoard(boardId);
        return b && (b.cards || []).find(c => c && c.id === cardId);
    }
    function scopeBoards() {
        const all = clientBoards();
        if (P.clientId === 'all') return all;
        const one = all.find(b => b.id === P.clientId);
        if (one) return [one];
        P.clientId = 'all';
        return all;
    }

    function pubState(card) {
        if (card.pfm && card.pfm.state) return card.pfm.state;
        if (card.status === 'فوري') return 'published';
        if (card.status === 'جدولة') {
            // Scheduled with the old system: once its day has passed it went out
            const day = parseDay(card.dateStr);
            return day && day < startOfDay(new Date()) ? 'published' : 'scheduled';
        }
        return 'draft';
    }
    function cardText(card) {
        return card.fullText || card.fullTextInstagram || card.fullTextTiktok || card.fullTextSnapchat || card.title || card.idea || '';
    }
    function cardThumb(card) {
        const m = (card.mediaItems || [])[0];
        if (!m) return '';
        if (m.thumb) return `<img src="${esc(m.thumb)}" alt="">`;
        const src = m.dataUrl || m.url || '';
        const isVideo = m.type === 'video' || src.startsWith('data:video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(src);
        if (src && !isVideo && m.type !== 'frame-io' && m.type !== 'product-link') return `<img src="${esc(src)}" alt="" loading="lazy">`;
        return `<span class="smp-thumb-ph">${icon(isVideo || m.type === 'frame-io' ? 'video' : 'image')}</span>`;
    }
    function postsIn(from, to) {
        const out = [];
        scopeBoards().forEach(board => (board.cards || []).forEach(card => {
            if (!card || card.isClientDayNote) return;
            const day = parseDay(card.dateStr);
            if (!day || day < from || day >= to) return;
            if (P.net !== 'all' && !(card.platforms || []).includes((NETS[P.net] || {}).card || P.net)) return;
            out.push({ board, card, day });
        }));
        return out.sort((a, b) => (a.day - b.day) || (a.card.timeStr || '99').localeCompare(b.card.timeStr || '99'));
    }

    // ---------- Server ----------

    async function api(action, payload) {
        let token;
        try { token = await agencyIdToken(); } catch (e) { throw Object.assign(new Error('سجّل دخول مرة تانية'), { code: 'auth' }); }
        let res;
        try {
            res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(Object.assign({ action }, payload || {}))
            });
        } catch (e) {
            throw Object.assign(new Error('ما في اتصال بالإنترنت'), { code: 'network' });
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || ('خطأ ' + res.status)), { code: data.code || 'server', status: res.status });
        return data;
    }
    function errorText(e) {
        if (!e) return 'صار خطأ';
        if (e.code === 'not_configured') return 'لسا ما ربطنا Post for Me بالموقع';
        if (e.code === 'auth') return 'سجّل دخول مرة تانية';
        if (e.code === 'forbidden') return 'حسابك مش بقائمة فريق الوكالة';
        if (e.code === 'network') return 'ما في اتصال بالإنترنت';
        return e.message || 'صار خطأ';
    }

    const accounts = { list: null, at: 0, error: null, loading: null };
    function loadAccounts(force) {
        if (!force && accounts.list && Date.now() - accounts.at < 60000) return Promise.resolve(accounts.list);
        if (accounts.loading) return accounts.loading;
        accounts.loading = api('accounts')
            .then(r => { accounts.list = r.accounts || []; accounts.at = Date.now(); accounts.error = null; return accounts.list; })
            .catch(e => { accounts.error = e; accounts.at = Date.now(); return accounts.list || []; })
            .finally(() => { accounts.loading = null; refreshViews(); });
        return accounts.loading;
    }
    const accountsOf = boardId => (accounts.list || []).filter(a => a.clientId === boardId);

    // Asks Post for Me how posts whose time has come went, and saves the outcome on the cards
    let lastSync = 0;
    async function syncStatuses(force) {
        if (!force && Date.now() - lastSync < 60000) return;
        lastSync = Date.now();
        const pending = [];
        boards.filter(b => b && b.type === 'social_scheduler').forEach(board => (board.cards || []).forEach(card => {
            const p = card && card.pfm;
            if (!p || !p.id) return;
            const due = p.state === 'processing' || (p.state === 'scheduled' && p.scheduledAt && Date.parse(p.scheduledAt) <= Date.now() + 30000);
            if (due) pending.push(card);
        }));
        if (!pending.length) return;
        let changed = false;
        for (let i = 0; i < pending.length; i += 40) {
            const chunk = pending.slice(i, i + 40);
            let r;
            try { r = await api('status', { ids: chunk.map(c => c.pfm.id) }); } catch (e) { return; }
            (r.posts || []).forEach(post => {
                const card = chunk.find(c => c.pfm.id === post.id);
                if (!card || post.error || !post.results || !post.results.length) return;
                const ok = post.results.filter(x => x.success).length;
                card.pfm.state = ok === post.results.length ? 'published' : (ok === 0 ? 'failed' : 'partial');
                card.pfm.results = post.results;
                card.pfm.checkedAt = Date.now();
                changed = true;
            });
        }
        if (changed) { saveState(); render(); }
    }

    // ---------- Planner ----------

    function rangeFor() {
        const a = P.anchor;
        if (P.view === 'month') {
            const first = new Date(a.getFullYear(), a.getMonth(), 1);
            const from = weekStart(first);
            return { from, to: addDays(from, 42), label: `${MONTHS[a.getMonth()]} ${a.getFullYear()}` };
        }
        if (P.view === 'list') {
            const from = startOfDay(a);
            const to = addDays(from, 30);
            return { from, to, label: `من ${from.getDate()} ${MONTHS[from.getMonth()]} لـ ${addDays(to, -1).getDate()} ${MONTHS[addDays(to, -1).getMonth()]}` };
        }
        const from = weekStart(a);
        const to = addDays(from, 7);
        const last = addDays(to, -1);
        const label = from.getMonth() === last.getMonth()
            ? `${from.getDate()} – ${last.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()}`
            : `${from.getDate()} ${MONTHS[from.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
        return { from, to, label };
    }

    function postCardHtml(item, compact) {
        const { board, card } = item;
        const st = pubState(card);
        const nets = (card.platforms || []).map(p => netIcon(p === 'twitter' ? 'x' : p)).join('');
        const text = cardText(card);
        if (compact) {
            return `<button type="button" class="smp-chip is-${st}" data-board="${esc(board.id)}" data-card="${esc(card.id)}" title="${esc(text)}">
                <span class="smp-chip-dot"></span><span class="smp-chip-time">${esc(card.timeStr || '')}</span><span class="smp-chip-text">${esc(text) || 'بدون نص'}</span>
            </button>`;
        }
        return `<button type="button" class="smp-post is-${st}" data-board="${esc(board.id)}" data-card="${esc(card.id)}">
            <span class="smp-post-top"><span class="smp-post-time">${esc(card.timeStr || '—')}</span><span class="smp-post-nets">${nets}</span></span>
            <span class="smp-post-body">${cardThumb(card) ? `<span class="smp-post-thumb">${cardThumb(card)}</span>` : ''}<span class="smp-post-text">${esc(text) || '<em>بدون نص</em>'}</span></span>
            <span class="smp-post-foot"><span class="smp-state is-${st}">${STATE_LABELS[st]}</span>${P.clientId === 'all' ? `<span class="smp-post-client">${esc(board.title)}</span>` : ''}</span>
        </button>`;
    }

    function weekHtml(range) {
        const today = startOfDay(new Date());
        const items = postsIn(range.from, range.to);
        let html = '<div class="smp-week">';
        for (let i = 0; i < 7; i++) {
            const d = addDays(range.from, i);
            const list = items.filter(x => sameDay(x.day, d));
            html += `<div class="smp-day${sameDay(d, today) ? ' is-today' : ''}${d < today ? ' is-past' : ''}" data-day="${dayStr(d)}">
                <div class="smp-day-head"><span>${DAYS[d.getDay()]}</span><b>${d.getDate()}</b></div>
                <div class="smp-day-body">${list.map(x => postCardHtml(x)).join('')}</div>
                ${d < today ? '' : `<button type="button" class="smp-day-add" data-new="${dayStr(d)}" aria-label="منشور جديد يوم ${d.getDate()}">${icon('plus')}</button>`}
            </div>`;
        }
        return html + '</div>';
    }

    function monthHtml(range) {
        const today = startOfDay(new Date());
        const items = postsIn(range.from, range.to);
        let html = `<div class="smp-month"><div class="smp-month-head">${DAYS.map(d => `<span>${d}</span>`).join('')}</div><div class="smp-month-grid">`;
        for (let i = 0; i < 42; i++) {
            const d = addDays(range.from, i);
            const list = items.filter(x => sameDay(x.day, d));
            const out = d.getMonth() !== P.anchor.getMonth();
            html += `<div class="smp-mcell${out ? ' is-out' : ''}${sameDay(d, today) ? ' is-today' : ''}${d < today ? ' is-past' : ''}" data-day="${dayStr(d)}">
                <div class="smp-mcell-top"><button type="button" class="smp-mcell-num" data-goto="${dayStr(d)}">${d.getDate()}</button>${d < today ? '' : `<button type="button" class="smp-mcell-add" data-new="${dayStr(d)}" aria-label="منشور جديد">${icon('plus')}</button>`}</div>
                <div class="smp-mcell-body">${list.slice(0, 3).map(x => postCardHtml(x, true)).join('')}${list.length > 3 ? `<button type="button" class="smp-mcell-more" data-goto="${dayStr(d)}">+${list.length - 3}</button>` : ''}</div>
                ${list.length ? `<div class="smp-mcell-dots">${list.slice(0, 6).map(x => `<i class="is-${pubState(x.card)}"></i>`).join('')}</div>` : ''}
            </div>`;
        }
        return html + '</div></div>';
    }

    function listHtml(range) {
        const items = postsIn(range.from, range.to);
        if (!items.length) return '<div class="smp-empty">ما في منشورات بهالفترة. اضغط «منشور جديد» عشان تبلّش.</div>';
        const groups = [];
        items.forEach(x => {
            const g = groups[groups.length - 1];
            if (g && sameDay(g.day, x.day)) g.list.push(x); else groups.push({ day: x.day, list: [x] });
        });
        return '<div class="smp-list">' + groups.map(g => `
            <div class="smp-list-group">
                <div class="smp-list-day">${DAYS[g.day.getDay()]} ${g.day.getDate()} ${MONTHS[g.day.getMonth()]}<span>${g.list.length}</span></div>
                <div class="smp-list-items">${g.list.map(x => postCardHtml(x)).join('')}</div>
            </div>`).join('') + '</div>';
    }

    function accountAvatar(a, small) {
        const initial = esc((a.name || a.username || '?').trim().charAt(0).toUpperCase());
        return `<span class="smp-acc${small ? ' is-small' : ''}" title="${esc((NETS[a.platform] || {}).label || a.platform)} · ${esc(a.name || a.username)}">
            ${a.photo ? `<img src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="smp-acc-initial" style="--h:${hue(a.username || a.id)}">${initial}</span>`}
            ${netIcon(a.platform)}
        </span>`;
    }

    function bannerHtml() {
        if (!accounts.error) return '';
        if (accounts.error.code === 'not_configured') {
            return `<div class="smp-banner is-setup">${icon('warn')}<div><b>النشر لسا مش شغّال</b><span>لازم نحط مفتاح Post for Me بإعدادات الموقع. هاي خطوة وحدة وبتخلص.</span></div></div>`;
        }
        return `<div class="smp-banner is-error">${icon('error')}<div><b>ما قدرنا نجيب الحسابات المربوطة</b><span>${esc(errorText(accounts.error))}</span></div><button type="button" class="smp-btn" data-act="reload-accounts">${icon('refresh')} جرّب مرة تانية</button></div>`;
    }

    function plannerHtml() {
        const clients = clientBoards();
        const scope = scopeBoards();
        const range = rangeFor();
        const current = P.clientId === 'all' ? null : scope[0];
        const accs = current ? accountsOf(current.id) : (accounts.list || []);
        const weekCounts = {};
        const ws = weekStart(new Date());
        clients.forEach(b => {
            weekCounts[b.id] = (b.cards || []).filter(c => { const d = c && !c.isClientDayNote && parseDay(c.dateStr); return d && d >= ws && d < addDays(ws, 7); }).length;
        });
        const presentNets = Array.from(new Set((accounts.list || []).map(a => a.platform)));

        const side = `<aside class="smp-side">
            <div class="smp-side-title">العملاء</div>
            <input type="search" class="smp-search" placeholder="دوّر على عميل" aria-label="دوّر على عميل" autocomplete="off">
            <div class="smp-clients">
                <button type="button" class="smp-client${P.clientId === 'all' ? ' is-active' : ''}" data-client="all">
                    <span class="smp-client-avatar is-all">${icon('image')}</span><span class="smp-client-name">كل العملاء</span>
                </button>
                ${clients.map(b => {
                    const nets = Array.from(new Set(accountsOf(b.id).map(a => a.platform)));
                    return `<button type="button" class="smp-client${P.clientId === b.id ? ' is-active' : ''}" data-client="${esc(b.id)}" data-name="${esc(b.title)}">
                        <span class="smp-client-avatar" style="--h:${hue(b.id)}">${esc((b.title || '?').trim().charAt(0))}</span>
                        <span class="smp-client-main"><span class="smp-client-name">${esc(b.title)}</span><span class="smp-client-nets">${nets.length ? nets.map(netIcon).join('') : '<span class="smp-client-none">ما في حسابات</span>'}</span></span>
                        ${weekCounts[b.id] ? `<span class="smp-client-count" title="منشورات هالأسبوع">${weekCounts[b.id]}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>
        </aside>`;

        const head = `<div class="smp-head">
            <div class="smp-head-info">
                <select class="smp-client-select" aria-label="العميل">
                    <option value="all">كل العملاء</option>
                    ${clients.map(b => `<option value="${esc(b.id)}"${P.clientId === b.id ? ' selected' : ''}>${esc(b.title)}</option>`).join('')}
                </select>
                <h2 class="smp-title">${current ? esc(current.title) : 'كل العملاء'}</h2>
                <div class="smp-head-accounts">
                    ${current ? (accs.length ? accs.map(a => accountAvatar(a, true)).join('') : '<span class="smp-muted">ما في حسابات مربوطة لهالعميل</span>') : `<span class="smp-muted">${(accounts.list || []).length} حساب مربوط</span>`}
                    ${current ? `<button type="button" class="smp-btn is-ghost" data-act="accounts">${icon('link')} ${accs.length ? 'الحسابات' : 'ربط حساب'}</button>` : ''}
                </div>
            </div>
            <div class="smp-head-tools">
                <div class="smp-seg" role="group" aria-label="طريقة العرض">
                    ${[['week', 'أسبوع'], ['month', 'شهر'], ['list', 'قائمة']].map(([k, l]) => `<button type="button" data-view-mode="${k}" class="${P.view === k ? 'is-active' : ''}">${l}</button>`).join('')}
                </div>
                <div class="smp-nav">
                    <button type="button" class="smp-icon-btn" data-shift="-1" aria-label="اللي قبل">${icon('prev')}</button>
                    <button type="button" class="smp-btn is-ghost" data-shift="0">اليوم</button>
                    <button type="button" class="smp-icon-btn" data-shift="1" aria-label="اللي بعد">${icon('next')}</button>
                    <span class="smp-range">${esc(range.label)}</span>
                </div>
                <select class="smp-net-select" aria-label="الشبكة">
                    <option value="all">كل الشبكات</option>
                    ${presentNets.map(n => `<option value="${n}"${P.net === n ? ' selected' : ''}>${esc(NETS[n] ? NETS[n].label : n)}</option>`).join('')}
                </select>
                <button type="button" class="smp-btn is-primary" data-act="new">${icon('plus')} منشور جديد</button>
            </div>
        </div>`;

        const body = P.view === 'month' ? monthHtml(range) : (P.view === 'list' ? listHtml(range) : weekHtml(range));
        const legend = `<div class="smp-legend">${['draft', 'scheduled', 'published', 'failed'].map(s => `<span><i class="is-${s}"></i>${STATE_LABELS[s]}</span>`).join('')}</div>`;
        return `<div class="smp">${side}<main class="smp-main">${head}${bannerHtml()}${body}${legend}</main></div>`;
    }

    let mountedRoot = null;
    function mount(root) {
        mountedRoot = root;
        root.innerHTML = plannerHtml();
        bindPlanner(root);
        if (!accounts.list && !accounts.loading && !accounts.error) loadAccounts();
        syncStatuses(false);
    }
    function refreshViews() {
        if (mountedRoot && document.body.contains(mountedRoot)) {
            mountedRoot.innerHTML = plannerHtml();
            bindPlanner(mountedRoot);
        }
        if (composer) renderAccountsPicker();
        if (accountsModal) renderAccountsModal();
    }

    function bindPlanner(root) {
        const search = root.querySelector('.smp-search');
        if (search) search.addEventListener('input', () => {
            const q = search.value.trim();
            root.querySelectorAll('.smp-client[data-name]').forEach(el => { el.hidden = q && !el.dataset.name.includes(q); });
        });
        const clientSelect = root.querySelector('.smp-client-select');
        if (clientSelect) clientSelect.addEventListener('change', () => setClient(clientSelect.value));
        const netSelect = root.querySelector('.smp-net-select');
        if (netSelect) netSelect.addEventListener('change', () => { P.net = netSelect.value; store.set(NET_KEY, P.net); refreshViews(); });

        if (root._smpBound) return;
        root._smpBound = true;
        root.addEventListener('click', e => {
            const t = e.target.closest('button');
            if (!t || !root.contains(t)) return;
            if (t.dataset.client) return setClient(t.dataset.client);
            if (t.dataset.viewMode) { P.view = t.dataset.viewMode; store.set(VIEW_KEY, P.view); return refreshViews(); }
            if (t.dataset.shift !== undefined) {
                const n = parseInt(t.dataset.shift, 10);
                if (n === 0) P.anchor = startOfDay(new Date());
                else if (P.view === 'month') P.anchor = new Date(P.anchor.getFullYear(), P.anchor.getMonth() + n, 1);
                else P.anchor = addDays(P.anchor, n * (P.view === 'list' ? 30 : 7));
                return refreshViews();
            }
            if (t.dataset.goto) { P.anchor = parseDay(t.dataset.goto); P.view = 'week'; store.set(VIEW_KEY, 'week'); return refreshViews(); }
            if (t.dataset.new) return openComposer({ boardId: P.clientId === 'all' ? null : P.clientId, day: parseDay(t.dataset.new) });
            if (t.dataset.card) return openComposer({ boardId: t.dataset.board, cardId: t.dataset.card });
            if (t.dataset.act === 'new') return openComposer({ boardId: P.clientId === 'all' ? null : P.clientId });
            if (t.dataset.act === 'accounts') return openAccountsModal(P.clientId);
            if (t.dataset.act === 'reload-accounts') { accounts.error = null; return loadAccounts(true); }
        });
    }

    function setClient(id) {
        P.clientId = id;
        store.set(CLIENT_KEY, id);
        refreshViews();
    }

    // ---------- Composer ----------

    let composer = null;   // the open composer's state
    let composerEl = null;

    function defaultTime(day) {
        const now = new Date();
        if (day && !sameDay(day, now)) return '12:00';
        const t = new Date(now.getTime() + 60 * 60 * 1000);
        return `${pad(t.getHours())}:00`;
    }

    function mediaFromCard(card) {
        return (card.mediaItems || []).map((m, i) => {
            const src = m.url || m.dataUrl || '';
            if (m.type === 'frame-io' || m.type === 'product-link') return { key: 'm' + i, kind: 'unsupported', label: m.type === 'frame-io' ? 'Frame.io' : 'رابط', url: '', status: 'ready', source: 'existing' };
            const kind = m.type === 'video' || src.startsWith('data:video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(src) ? 'video' : 'image';
            const isData = src.startsWith('data:');
            return { key: 'm' + i, kind, url: isData ? '' : src, dataSrc: isData ? src : '', thumb: m.thumb || (kind === 'image' ? src : ''), w: m.w, h: m.h, duration: m.duration, status: 'ready', source: isData ? 'data' : 'existing' };
        }).filter(m => m.url || m.dataSrc || m.kind === 'unsupported');
    }

    function openComposer(opts) {
        closeComposer();
        const card = opts.cardId ? findCard(opts.boardId, opts.cardId) : null;
        const day = card ? parseDay(card.dateStr) : (opts.day || startOfDay(new Date()));
        composer = {
            boardId: opts.boardId || (P.clientId !== 'all' ? P.clientId : null),
            cardId: card ? card.id : null,
            existing: !!card,
            state: card ? pubState(card) : 'draft',
            pfm: card && card.pfm ? plain(card.pfm) : null,
            caption: card ? (card.fullText || card.fullTextInstagram || '') : '',
            overrides: card && card.captions ? plain(card.captions) : {},
            selected: new Set(card && card.accountIds ? card.accountIds : []),
            pickedDefault: !!card,
            media: card ? mediaFromCard(card) : [],
            opts: card && card.publishOptions ? plain(card.publishOptions) : {},
            touched: new Set(card && card.publishOptions ? Object.keys(card.publishOptions) : []),
            tab: 'all',
            previewNet: null,
            date: isoDate(day),
            time: card && card.timeStr ? card.timeStr : defaultTime(day),
            busy: false
        };
        // Trying again after a partial failure: only the accounts that failed are ticked
        if (card && card.pfm && card.pfm.state === 'partial' && Array.isArray(card.pfm.results)) {
            const failed = card.pfm.results.filter(x => !x.success).map(x => x.accountId);
            if (failed.length) composer.selected = new Set(failed);
        }
        if (card && !card.captions) {
            if (card.fullTextTiktok && card.fullTextTiktok !== composer.caption) composer.overrides.tiktok = card.fullTextTiktok;
            if (card.fullTextInstagram && card.fullTextInstagram !== composer.caption && composer.caption) composer.overrides.instagram = card.fullTextInstagram;
            if (!composer.caption) composer.caption = card.fullTextInstagram || card.fullTextTiktok || card.fullTextSnapchat || '';
        }

        composerEl = document.createElement('div');
        composerEl.className = 'smp-overlay';
        composerEl.id = 'smpComposer';
        composerEl.innerHTML = composerShellHtml();
        document.body.appendChild(composerEl);
        document.documentElement.classList.add('smp-lock');
        bindComposer();
        renderComposer();
        if (!accounts.list) loadAccounts();
        const ta = composerEl.querySelector('.smp-textarea');
        if (ta && window.matchMedia('(pointer: fine)').matches) ta.focus();
    }

    function closeComposer() {
        if (composerEl) composerEl.remove();
        composerEl = null;
        composer = null;
        document.documentElement.classList.remove('smp-lock');
    }

    function composerShellHtml() {
        const c = composer;
        return `<div class="smp-modal" role="dialog" aria-modal="true" aria-label="منشور">
            <div class="smp-modal-head">
                <div>
                    <div class="smp-modal-eyebrow">${c.existing ? 'تعديل منشور' : 'منشور جديد'}</div>
                    <select class="smp-composer-client" aria-label="العميل">
                        ${c.boardId ? '' : '<option value="">اختار العميل</option>'}
                        ${clientBoards().map(b => `<option value="${esc(b.id)}"${b.id === c.boardId ? ' selected' : ''}>${esc(b.title)}</option>`).join('')}
                    </select>
                </div>
                <button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${icon('close')}</button>
            </div>
            <div class="smp-modal-body">
                <div class="smp-form">
                    <div class="smp-status-box"></div>
                    <section class="smp-field">
                        <div class="smp-label">انشر على</div>
                        <div class="smp-picker"></div>
                    </section>
                    <section class="smp-field">
                        <div class="smp-tabs"></div>
                        <div class="smp-editor">
                            <textarea class="smp-textarea" rows="7" dir="auto" placeholder="اكتب نص المنشور هون…"></textarea>
                            <div class="smp-editor-foot"><span class="smp-counter"></span><button type="button" class="smp-link-btn smp-reset-override" hidden>رجّع للنص العام</button></div>
                        </div>
                    </section>
                    <section class="smp-field">
                        <div class="smp-label">صور وفيديو</div>
                        <div class="smp-media"></div>
                        <input type="file" class="smp-file" accept="image/*,video/*" multiple hidden>
                        <div class="smp-url-row"><input type="url" class="smp-url" placeholder="أو حط رابط مباشر لصورة أو فيديو (https://…)" dir="ltr"><button type="button" class="smp-btn" data-add-url>أضف</button></div>
                    </section>
                    <section class="smp-field smp-options"></section>
                    <section class="smp-field smp-when">
                        <div class="smp-label">موعد النشر</div>
                        <div class="smp-when-row">
                            <input type="date" class="smp-date" value="${c.date}">
                            <input type="time" class="smp-time" value="${c.time}">
                        </div>
                    </section>
                    <div class="smp-issues"></div>
                </div>
                <aside class="smp-preview-col">
                    <div class="smp-label">معاينة</div>
                    <div class="smp-preview-tabs"></div>
                    <div class="smp-preview"></div>
                </aside>
            </div>
            <div class="smp-modal-foot"></div>
        </div>`;
    }

    const selectedAccounts = () => accountsOf(composer.boardId).filter(a => composer.selected.has(a.id));
    const selectedNets = () => Array.from(new Set(selectedAccounts().map(a => a.platform)));
    const captionFor = net => (composer.overrides[net] !== undefined ? composer.overrides[net] : composer.caption);
    const readyMedia = () => composer.media.filter(m => m.kind === 'image' || m.kind === 'video');

    function renderComposer() {
        renderAccountsPicker();
        renderStatusBox();
        renderMedia();
        renderFooter();
    }

    function renderStatusBox() {
        const box = composerEl.querySelector('.smp-status-box');
        const c = composer;
        if (!c.existing || c.state === 'draft') { box.innerHTML = ''; return; }
        const results = (c.pfm && c.pfm.results) || [];
        const accs = accounts.list || [];
        const rows = results.map(r => {
            const a = accs.find(x => x.id === r.accountId);
            return `<li class="${r.success ? 'is-ok' : 'is-bad'}">${icon(r.success ? 'check' : 'error')}<span>${a ? esc((NETS[a.platform] || {}).label + ' · ' + (a.name || a.username)) : 'حساب'}</span>${r.success ? (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">شوف المنشور</a>` : '') : `<em>${esc(r.error || 'فشل')}</em>`}</li>`;
        }).join('');
        const title = { scheduled: 'هالمنشور مجدول', processing: 'عم ينشر هلّق…', published: 'هالمنشور انتشر', partial: 'انتشر على بعض الحسابات بس', failed: 'ما انتشر' }[c.state] || '';
        const sub = c.state === 'scheduled' ? 'أي تعديل بتعمله وبتضغط «حفظ الجدولة» بيتحدّث عند المنصات كمان.'
            : (c.state === 'partial' ? 'علّمنا بس الحسابات اللي فشلت. صلّح المشكلة واضغط «انشر الآن» أو «جدولة».'
            : (c.state === 'failed' ? 'صلّح المشكلة واضغط «انشر الآن» أو «جدولة» مرة تانية.' : ''));
        box.innerHTML = `<div class="smp-status is-${c.state}"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${rows ? `<ul>${rows}</ul>` : ''}${c.pfm && c.pfm.id && (c.state === 'processing' || c.state === 'scheduled') ? `<button type="button" class="smp-link-btn" data-check-status>${icon('refresh')} حدّث الحالة</button>` : ''}</div>`;
    }

    function renderAccountsPicker() {
        if (!composerEl) return;
        const c = composer;
        const box = composerEl.querySelector('.smp-picker');
        if (!c.boardId) { box.innerHTML = '<div class="smp-muted">اختار العميل من فوق أول.</div>'; renderTabs(); renderPreview(); renderIssues(); return; }
        if (!accounts.list && accounts.loading) { box.innerHTML = '<div class="smp-muted">عم نجيب الحسابات…</div>'; return; }
        const accs = accountsOf(c.boardId);
        if (!c.pickedDefault && accs.length) { accs.forEach(a => c.selected.add(a.id)); c.pickedDefault = true; }
        if (!accs.length) {
            box.innerHTML = `<div class="smp-picker-empty">${accounts.error ? esc(errorText(accounts.error)) : 'هالعميل ما إله حسابات مربوطة.'} <button type="button" class="smp-btn is-ghost" data-open-accounts>${icon('link')} ربط حساب</button></div>`;
        } else {
            box.innerHTML = accs.map(a => `<button type="button" class="smp-pick${c.selected.has(a.id) ? ' is-on' : ''}" data-acc="${esc(a.id)}" aria-pressed="${c.selected.has(a.id)}">
                ${accountAvatar(a)}<span class="smp-pick-name">${esc(a.name || a.username)}</span><span class="smp-pick-check">${icon('check')}</span>
            </button>`).join('') + `<button type="button" class="smp-pick is-add" data-open-accounts aria-label="ربط حساب">${icon('plus')}</button>`;
        }
        renderTabs();
        renderOptions();
        renderPreview();
        renderIssues();
    }

    function renderTabs() {
        const nets = selectedNets();
        if (composer.tab !== 'all' && !nets.includes(composer.tab)) composer.tab = 'all';
        const tabs = composerEl.querySelector('.smp-tabs');
        tabs.innerHTML = `<button type="button" data-tab="all" class="${composer.tab === 'all' ? 'is-active' : ''}">النص للكل</button>` +
            nets.map(n => `<button type="button" data-tab="${n}" class="${composer.tab === n ? 'is-active' : ''}">${netIcon(n)}${esc(NETS[n] ? NETS[n].label : n)}${composer.overrides[n] !== undefined ? '<i class="smp-dot"></i>' : ''}</button>`).join('');
        const ta = composerEl.querySelector('.smp-textarea');
        const value = composer.tab === 'all' ? composer.caption : captionFor(composer.tab);
        if (ta.value !== value) ta.value = value;
        ta.placeholder = composer.tab === 'all' ? 'اكتب نص المنشور هون…' : `نص خاص بـ ${NETS[composer.tab].label} (إذا بدك يختلف عن الباقي)`;
        composerEl.querySelector('.smp-reset-override').hidden = composer.tab === 'all' || composer.overrides[composer.tab] === undefined;
        renderCounter();
    }

    function renderCounter() {
        const el = composerEl.querySelector('.smp-counter');
        const nets = composer.tab === 'all' ? selectedNets() : [composer.tab];
        const parts = nets.map(n => {
            const len = Array.from(captionFor(n)).length;
            const limit = (NETS[n] || {}).limit || 5000;
            return `<span class="${len > limit ? 'is-over' : ''}">${netIcon(n)}${len}/${limit}</span>`;
        });
        el.innerHTML = parts.length ? parts.join('') : `<span>${Array.from(composer.caption).length} حرف</span>`;
    }

    function renderMedia() {
        Object.keys(composer.opts).forEach(net => { if (!composer.touched.has(net)) composer.opts[net] = defaultOpts(net); });
        const box = composerEl.querySelector('.smp-media');
        box.innerHTML = composer.media.map(m => {
            let inner;
            if (m.kind === 'unsupported') inner = `<span class="smp-media-ph">${icon('video')}<small>${esc(m.label)}</small></span>`;
            else if (m.thumb || m.preview) inner = `<img src="${esc(m.thumb || m.preview)}" alt="">`;
            else inner = `<span class="smp-media-ph">${icon(m.kind)}</span>`;
            const badge = m.kind === 'video' ? `<span class="smp-media-badge">${icon('video')}${m.duration ? Math.round(m.duration) + 'ث' : ''}</span>` : '';
            const progress = m.status === 'uploading' ? `<span class="smp-media-progress"><i style="width:${Math.round((m.progress || 0) * 100)}%"></i></span>` : '';
            const err = m.status === 'error' ? `<button type="button" class="smp-media-retry" data-retry="${m.key}">${icon('refresh')} جرّب</button>` : '';
            return `<div class="smp-media-item is-${m.status}${m.kind === 'unsupported' ? ' is-unsupported' : ''}">${inner}${badge}${progress}${err}<button type="button" class="smp-media-remove" data-remove="${m.key}" aria-label="شيل">${icon('close')}</button></div>`;
        }).join('') + `<button type="button" class="smp-media-add" data-pick-files>${icon('upload')}<span>اسحب أو اختار صور وفيديو</span></button>`;
        renderPreview();
        renderIssues();
        renderOptions();
    }

    function defaultOpts(net) {
        const hasVideo = readyMedia().some(m => m.kind === 'video');
        if (net === 'instagram') return { placement: hasVideo && readyMedia().length === 1 ? 'reels' : 'timeline' };
        if (net === 'facebook') return { placement: 'timeline' };
        if (net === 'tiktok' || net === 'tiktok_business') return { privacy_status: 'public', allow_comment: true, allow_duet: true, allow_stitch: true };
        if (net === 'youtube') return { title: '', privacy_status: 'public' };
        return {};
    }
    const optsFor = net => {
        if (!composer.opts[net]) composer.opts[net] = defaultOpts(net);
        return composer.opts[net];
    };

    function renderOptions() {
        const box = composerEl.querySelector('.smp-options');
        const nets = selectedNets().filter(n => ['instagram', 'facebook', 'tiktok', 'tiktok_business', 'youtube'].includes(n));
        if (!nets.length) { box.innerHTML = ''; return; }
        const seg = (net, key, choices) => `<div class="smp-seg is-small">${choices.map(([v, l]) => `<button type="button" data-opt="${net}.${key}" data-val="${v}" class="${optsFor(net)[key] === v ? 'is-active' : ''}">${l}</button>`).join('')}</div>`;
        box.innerHTML = '<div class="smp-label">إعدادات كل منصة</div>' + nets.map(n => {
            const o = optsFor(n);
            let body = '';
            if (n === 'instagram' || n === 'facebook') body = seg(n, 'placement', [['timeline', 'منشور'], ['reels', 'ريلز'], ['stories', 'ستوري']]);
            if (n === 'tiktok' || n === 'tiktok_business') {
                body = `<select data-opt-select="${n}.privacy_status">${[['public', 'الكل بيشوفه'], ['followers', 'المتابعين بس'], ['friends', 'الأصدقاء بس'], ['private', 'خاص']].map(([v, l]) => `<option value="${v}"${o.privacy_status === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
                    <label class="smp-check"><input type="checkbox" data-opt-check="${n}.allow_comment"${o.allow_comment !== false ? ' checked' : ''}> التعليقات</label>
                    <label class="smp-check"><input type="checkbox" data-opt-check="${n}.allow_duet"${o.allow_duet !== false ? ' checked' : ''}> ديو</label>
                    <label class="smp-check"><input type="checkbox" data-opt-check="${n}.allow_stitch"${o.allow_stitch !== false ? ' checked' : ''}> ستيتش</label>`;
            }
            if (n === 'youtube') {
                body = `<input type="text" class="smp-input" data-opt-text="youtube.title" maxlength="100" placeholder="عنوان الفيديو (لازم)" value="${esc(o.title || '')}" dir="auto">
                    <select data-opt-select="youtube.privacy_status">${[['public', 'عام'], ['unlisted', 'غير مدرج'], ['private', 'خاص']].map(([v, l]) => `<option value="${v}"${o.privacy_status === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
            }
            return `<div class="smp-opt-row"><span class="smp-opt-net">${netIcon(n)}${esc(NETS[n].label)}</span><div class="smp-opt-body">${body}</div></div>`;
        }).join('');
    }

    // Problems that block publishing (error) or that the team should look at (warn)
    function checkPost(forSchedule) {
        const c = composer;
        const out = [];
        const add = (level, text) => out.push({ level, text });
        const media = readyMedia();
        const videos = media.filter(m => m.kind === 'video');
        const images = media.filter(m => m.kind === 'image');
        if (!c.boardId) add('error', 'اختار العميل');
        if (c.boardId && !selectedAccounts().length) add('error', 'اختار حساب واحد على الأقل');
        if (!c.caption.trim() && !media.length && !Object.values(c.overrides).some(v => v && v.trim())) add('error', 'اكتب نص أو حط صورة أو فيديو');
        if (c.media.some(m => m.status === 'uploading')) add('error', 'استنى لحد ما يخلص رفع الملفات');
        if (c.media.some(m => m.status === 'error')) add('error', 'في ملف ما انرفع. جرّب ترفعه مرة تانية أو شيله');
        if (c.media.some(m => m.kind === 'unsupported')) add('warn', 'روابط Frame.io ما بتنشر لحالها: نزّل الفيديو وارفعه هون');

        selectedNets().forEach(n => {
            const L = NETS[n].label;
            const text = captionFor(n);
            const len = Array.from(text).length;
            if (len > NETS[n].limit) add('error', `${L}: النص أطول من المسموح (${len} من ${NETS[n].limit})`);
            const o = optsFor(n);
            if (n === 'instagram') {
                if (!media.length) add('error', 'انستغرام بدّه صورة أو فيديو');
                if (media.length > 10) add('error', 'انستغرام: أكثر شي 10 صور أو فيديوهات بالمنشور');
                if ((text.match(/#[^\s#]+/g) || []).length > 30) add('error', 'انستغرام: أكثر شي 30 هاشتاق');
                if (o.placement === 'reels' && (videos.length !== 1 || images.length)) add('error', 'انستغرام ريلز بدّه فيديو واحد بس');
                if (o.placement === 'stories' && media.length > 1) add('warn', 'انستغرام: كل صورة أو فيديو بينزل ستوري لحاله');
                videos.forEach(v => {
                    if (v.duration && o.placement === 'stories' && v.duration > 60) add('warn', 'انستغرام: الستوري أطول من 60 ثانية رح ينقص');
                    if (v.duration && v.duration > 900) add('error', 'انستغرام: الفيديو أطول من 15 دقيقة');
                    if (v.w && v.h && o.placement !== 'timeline' && Math.abs(v.w / v.h - 9 / 16) > 0.08) add('warn', 'انستغرام: الريلز والستوري أحلى بمقاس طولي 9:16');
                });
                images.forEach(m => { if (m.w && m.h && o.placement === 'timeline' && (m.w / m.h < 0.8 || m.w / m.h > 1.91)) add('warn', 'انستغرام: في صورة مقاسها رح ينقص (المسموح بين 4:5 و 1.91:1)'); });
            }
            if (n === 'facebook') {
                if (o.placement === 'reels' && videos.length !== 1) add('error', 'فيسبوك ريلز بدّه فيديو واحد');
                if (o.placement === 'stories' && !media.length) add('error', 'ستوري فيسبوك بدّها صورة أو فيديو');
                videos.forEach(v => { if (v.duration && o.placement === 'reels' && v.duration > 90) add('error', 'فيسبوك: الريلز أكثر شي 90 ثانية'); });
            }
            if (n === 'tiktok' || n === 'tiktok_business') {
                if (!media.length) add('error', 'تيك توك بدّه فيديو أو صور');
                if (videos.length && images.length) add('error', 'تيك توك: يا فيديو يا صور، مش الاثنين مع بعض');
                if (videos.length > 1) add('error', 'تيك توك: فيديو واحد بس بالمنشور');
                videos.forEach(v => {
                    if (v.duration && v.duration < 3) add('error', 'تيك توك: الفيديو لازم يكون 3 ثواني أو أكثر');
                    if (v.duration && v.duration > 600) add('error', 'تيك توك: الفيديو أطول من 10 دقايق');
                    if (v.w && v.h && v.w > v.h) add('warn', 'تيك توك: الفيديو العرضي بيطلع صغير. الأحسن 9:16');
                });
            }
            if (n === 'youtube') {
                if (videos.length !== 1 || images.length) add('error', 'يوتيوب بدّه فيديو واحد بس');
                if (!(o.title || '').trim()) add('error', 'يوتيوب: اكتب عنوان للفيديو');
            }
            if (n === 'x') {
                if (images.length > 4) add('error', 'X: أكثر شي 4 صور');
                if (videos.length > 1 || (videos.length && images.length)) add('error', 'X: فيديو واحد بس، بدون صور معه');
                videos.forEach(v => { if (v.duration && v.duration > 140) add('error', 'X: الفيديو أكثر شي 140 ثانية'); });
            }
            if (n === 'linkedin' && videos.length > 1) add('error', 'لينكدإن: فيديو واحد بس');
            if (n === 'threads' && media.length > 10) add('error', 'ثريدز: أكثر شي 10 صور');
        });

        if (forSchedule) {
            const when = whenDate();
            if (!when) add('error', 'اختار يوم وساعة النشر');
            else if (when.getTime() < Date.now() + 2 * 60 * 1000) add('error', 'موعد النشر لازم يكون بعد دقيقتين من هلّق على الأقل');
        }
        const seen = new Set();
        return out.filter(x => !seen.has(x.text) && seen.add(x.text));
    }

    function renderIssues() {
        const box = composerEl.querySelector('.smp-issues');
        const issues = checkPost(false).filter(x => x.text !== 'اختار العميل');
        box.innerHTML = issues.length ? `<ul>${issues.map(x => `<li class="is-${x.level}">${icon(x.level === 'error' ? 'error' : 'warn')}<span>${esc(x.text)}</span></li>`).join('')}</ul>` : '';
    }

    function renderPreview() {
        const nets = selectedNets();
        const tabs = composerEl.querySelector('.smp-preview-tabs');
        const box = composerEl.querySelector('.smp-preview');
        if (!nets.length) { tabs.innerHTML = ''; box.innerHTML = '<div class="smp-preview-empty">اختار حساب عشان تشوف شكل المنشور</div>'; return; }
        if (!nets.includes(composer.previewNet)) composer.previewNet = nets[0];
        tabs.innerHTML = nets.map(n => `<button type="button" data-preview="${n}" class="${composer.previewNet === n ? 'is-active' : ''}" aria-label="${esc(NETS[n].label)}">${netIcon(n)}</button>`).join('');
        const net = composer.previewNet;
        const acc = selectedAccounts().find(a => a.platform === net) || {};
        const name = esc(acc.name || acc.username || 'الحساب');
        const user = esc(acc.username || 'account');
        const avatar = acc.photo ? `<img src="${esc(acc.photo)}" alt="" referrerpolicy="no-referrer">` : `<span style="--h:${hue(acc.username || 'x')}">${esc((acc.name || acc.username || '?').charAt(0))}</span>`;
        const media = readyMedia();
        const first = media[0];
        const mediaEl = first ? (first.kind === 'video' && !first.thumb && !first.preview ? `<div class="smp-pv-media is-ph">${icon('video')}</div>` : `<div class="smp-pv-media"><img src="${esc(first.thumb || first.preview || first.url)}" alt="">${first.kind === 'video' ? `<span class="smp-pv-play">${icon('video')}</span>` : ''}${media.length > 1 ? `<span class="smp-pv-count">1/${media.length}</span>` : ''}</div>`) : '';
        const text = esc(captionFor(net)).replace(/\n/g, '<br>').replace(/(#[^\s#<]+)/g, '<span class="smp-pv-tag">$1</span>');
        const o = optsFor(net);
        const vertical = (net === 'tiktok' || net === 'tiktok_business') || ((net === 'instagram' || net === 'facebook') && o.placement !== 'timeline');
        let html;
        if (vertical) {
            html = `<div class="smp-pv is-vertical is-${net}">${first ? `<img class="smp-pv-bg" src="${esc(first.thumb || first.preview || first.url)}" alt="">` : ''}
                <div class="smp-pv-side">${icon('heart')}${icon('comment')}${icon('send')}</div>
                <div class="smp-pv-over"><div class="smp-pv-user"><span class="smp-pv-avatar">${avatar}</span>${user}</div>${o.placement === 'stories' ? '' : `<div class="smp-pv-text" dir="auto">${text}</div>`}${net.startsWith('tiktok') ? `<div class="smp-pv-music">${icon('music')} الصوت الأصلي</div>` : ''}</div>
            </div>`;
        } else if (net === 'youtube') {
            html = `<div class="smp-pv is-youtube">${mediaEl || '<div class="smp-pv-media is-ph is-wide">' + icon('video') + '</div>'}<div class="smp-pv-yt"><span class="smp-pv-avatar">${avatar}</span><div><b dir="auto">${esc(o.title || 'عنوان الفيديو')}</b><small>${name}</small></div></div></div>`;
        } else if (net === 'instagram') {
            html = `<div class="smp-pv is-instagram"><div class="smp-pv-head"><span class="smp-pv-avatar">${avatar}</span><b>${user}</b></div>${mediaEl}
                <div class="smp-pv-actions">${icon('heart')}${icon('comment')}${icon('send')}<span></span>${icon('bookmark')}</div>
                <div class="smp-pv-text" dir="auto"><b>${user}</b> ${text}</div></div>`;
        } else {
            html = `<div class="smp-pv is-${net}"><div class="smp-pv-head"><span class="smp-pv-avatar">${avatar}</span><div><b>${name}</b><small>${net === 'x' ? '@' + user : 'هلّق'}</small></div></div>
                <div class="smp-pv-text" dir="auto">${text}</div>${mediaEl}</div>`;
        }
        box.innerHTML = html;
    }

    function renderFooter() {
        const foot = composerEl.querySelector('.smp-modal-foot');
        const c = composer;
        const published = c.state === 'published';
        foot.innerHTML = `
            ${c.existing ? `<button type="button" class="smp-btn is-danger" data-delete>${icon('trash')} ${published ? 'شيله من التقويم' : 'احذف'}</button>` : ''}
            <span class="smp-foot-space"></span>
            ${published ? `<button type="button" class="smp-btn" data-duplicate>${icon('copy')} نسخة جديدة</button>` : `
                <button type="button" class="smp-btn" data-save="draft">حفظ مسودة</button>
                <button type="button" class="smp-btn" data-save="now">انشر الآن</button>
                <button type="button" class="smp-btn is-primary" data-save="schedule">${c.state === 'scheduled' ? 'حفظ الجدولة' : 'جدولة'}</button>`}`;
    }

    function setBusy(on, label) {
        composer.busy = on;
        composerEl.classList.toggle('is-busy', on);
        let b = composerEl.querySelector('.smp-busy');
        if (on && !b) { b = document.createElement('div'); b.className = 'smp-busy'; composerEl.querySelector('.smp-modal').appendChild(b); }
        if (b) { if (on) b.innerHTML = `<span class="smp-spinner"></span>${esc(label || 'لحظة…')}`; else b.remove(); }
    }

    function whenDate() {
        const d = fromIsoDate(composer.date);
        const t = String(composer.time || '').split(':').map(Number);
        if (!d || t.length < 2 || t.some(isNaN)) return null;
        d.setHours(t[0], t[1], 0, 0);
        return d;
    }

    // ---------- Media ----------

    let mediaSeq = 0;
    function readVideoInfo(src) {
        return new Promise(resolve => {
            const v = document.createElement('video');
            let done = false;
            const finish = info => { if (!done) { done = true; resolve(info); } };
            v.muted = true; v.preload = 'metadata'; v.playsInline = true;
            v.onloadedmetadata = () => {
                const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
                v.onseeked = () => {
                    try {
                        const cv = document.createElement('canvas');
                        const scale = 240 / Math.max(v.videoWidth || 240, 1);
                        cv.width = Math.round((v.videoWidth || 240) * scale); cv.height = Math.round((v.videoHeight || 240) * scale);
                        cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
                        info.thumb = cv.toDataURL('image/jpeg', 0.72);
                    } catch (e) { /* cross-origin video */ }
                    finish(info);
                };
                try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { finish(info); }
            };
            v.onerror = () => finish({});
            setTimeout(() => finish({}), 6000);
            v.src = src;
        });
    }
    function readImageInfo(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve({});
            img.src = src;
        });
    }

    function uploadBlob(item, blob) {
        item.status = 'uploading';
        item.progress = 0;
        return api('upload-url').then(({ uploadUrl, mediaUrl }) => new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
            xhr.upload.onprogress = e => {
                if (!e.lengthComputable) return;
                item.progress = e.loaded / e.total;
                const bar = composerEl && composerEl.querySelector(`[data-remove="${item.key}"]`);
                const fill = bar && bar.parentElement.querySelector('.smp-media-progress i');
                if (fill) fill.style.width = Math.round(item.progress * 100) + '%';
            };
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(mediaUrl) : reject(new Error('upload ' + xhr.status)));
            xhr.onerror = () => reject(new Error('upload failed'));
            xhr.send(blob);
        })).then(url => {
            item.url = url;
            item.status = 'ready';
            item.blob = null;
        }).catch(e => {
            item.status = 'error';
            item.blob = blob;
            item.error = errorText(e);
        }).finally(() => { if (composer && composer.media.includes(item)) renderMedia(); });
    }

    async function addFiles(files) {
        for (const file of Array.from(files || [])) {
            const kind = file.type.startsWith('video/') ? 'video' : (file.type.startsWith('image/') ? 'image' : null);
            if (!kind) { toast('هالملف مش صورة ولا فيديو'); continue; }
            if (file.size > 1024 * 1024 * 1024) { toast('الملف أكبر من 1 جيجا'); continue; }
            const preview = URL.createObjectURL(file);
            const item = { key: 'u' + (++mediaSeq), kind, preview, status: 'uploading', progress: 0, source: 'upload', name: file.name };
            composer.media.push(item);
            renderMedia();
            const info = kind === 'video' ? await readVideoInfo(preview) : await readImageInfo(preview);
            Object.assign(item, info);
            if (kind === 'image' && !item.thumb) item.thumb = await smallThumb(preview);
            renderMedia();
            uploadBlob(item, file);
        }
    }

    function smallThumb(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                try {
                    const scale = 320 / Math.max(img.naturalWidth, img.naturalHeight, 1);
                    const cv = document.createElement('canvas');
                    cv.width = Math.max(1, Math.round(img.naturalWidth * Math.min(scale, 1)));
                    cv.height = Math.max(1, Math.round(img.naturalHeight * Math.min(scale, 1)));
                    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL('image/jpeg', 0.75));
                } catch (e) { resolve(''); }
            };
            img.onerror = () => resolve('');
            img.src = src;
        });
    }

    async function addUrl(url) {
        if (!/^https:\/\/\S+$/i.test(url)) { toast('حط رابط بيبلّش بـ https://'); return; }
        if (/frame\.io/i.test(url)) { toast('رابط Frame.io ما بينشر مباشرة. نزّل الفيديو وارفعه هون'); return; }
        const kind = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? 'video' : 'image';
        const item = { key: 'l' + (++mediaSeq), kind, url, status: 'ready', source: 'link' };
        if (kind === 'image') { item.thumb = url; Object.assign(item, await readImageInfo(url)); }
        else Object.assign(item, await readVideoInfo(url));
        composer.media.push(item);
        renderMedia();
    }

    // Media saved inside old posts (data: URLs) is uploaded only when the post is published
    async function ensureUploaded() {
        const waiting = composer.media.filter(m => m.source === 'data' && !m.url && m.status !== 'uploading');
        await Promise.all(waiting.map(m => fetch(m.dataSrc).then(r => r.blob()).then(blob => uploadBlob(m, blob))));
        if (composer.media.some(m => m.status === 'error')) throw new Error('في ملف ما انرفع. جرّب مرة تانية');
    }

    // ---------- Saving ----------

    function buildCard(kind) {
        const c = composer;
        const board = findBoard(c.boardId);
        const old = c.cardId ? (board.cards || []).find(x => x.id === c.cardId) : null;
        const when = kind === 'now' ? new Date() : (whenDate() || new Date());
        const media = c.media.filter(m => m.kind !== 'unsupported');
        const nets = selectedNets();
        const caption = c.caption;
        const text = caption || Object.values(c.overrides).find(v => v && v.trim()) || '';
        const card = Object.assign({}, old || {}, {
            id: c.cardId || ('post-' + Date.now()),
            title: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            fullText: caption,
            fullTextInstagram: captionFor('instagram'),
            fullTextTiktok: c.overrides.tiktok !== undefined ? c.overrides.tiktok : (old ? old.fullTextTiktok || '' : ''),
            fullTextSnapchat: old ? old.fullTextSnapchat || '' : '',
            dateStr: dayStr(when),
            timeStr: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
            postType: media.some(m => m.kind === 'video') ? 'video' : 'image',
            platforms: Array.from(new Set(nets.map(n => NETS[n].card))),
            mediaItems: media.map(m => ({
                type: m.kind,
                dataUrl: m.url || m.dataSrc || '',
                url: m.url || '',
                thumb: m.kind === 'video' ? (m.thumb || '') : (m.thumb && m.thumb.startsWith('data:') && m.thumb.length < 60000 ? m.thumb : ''),
                w: m.w || 0, h: m.h || 0, duration: m.duration || 0
            })),
            captions: c.overrides,
            accountIds: Array.from(c.selected),
            publishOptions: c.opts,
            publishSource: 'publish'
        });
        // The planner shows the uploaded copy; keep the small thumbnail only for videos and for images without a public URL
        card.mediaItems.forEach(m => { if (m.type === 'image' && m.url) m.thumb = ''; });
        if (!card.mediaItems.length) card.mediaItems = null;
        return { board, card };
    }

    function buildPayload(kind, card) {
        const c = composer;
        const nets = selectedNets();
        const platform_configurations = {};
        nets.forEach(n => {
            const conf = {};
            const o = optsFor(n);
            if (c.overrides[n] !== undefined) conf.caption = c.overrides[n];
            if (n === 'instagram' || n === 'facebook') conf.placement = o.placement || 'timeline';
            if (n === 'tiktok' || n === 'tiktok_business') {
                conf.privacy_status = o.privacy_status || 'public';
                conf.allow_comment = o.allow_comment !== false;
                conf.allow_duet = o.allow_duet !== false;
                conf.allow_stitch = o.allow_stitch !== false;
            }
            if (n === 'youtube') { conf.title = (o.title || '').trim(); conf.privacy_status = o.privacy_status || 'public'; }
            if (Object.keys(conf).length) platform_configurations[n] = conf;
        });
        return {
            caption: c.caption || Object.values(c.overrides).find(v => v && v.trim()) || '',
            social_accounts: Array.from(c.selected).filter(id => accountsOf(c.boardId).some(a => a.id === id)),
            media: readyMedia().map(m => ({ url: m.url })),
            platform_configurations,
            scheduled_at: kind === 'now' ? null : whenDate().toISOString(),
            external_id: `${c.boardId}__${card.id}`
        };
    }

    function writeCard(board, card) {
        if (typeof window.pushUndoState === 'function') window.pushUndoState();
        board.cards = board.cards || [];
        const clean = plain(card);
        const idx = board.cards.findIndex(x => x && x.id === clean.id);
        if (idx > -1) board.cards[idx] = clean; else board.cards.push(clean);
        saveState();
    }

    async function save(kind) {
        if (!composer || composer.busy) return;
        const c = composer;
        if (!c.boardId) { toast('اختار العميل'); return; }
        if (kind === 'draft') {
            if (!c.caption.trim() && !c.media.length) { toast('المنشور فاضي'); return; }
            if (c.media.some(m => m.status === 'uploading')) { toast('استنى لحد ما يخلص رفع الملفات'); return; }
        } else {
            const issues = checkPost(kind === 'schedule');
            const errors = issues.filter(x => x.level === 'error');
            if (errors.length) {
                const box = composerEl.querySelector('.smp-issues');
                box.innerHTML = `<ul>${errors.concat(issues.filter(x => x.level !== 'error')).map(x => `<li class="is-${x.level}">${icon(x.level === 'error' ? 'error' : 'warn')}<span>${esc(x.text)}</span></li>`).join('')}</ul>`;
                box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                box.classList.remove('is-shake'); void box.offsetWidth; box.classList.add('is-shake');
                toast(errors[0].text);
                return;
            }
        }
        const prev = c.pfm;
        try {
            if (kind === 'draft') {
                setBusy(true, 'عم نحفظ…');
                if (prev && prev.id && prev.state === 'scheduled') await api('delete', { id: prev.id });
                const { board, card } = buildCard('draft');
                card.status = 'مسودة';
                delete card.pfm;
                writeCard(board, card);
                closeComposer();
                toast('انحفظ كمسودة');
                return;
            }
            setBusy(true, 'عم نرفع الملفات…');
            await ensureUploaded();
            setBusy(true, kind === 'now' ? 'عم ننشر…' : 'عم نجدول…');
            const { board, card } = buildCard(kind);
            const payload = buildPayload(kind, card);
            let r;
            if (kind === 'schedule' && prev && prev.id && prev.state === 'scheduled') {
                r = await api('update', { id: prev.id, post: payload });
            } else {
                if (prev && prev.id && prev.state === 'scheduled') await api('delete', { id: prev.id }).catch(() => {});
                r = await api('create', { post: payload });
            }
            card.status = kind === 'now' ? 'فوري' : 'جدولة';
            card.pfm = { id: r.id, state: kind === 'now' ? 'processing' : 'scheduled', scheduledAt: payload.scheduled_at || new Date().toISOString(), accounts: payload.social_accounts, savedAt: Date.now() };
            writeCard(board, card);
            closeComposer();
            if (kind === 'now') {
                toast('انبعت للنشر ✓');
                setTimeout(() => syncStatuses(true), 10000);
                setTimeout(() => syncStatuses(true), 40000);
            } else {
                const w = parseDay(card.dateStr);
                toast(`انجدول ✓ ${DAYS[w.getDay()]} ${w.getDate()} ${MONTHS[w.getMonth()]} الساعة ${card.timeStr}`);
            }
        } catch (e) {
            if (composer) setBusy(false);
            toast(errorText(e));
        }
    }

    function confirmThen(title, desc, fn) {
        if (typeof window.showConfirmModal === 'function' && document.getElementById('globalConfirmModal')) window.showConfirmModal(fn, title, desc);
        else if (window.confirm(title + '\n' + desc)) fn();
    }

    async function removePost() {
        const c = composer;
        const board = findBoard(c.boardId);
        const prev = c.pfm;
        try {
            setBusy(true, 'عم نحذف…');
            if (prev && prev.id && prev.state === 'scheduled') await api('delete', { id: prev.id });
            if (typeof window.pushUndoState === 'function') window.pushUndoState();
            board.cards = (board.cards || []).filter(x => x && x.id !== c.cardId);
            saveState();
            closeComposer();
            toast('انحذف');
        } catch (e) {
            if (composer) setBusy(false);
            toast(errorText(e));
        }
    }

    function bindComposer() {
        const el = composerEl;
        el.addEventListener('mousedown', e => { if (e.target === el) el.dataset.downOutside = '1'; });
        el.addEventListener('click', e => {
            if (e.target === el && el.dataset.downOutside === '1') { el.dataset.downOutside = ''; return maybeClose(); }
            el.dataset.downOutside = '';
            const t = e.target.closest('button');
            if (!t) return;
            if (t.hasAttribute('data-close')) return maybeClose();
            if (t.dataset.acc) {
                if (composer.selected.has(t.dataset.acc)) composer.selected.delete(t.dataset.acc); else composer.selected.add(t.dataset.acc);
                return renderAccountsPicker();
            }
            if (t.hasAttribute('data-open-accounts')) return openAccountsModal(composer.boardId);
            if (t.dataset.tab) { composer.tab = t.dataset.tab; renderTabs(); return; }
            if (t.classList.contains('smp-reset-override')) { delete composer.overrides[composer.tab]; renderTabs(); renderPreview(); renderIssues(); return; }
            if (t.hasAttribute('data-pick-files')) return el.querySelector('.smp-file').click();
            if (t.dataset.remove) {
                const m = composer.media.find(x => x.key === t.dataset.remove);
                if (m && m.preview) URL.revokeObjectURL(m.preview);
                composer.media = composer.media.filter(x => x.key !== t.dataset.remove);
                return renderMedia();
            }
            if (t.dataset.retry) {
                const m = composer.media.find(x => x.key === t.dataset.retry);
                if (m && m.blob) { uploadBlob(m, m.blob); renderMedia(); }
                return;
            }
            if (t.hasAttribute('data-add-url')) {
                const input = el.querySelector('.smp-url');
                const v = input.value.trim();
                if (v) addUrl(v).then(() => { input.value = ''; });
                return;
            }
            if (t.dataset.opt) {
                const [net, key] = t.dataset.opt.split('.');
                optsFor(net)[key] = t.dataset.val;
                composer.touched.add(net);
                renderOptions(); renderPreview(); renderIssues();
                return;
            }
            if (t.dataset.preview) { composer.previewNet = t.dataset.preview; return renderPreview(); }
            if (t.dataset.save) {
                const kind = t.dataset.save;
                if (kind === 'now') {
                    const n = selectedAccounts().length;
                    const errors = checkPost(false).filter(x => x.level === 'error');
                    if (errors.length) return save('now');
                    return confirmThen('تنشره هلّق؟', `رح ينزل فوراً على ${n} ${n === 1 ? 'حساب' : 'حسابات'}.`, () => save('now'));
                }
                return save(kind);
            }
            if (t.hasAttribute('data-delete')) {
                return confirmThen(composer.state === 'published' ? 'تشيله من التقويم؟' : 'تحذف المنشور؟', composer.state === 'scheduled' ? 'رح تنلغى جدولته كمان.' : (composer.state === 'published' ? 'المنشور بيضل على المنصات، بس بينشال من هون.' : 'ما في رجعة.'), removePost);
            }
            if (t.hasAttribute('data-duplicate')) {
                const keep = { boardId: composer.boardId, caption: composer.caption, overrides: plain(composer.overrides), selected: Array.from(composer.selected), media: composer.media.filter(m => m.url).map(m => Object.assign({}, m, { key: 'd' + (++mediaSeq), source: 'existing' })), opts: plain(composer.opts) };
                openComposer({ boardId: keep.boardId, day: addDays(startOfDay(new Date()), 1) });
                Object.assign(composer, { caption: keep.caption, overrides: keep.overrides, selected: new Set(keep.selected), pickedDefault: true, media: keep.media, opts: keep.opts, touched: new Set(Object.keys(keep.opts)) });
                renderTabs(); renderComposer();
                return;
            }
            if (t.hasAttribute('data-check-status')) {
                lastSync = 0;
                return syncStatuses(true).then(() => {
                    const card = findCard(composer.boardId, composer.cardId);
                    if (card && card.pfm) { composer.pfm = plain(card.pfm); composer.state = pubState(card); renderStatusBox(); renderFooter(); }
                });
            }
        });
        el.addEventListener('input', e => {
            const t = e.target;
            if (t.classList.contains('smp-textarea')) {
                if (composer.tab === 'all') composer.caption = t.value; else composer.overrides[composer.tab] = t.value;
                composerEl.querySelector('.smp-reset-override').hidden = composer.tab === 'all' || composer.overrides[composer.tab] === undefined;
                if (composer.tab !== 'all') { const tab = composerEl.querySelector(`.smp-tabs [data-tab="${composer.tab}"]`); if (tab && !tab.querySelector('.smp-dot')) tab.insertAdjacentHTML('beforeend', '<i class="smp-dot"></i>'); }
                renderCounter(); renderPreview(); renderIssues();
            }
            if (t.dataset.optText) { const [net, key] = t.dataset.optText.split('.'); optsFor(net)[key] = t.value; composer.touched.add(net); renderPreview(); renderIssues(); }
        });
        el.addEventListener('change', e => {
            const t = e.target;
            if (t.classList.contains('smp-composer-client')) {
                composer.boardId = t.value || null;
                composer.selected = new Set();
                composer.pickedDefault = false;
                const blank = t.querySelector('option[value=""]');
                if (blank && t.value) blank.remove();
                return renderAccountsPicker();
            }
            if (t.classList.contains('smp-file')) { addFiles(t.files); t.value = ''; return; }
            if (t.classList.contains('smp-date')) { composer.date = t.value; return renderIssues(); }
            if (t.classList.contains('smp-time')) { composer.time = t.value; return renderIssues(); }
            if (t.dataset.optSelect) { const [net, key] = t.dataset.optSelect.split('.'); optsFor(net)[key] = t.value; composer.touched.add(net); return; }
            if (t.dataset.optCheck) { const [net, key] = t.dataset.optCheck.split('.'); optsFor(net)[key] = t.checked; composer.touched.add(net); return; }
        });
        const drop = el.querySelector('.smp-modal');
        drop.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); el.classList.add('is-dropping'); } });
        drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) el.classList.remove('is-dropping'); });
        drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); el.classList.remove('is-dropping'); addFiles(e.dataTransfer.files); } });
        el.addEventListener('keydown', e => { if (e.key === 'Escape') maybeClose(); });
    }

    function maybeClose() {
        if (!composer || composer.busy) return;
        if (composer.media.some(m => m.status === 'uploading')) {
            return confirmThen('في ملفات عم تنرفع', 'إذا سكّرت هلّق رح تروح.', closeComposer);
        }
        closeComposer();
    }

    // ---------- Connected accounts ----------

    let accountsModal = null;
    function openAccountsModal(boardId) {
        if (!boardId || boardId === 'all') { toast('اختار العميل أول'); return; }
        closeAccountsModal();
        accountsModal = document.createElement('div');
        accountsModal.className = 'smp-overlay is-top';
        accountsModal.id = 'smpAccounts';
        accountsModal.dataset.board = boardId;
        document.body.appendChild(accountsModal);
        renderAccountsModal();
        accountsModal.addEventListener('click', onAccountsClick);
        loadAccounts(true);
    }
    function closeAccountsModal() {
        if (accountsModal) accountsModal.remove();
        accountsModal = null;
    }
    function renderAccountsModal() {
        const boardId = accountsModal.dataset.board;
        const board = findBoard(boardId);
        const accs = accountsOf(boardId);
        const link = accountsModal.dataset.link || '';
        accountsModal.innerHTML = `<div class="smp-modal is-narrow" role="dialog" aria-modal="true" aria-label="حسابات العميل">
            <div class="smp-modal-head"><div><div class="smp-modal-eyebrow">حسابات السوشيال ميديا</div><h3 class="smp-modal-title">${esc(board ? board.title : '')}</h3></div><button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${icon('close')}</button></div>
            <div class="smp-modal-body is-single">
                ${accounts.error ? `<div class="smp-banner is-error">${icon('error')}<div><b>${esc(errorText(accounts.error))}</b></div></div>` : ''}
                <div class="smp-label">المربوطة</div>
                <div class="smp-acc-list">${accs.length ? accs.map(a => `<div class="smp-acc-row">${accountAvatar(a)}<div><b>${esc(a.name || a.username)}</b><small>${esc((NETS[a.platform] || {}).label || a.platform)}${a.username ? ' · @' + esc(a.username) : ''}</small></div><button type="button" class="smp-link-btn is-danger" data-disconnect="${esc(a.id)}">فصل</button></div>`).join('') : `<div class="smp-muted">${accounts.loading ? 'عم نجيب الحسابات…' : 'لسا ما في حسابات.'}</div>`}</div>
                <div class="smp-label">اربط حساب جديد</div>
                <div class="smp-connect-grid">
                    ${CONNECTABLE.map(n => `<div class="smp-connect">
                        <button type="button" class="smp-connect-main" data-connect="${n}">${netIcon(n)}<span><b>${esc(NETS[n].label)}</b><small>${esc(CONNECT_NOTES[n])}</small></span></button>
                        <button type="button" class="smp-connect-copy" data-copy-link="${n}" title="انسخ رابط الربط وابعته للعميل">${icon('copy')}</button>
                    </div>`).join('')}
                    <div class="smp-connect is-soon"><span class="smp-connect-main">${netIcon('snapchat')}<span><b>سناب شات</b><small>قريباً</small></span></span></div>
                </div>
                ${link ? `<div class="smp-link-box"><span>رابط الربط (ابعته للعميل يفتحه ويوافق):</span><input type="text" readonly value="${esc(link)}" dir="ltr"></div>` : ''}
                <p class="smp-hint">بتقدر تربط الحساب إنت إذا معك دخول العميل، أو تضغط ${icon('copy')} وتبعت الرابط للعميل.</p>
            </div>
        </div>`;
    }
    async function onAccountsClick(e) {
        if (e.target === accountsModal) return closeAccountsModal();
        const t = e.target.closest('button');
        if (!t) return;
        const boardId = accountsModal.dataset.board;
        if (t.hasAttribute('data-close')) return closeAccountsModal();
        if (t.dataset.connect || t.dataset.copyLink) {
            const platform = t.dataset.connect || t.dataset.copyLink;
            // Open the window right away (inside the click) so the browser doesn't block it
            const win = t.dataset.connect ? window.open('', 'smpConnect', 'width=620,height=760') : null;
            if (win) win.document.write('<p style="font-family:sans-serif;text-align:center;margin-top:40vh">لحظة…</p>');
            try {
                const { url } = await api('connect', { platform, clientId: boardId });
                if (win) { win.location.href = url; return; }
                if (t.dataset.copyLink) {
                    try { await navigator.clipboard.writeText(url); toast('انسخ الرابط ✓ ابعته للعميل'); } catch (err) { toast('انسخ الرابط من تحت'); }
                }
                accountsModal.dataset.link = url;
                renderAccountsModal();
            } catch (err) {
                if (win) win.close();
                toast(errorText(err));
            }
            return;
        }
        if (t.dataset.disconnect) {
            const id = t.dataset.disconnect;
            return confirmThen('تفصل هالحساب؟', 'المنشورات المجدولة عليه ما رح تنزل.', async () => {
                try { await api('disconnect', { accountId: id }); accounts.list = (accounts.list || []).filter(a => a.id !== id); refreshViews(); toast('انفصل'); } catch (err) { toast(errorText(err)); }
            });
        }
    }

    // The connect window (oauth-success.html) tells us when an account is linked
    window.addEventListener('message', e => {
        if (e.origin !== window.location.origin || !e.data) return;
        if (e.data.type === 'SOCIAL_ACCOUNT_CONNECTED' || e.data.type === 'ZERNIO_OAUTH_SUCCESS') { loadAccounts(true); toast('انربط الحساب ✓'); }
    });
    window.addEventListener('focus', () => { if (accountsModal) loadAccounts(true); });

    // Posts made here open in this composer, also when clicked in the client calendar
    function wrapOldModal() {
        const original = window.openCreatePostModal;
        if (typeof original !== 'function' || original._smp) return;
        const wrapped = function (postId) {
            if (!window.isClientView && postId) {
                const card = findCard(activeBoardId, postId);
                if (card && card.publishSource === 'publish') { openComposer({ boardId: activeBoardId, cardId: postId }); return; }
            }
            return original.apply(this, arguments);
        };
        wrapped._smp = true;
        window.openCreatePostModal = wrapped;
    }
    wrapOldModal();

    window.smPublish = { mount, openComposer, syncStatuses, _state: P, _accounts: accounts, _checkPost: () => composer && checkPost(true) };
    if (document.documentElement.getAttribute('data-sm-ws') === 'publish' && typeof window.smMountWorkspace === 'function') window.smMountWorkspace();
})();
