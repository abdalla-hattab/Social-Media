// "موافقة الفيديوهات" window: makes the client's voting link (approve.html) and shows, for every
// video, who voted approve or reject and when. Videos come from the month's calendar posts that
// have a Frame.io link, plus any Frame.io links pasted straight into this window (vote_videos).
// Votes live inside the board (ai_social_lists/<key>/video_votes/<videoId>/<uid>), written by approve.js.
(function () {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = msg => { if (typeof showToast === 'function') showToast(msg); else alert(msg); };
    const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const ICON = {
        close: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        copy: '<svg class="smp-ic" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>'
    };

    let overlay = null;
    let liveRef = null;
    let liveBoard = null;
    let boardKey = null;
    let ctx = null;
    let lastLink = '';
    let editingLinks = false;
    let mediaRef = null;
    let media = {};
    let renderPending = false;

    // Photos and voice notes the client's team added under «مو موافق» (vote_media/<boardId>/<videoId>)
    const safeData = d => typeof d === 'string' && /^data:(image|audio)\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]+$/i.test(d);

    const frameLink = card => {
        const items = card.mediaItems || (card.mediaObj ? [card.mediaObj] : []);
        return items.find(m => m && m.type === 'frame-io' && m.url) || null;
    };

    const nameKey = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const fmtTime = ts => ts ? new Date(ts).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';

    // Same id for the same link every time, so saved votes stay attached when the list is edited
    const idForUrl = url => {
        let h = 0;
        for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
        return 'vv_' + (h >>> 0).toString(36);
    };

    function currentBoard() {
        if (liveBoard) return liveBoard;
        return (typeof boards !== 'undefined' ? boards : []).find(b => b.id === ctx.boardId) || {};
    }

    // Every video the client votes on: calendar posts of the month with a Frame.io link, then pasted links
    function videoItems() {
        const board = currentBoard();
        const prefix = `${ctx.year}-${ctx.month}-`;
        const fromCalendar = (board.cards || [])
            .filter(c => c && c.id && c.dateStr && c.dateStr.startsWith(prefix) && !c.isClientDayNote && frameLink(c))
            .sort((a, b) => parseInt(a.dateStr.split('-')[2], 10) - parseInt(b.dateStr.split('-')[2], 10))
            .map(c => ({
                id: c.id,
                url: frameLink(c).url,
                thumbnail: frameLink(c).thumbnail || '',
                label: (c.title || c.fullText || c.idea || c.description || 'فيديو').toString().trim().slice(0, 90),
                sub: `${parseInt(c.dateStr.split('-')[2], 10)} ${MONTHS[ctx.month]}`
            }));
        const pasted = (Array.isArray(board.vote_videos) ? board.vote_videos : Object.values(board.vote_videos || {}))
            .filter(v => v && v.id && v.url)
            .map(v => ({ id: v.id, url: v.url, thumbnail: v.thumbnail || '', label: v.title || 'فيديو', sub: '' }));
        return fromCalendar.concat(pasted);
    }

    function videoRow(item) {
        const votes = (currentBoard().video_votes || {})[item.id] || {};
        // Every saved vote is shown, but each name counts once, with its latest choice. Someone who
        // voted again (another phone, or to add a reason) shows all their lines; the older ones are
        // greyed out and marked as not counted.
        const groups = {};
        Object.entries(votes).filter(([, v]) => v && v.vote).map(([id, v]) => Object.assign({ uid: id }, v))
            .sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(v => {
                const key = nameKey(v.name);
                (groups[key] = groups[key] || []).push(v);
            });
        const people = Object.values(groups).sort((a, b) => (a[0].ts || 0) - (b[0].ts || 0));
        const counted = people.map(g => g[g.length - 1]);
        const yes = counted.filter(v => v.vote === 'approve').length;
        const no = counted.filter(v => v.vote === 'reject').length;
        let verdict = '<span class="vv-badge">ما فيه أصوات لسا</span>';
        if (yes > no) verdict = '<span class="vv-badge is-yes">الأغلبية موافقين</span>';
        else if (no > yes) verdict = '<span class="vv-badge is-no">الأغلبية مو موافقين</span>';
        else if (yes) verdict = '<span class="vv-badge is-tie">متعادل</span>';
        const videoMedia = Object.values(media[item.id] || {}).filter(m => m && safeData(m.data)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const mediaOf = g => {
            const uids = new Set(g.map(v => v.uid));
            const key = nameKey(g[0].name);
            const list = videoMedia.filter(m => uids.has(m.uid) || nameKey(m.name) === key);
            return list.length ? `<div class="vv-media">${list.map(m => m.kind === 'image'
                ? `<img src="${m.data}" data-zoom alt="صورة من ${esc(m.name)}">`
                : `<audio controls preload="none" src="${m.data}"></audio>`).join('')}</div>` : '';
        };
        const voters = people.map(g => g.map((v, i) => {
            const old = i < g.length - 1;
            return `<div class="vv-voter${old ? ' is-old' : ''}">
                <span class="vv-dot ${v.vote === 'approve' ? 'is-yes' : 'is-no'}"></span>
                <b>${esc(v.name)}</b>
                <span>${v.vote === 'approve' ? 'موافق' : 'مو موافق'}</span>
                ${old ? '<span class="vv-old-tag">قديم، ما انحسب</span>' : ''}
                <span class="vv-time">${esc(fmtTime(v.ts))}</span>
            </div>${v.vote === 'reject' && v.note ? `<div class="vv-note${old ? ' is-old' : ''}">سبب التعديل: ${esc(v.note)}</div>` : ''}`;
        }).join('') + mediaOf(g)).join('');
        const hidden = !!(currentBoard().vote_hidden || {})[item.id];
        return `<div class="vv-video${hidden ? ' is-hidden' : ''}">
            <div class="vv-video-head">
                <div class="vv-thumb" ${item.thumbnail ? `style="background-image:url('${esc(item.thumbnail)}')"` : ''}>${item.thumbnail ? '' : '▶'}</div>
                <div class="vv-video-info">
                    ${item.sub ? `<div class="vv-date">${esc(item.sub)}</div>` : ''}
                    <div class="vv-title">${esc(item.label)}</div>
                    <a href="${esc(item.url)}" target="_blank" rel="noopener" class="smp-link-btn" data-play data-title="${esc(item.label)}">شاهد الفيديو</a>
                </div>
                <div class="vv-counts"><span class="is-yes">✅ ${yes}</span><span class="is-no">❌ ${no}</span></div>
            </div>
            <div class="vv-verdict">
                ${hidden ? '<span class="vv-badge is-off">مخفي عن العميل</span>' : verdict}
                <button type="button" class="vv-hide" data-toggle-hide="${esc(item.id)}">${hidden ? 'إظهار للعميل' : 'إخفاء من التصويت'}</button>
            </div>
            ${voters ? `<div class="vv-voters">${voters}</div>` : ''}
        </div>`;
    }

    function pastedAsText() {
        const board = currentBoard();
        const list = Array.isArray(board.vote_videos) ? board.vote_videos : Object.values(board.vote_videos || {});
        return list.filter(v => v && v.url).map(v => `${v.title || 'فيديو'} | ${v.url}`).join('\n');
    }

    function render() {
        if (!overlay) return;
        // A voice note that is playing would stop if the list were redrawn; redraw when it ends
        if ([...overlay.querySelectorAll('audio')].some(a => !a.paused)) { renderPending = true; return; }
        renderPending = false;
        // Don't wipe what the user is typing when new votes arrive
        if (editingLinks) {
            const list = overlay.querySelector('.vv-list');
            if (list) { list.innerHTML = listHtml(); return; }
        }
        overlay.innerHTML = `<div class="smp-modal" role="dialog" aria-modal="true" aria-label="موافقة الفيديوهات">
            <div class="smp-modal-head"><div><div class="smp-modal-eyebrow">موافقة الفيديوهات · ${MONTHS[ctx.month]} ${ctx.year}</div><h3 class="smp-modal-title">${esc(ctx.title)}: مين وافق على إيش</h3></div><button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${ICON.close}</button></div>
            <div class="smp-modal-body is-single">
                <div class="vv-share">
                    <div><b>رابط التصويت للعميل</b><span>كل واحد يفتحه، يكتب اسمه، ويضغط موافق أو مو موافق لكل فيديو.</span></div>
                    <button type="button" class="smp-btn is-primary" data-make-link>${ICON.copy} ${lastLink ? 'انسخ الرابط مرة ثانية' : 'انسخ رابط التصويت'}</button>
                </div>
                ${lastLink ? `<input class="smp-input vv-link" dir="ltr" readonly value="${esc(lastLink)}">` : ''}
                <details class="vv-paste" ${videoItems().length ? '' : 'open'}>
                    <summary>حط روابط فيديوهات من Frame.io</summary>
                    <p>كل فيديو بسطر: الاسم، بعدين | ، بعدين الرابط. مثال: <span dir="ltr">قريباً | https://next.frame.io/share/…</span></p>
                    <textarea class="smp-input vv-textarea" dir="auto" rows="5" placeholder="قريباً | https://next.frame.io/share/...">${esc(pastedAsText())}</textarea>
                    <button type="button" class="smp-btn" data-save-links>حفظ الفيديوهات</button>
                </details>
                <div class="vv-list">${listHtml()}</div>
            </div>
        </div>`;
        const ta = overlay.querySelector('.vv-textarea');
        if (ta) {
            ta.addEventListener('focus', () => { editingLinks = true; });
            ta.addEventListener('blur', () => { editingLinks = false; });
        }
    }

    function listHtml() {
        const items = videoItems();
        return items.length
            ? items.map(videoRow).join('')
            : '<div class="smp-muted">ما فيه فيديوهات لسا. حط روابط Frame.io فوق، أو حط رابط Frame.io في منشورات التقويم لهالشهر.</div>';
    }

    function saveLinks(btn) {
        const ta = overlay.querySelector('.vv-textarea');
        const lines = (ta ? ta.value : '').split('\n').map(l => l.trim()).filter(Boolean);
        const out = [];
        const seen = new Set();
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/https?:\/\/\S+/);
            if (!m) { toast(`السطر ${i + 1} ما فيه رابط`); return; }
            const url = m[0];
            if (seen.has(url)) continue;
            seen.add(url);
            const title = lines[i].replace(url, '').replace(/[|:\-–]+\s*$/, '').replace(/^\s*[|:\-–]+/, '').trim() || `فيديو ${out.length + 1}`;
            out.push({ id: idForUrl(url), url, title: title.slice(0, 80) });
        }
        if (boardKey === null) { toast('لحظة، الصفحة لسا ما حمّلت'); return; }
        btn.disabled = true;
        db.ref(`ai_social_lists/${boardKey}/vote_videos`).set(out.length ? out : null)
            .then(() => { editingLinks = false; toast(`انحفظ ✓ ${out.length} فيديو`); render(); })
            .catch(err => { console.error(err); btn.disabled = false; toast('ما انحفظ، جرّب مرة ثانية'); });
    }

    // Hidden videos stay here with their votes, but the client's page stops showing them
    function toggleHidden(btn) {
        if (boardKey === null) { toast('لحظة، الصفحة لسا ما حمّلت'); return; }
        const id = btn.getAttribute('data-toggle-hide');
        const hide = !(currentBoard().vote_hidden || {})[id];
        btn.disabled = true;
        db.ref(`ai_social_lists/${boardKey}/vote_hidden/${id}`).set(hide ? true : null)
            .then(() => toast(hide ? 'انخفى عن العميل' : 'رجع يظهر للعميل'))
            .catch(err => { console.error(err); btn.disabled = false; toast('ما انحفظ، جرّب مرة ثانية'); });
    }

    // Plays the Frame.io video in a window over the votes instead of a new tab
    let player = null;
    function openPlayer(url, title) {
        if (!player) {
            player = document.createElement('div');
            player.className = 'vv-player';
            player.innerHTML = `<div class="vv-player-bar">
                    <button type="button" class="smp-btn" data-player-close>✕ رجوع</button>
                    <b></b>
                    <a target="_blank" rel="noopener">ما اشتغل؟ افتحه هنا</a>
                </div>
                <iframe title="الفيديو" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
            player.querySelector('[data-player-close]').addEventListener('click', closePlayer);
            document.body.appendChild(player);
            document.addEventListener('keydown', e => { if (e.key === 'Escape' && player.classList.contains('is-open')) closePlayer(); });
        }
        player.querySelector('b').textContent = title || '';
        player.querySelector('a').href = url;
        player.querySelector('iframe').src = url;
        player.classList.add('is-open');
    }
    function closePlayer() {
        if (!player) return;
        player.classList.remove('is-open');
        player.querySelector('iframe').src = 'about:blank';
    }

    // Opens a photo big over the votes; a click anywhere closes it
    let zoom = null;
    function openImage(src) {
        if (!zoom) {
            zoom = document.createElement('div');
            zoom.className = 'vv-zoom';
            zoom.innerHTML = '<img alt="">';
            zoom.addEventListener('click', () => zoom.classList.remove('is-open'));
            document.body.appendChild(zoom);
        }
        zoom.querySelector('img').src = src;
        zoom.classList.add('is-open');
    }

    function close() {
        closePlayer();
        if (zoom) zoom.classList.remove('is-open');
        if (mediaRef) mediaRef.off();
        mediaRef = null;
        media = {};
        renderPending = false;
        if (liveRef) liveRef.off();
        liveRef = null;
        liveBoard = null;
        boardKey = null;
        editingLinks = false;
        if (overlay) overlay.remove();
        overlay = null;
    }

    function makeLink(btn) {
        if (lastLink) {
            navigator.clipboard.writeText(lastLink).then(() => toast('انسخ الرابط ✓'), () => {});
            return;
        }
        btn.disabled = true;
        window.createSecureShareLink(ctx.boardId, ctx.month, ctx.year, 'video_approval')
            .then(code => {
                lastLink = `${location.origin}/approve.html?id=${code}`;
                if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(lastLink).catch(() => {});
                toast('انسخ الرابط ✓ ابعته للعميل');
                editingLinks = false;
                render();
            })
            .catch(err => {
                console.error(err);
                btn.disabled = false;
                toast('ما قدرنا نعمل الرابط، جرّب مرة ثانية');
            });
    }

    window.openVideoVotesModal = function (boardId) {
        close();
        const board = (typeof boards !== 'undefined' ? boards : []).find(b => b.id === boardId) || {};
        const mv = window.activeSocialMonthView;
        const now = new Date();
        ctx = {
            boardId,
            title: board.title || '',
            month: mv ? mv.month : now.getMonth(),
            year: mv ? mv.year : now.getFullYear()
        };
        lastLink = '';
        overlay = document.createElement('div');
        overlay.className = 'smp-overlay is-top';
        overlay.id = 'smVideoVotes';
        document.body.appendChild(overlay);
        render();
        overlay.addEventListener('click', e => {
            if (e.target === overlay) return close();
            const pic = e.target.closest('img[data-zoom]');
            if (pic) return openImage(pic.src);
            const play = e.target.closest('a[data-play]');
            if (play) {
                e.preventDefault();
                return openPlayer(play.href, play.getAttribute('data-title'));
            }
            const t = e.target.closest('button');
            if (!t) return;
            if (t.hasAttribute('data-close')) return close();
            if (t.hasAttribute('data-make-link')) return makeLink(t);
            if (t.hasAttribute('data-save-links')) return saveLinks(t);
            if (t.hasAttribute('data-toggle-hide')) return toggleHidden(t);
        });
        overlay.addEventListener('pause', () => { if (renderPending) render(); }, true);
        overlay.addEventListener('ended', () => { if (renderPending) render(); }, true);
        mediaRef = db.ref(`vote_media/${boardId}`);
        mediaRef.on('value', snap => { media = snap.val() || {}; render(); }, err => console.warn('vote media not loaded', err));
        liveRef = db.ref('ai_social_lists').orderByChild('id').equalTo(boardId);
        liveRef.on('value', snap => {
            snap.forEach(child => {
                const v = child.val();
                if (v && v.id === boardId) { liveBoard = v; boardKey = child.key; }
            });
            render();
        }, err => {
            console.error(err);
            const list = overlay && overlay.querySelector('.vv-list');
            if (list) list.insertAdjacentHTML('afterbegin', '<div class="smp-muted">ما قدرنا نقرأ الأصوات. سكّر النافذة وافتحها مرة ثانية.</div>');
        });
    };

    const style = document.createElement('style');
    style.textContent = `
        #smVideoVotes .smp-modal { max-width: 640px; }
        .vv-share { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; margin-bottom: 10px; }
        .vv-share b { display: block; font-size: 14px; color: #0f172a; }
        .vv-share span { font-size: 13px; color: #64748b; }
        .vv-share .smp-btn { white-space: nowrap; flex-shrink: 0; }
        .vv-link { width: 100%; margin-bottom: 12px; font-size: 13px; }
        .vv-paste { border: 1px dashed #cbd5e1; border-radius: 14px; padding: 10px 14px; margin-bottom: 12px; }
        .vv-paste summary { cursor: pointer; font-weight: 700; font-size: 14px; color: #0f172a; }
        .vv-paste p { font-size: 13px; color: #64748b; margin: 8px 0; }
        .vv-textarea { width: 100%; min-height: 110px; margin-bottom: 8px; font-size: 13px; line-height: 1.7; }
        .vv-list { display: flex; flex-direction: column; gap: 10px; }
        .vv-video { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #fff; }
        .vv-video-head { display: flex; gap: 12px; align-items: center; }
        .vv-thumb { width: 48px; height: 64px; border-radius: 10px; background: #eef1f7 center/cover no-repeat; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
        .vv-video-info { flex: 1; min-width: 0; }
        .vv-date { font-size: 12px; color: #94a3b8; font-weight: 600; }
        .vv-title { font-size: 14px; font-weight: 600; color: #0f172a; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .vv-counts { display: flex; flex-direction: column; gap: 2px; font-weight: 700; font-size: 14px; text-align: left; }
        .vv-counts .is-yes { color: #16a34a; } .vv-counts .is-no { color: #dc2626; }
        .vv-verdict { margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .vv-hide { border: 1px solid #e2e8f0; background: #fff; color: #475569; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 600; padding: 3px 12px; cursor: pointer; }
        .vv-hide:hover { border-color: #94a3b8; color: #0f172a; }
        .vv-video.is-hidden { background: #f8fafc; }
        .vv-video.is-hidden .vv-video-head { opacity: .5; }
        .vv-badge.is-off { background: #e2e8f0; color: #475569; }
        .vv-badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #f1f5f9; color: #64748b; }
        .vv-badge.is-yes { background: #dcfce7; color: #166534; }
        .vv-badge.is-no { background: #fee2e2; color: #991b1b; }
        .vv-badge.is-tie { background: #fef3c7; color: #92400e; }
        .vv-voters { margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .vv-voter { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
        .vv-voter b { color: #0f172a; }
        .vv-time { margin-inline-start: auto; color: #94a3b8; font-size: 12px; }
        .vv-media { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 2px 16px 6px 0; }
        .vv-media img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; cursor: zoom-in; border: 1px solid #e2e8f0; }
        .vv-media audio { height: 34px; width: 240px; max-width: 100%; }
        .vv-zoom { position: fixed; inset: 0; z-index: 10070; background: rgba(15,23,42,.9); display: none; align-items: center; justify-content: center; padding: 16px; cursor: zoom-out; }
        .vv-zoom.is-open { display: flex; }
        .vv-zoom img { max-width: 100%; max-height: 100%; border-radius: 12px; }
        .vv-note { margin: 0 16px 4px 0; font-size: 13px; color: #991b1b; background: #fef2f2; border-radius: 8px; padding: 6px 10px; white-space: pre-wrap; }
        .vv-voter.is-old, .vv-note.is-old { opacity: .55; }
        .vv-old-tag { font-size: 11px; color: #64748b; background: #f1f5f9; border-radius: 999px; padding: 1px 8px; }
        .vv-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .vv-dot.is-yes { background: #16a34a; } .vv-dot.is-no { background: #dc2626; }
        .vv-player { position: fixed; inset: 0; z-index: 10060; background: rgba(15,23,42,.92); display: none; flex-direction: column; padding: 12px; }
        .vv-player.is-open { display: flex; }
        .vv-player-bar { display: flex; align-items: center; gap: 10px; color: #fff; padding-bottom: 10px; }
        .vv-player-bar b { flex: 1; min-width: 0; font-size: 15px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .vv-player-bar a { color: #cbd5e1; font-size: 13px; }
        .vv-player iframe { flex: 1; width: 100%; border: 0; border-radius: 12px; background: #000; }
        @media (max-width: 600px) { .vv-share { flex-direction: column; align-items: stretch; } }
    `;
    document.head.appendChild(style);
})();
