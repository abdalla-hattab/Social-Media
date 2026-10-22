// "مراجعة الفيديوهات" window: the owner reviews the AI videos made for each client, in order.
// Only the accounts in ADMINS see the header button (body.sm-video-admin) or can open the window.
// Data lives in video_reviews/{clients,videos,reviews,learned}: Claude adds clients/videos/learned,
// the owner's verdicts and notes are saved in reviews/<videoId>. Videos play from Google Drive.
(function () {
    const ADMINS = ['abdla.hth@gmail.com'];
    const ROOT = 'video_reviews';
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = msg => { if (typeof showToast === 'function') showToast(msg); else alert(msg); };
    const ICON = {
        close: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        check: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
        note: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
        drive: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
        bulb: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>'
    };

    const isAdmin = user => !!(user && user.email && ADMINS.includes(user.email.toLowerCase()));

    if (!window.isClientView && typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => document.body.classList.toggle('sm-video-admin', isAdmin(user)));
    }

    let overlay = null;
    let ref = null;
    let data = { clients: {}, videos: {}, reviews: {}, learned: {} };
    let loaded = false;
    let activeClient = '';
    let editing = {};   // videoId → verdict picked but not saved yet
    let drafts = {};    // videoId → note typed but not saved yet
    let busy = {};

    const fmtDate = d => {
        if (!d) return '';
        const t = typeof d === 'number' ? new Date(d) : new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
        return isNaN(t) ? String(d) : t.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    function clientList() {
        return Object.keys(data.clients || {}).map(id => Object.assign({ id }, data.clients[id]))
            .sort((a, b) => (a.order || 99) - (b.order || 99) || String(a.name).localeCompare(String(b.name), 'ar'));
    }

    function videosOf(clientId) {
        return Object.keys(data.videos || {}).map(id => Object.assign({ id }, data.videos[id]))
            .filter(v => v.client === clientId)
            .sort((a, b) => ((a.kind === 'ref') - (b.kind === 'ref')) * -1 || (a.n || 0) - (b.n || 0));
    }

    const waiting = clientId => videosOf(clientId).filter(v => v.kind !== 'ref' && !(data.reviews || {})[v.id]).length;

    function chipsHtml(clients) {
        if (clients.length < 2) return '';
        return `<div class="sm-vr-chips">${clients.map(c => {
            const n = waiting(c.id);
            return `<button type="button" class="sm-vr-chip${c.id === activeClient ? ' is-active' : ''}" data-client="${esc(c.id)}">${esc(c.name || c.id)}${n ? `<span>${n}</span>` : ''}</button>`;
        }).join('')}</div>`;
    }

    function cardHtml(v) {
        const review = (data.reviews || {})[v.id];
        const learned = (data.learned || {})[v.id];
        const isRef = v.kind === 'ref';
        const pick = editing[v.id] || (review && review.verdict) || '';
        const driveId = v.drive_id || '';
        const driveUrl = v.drive_url || (driveId ? `https://drive.google.com/file/d/${driveId}/view` : '');
        const player = driveId
            ? `<iframe src="https://drive.google.com/file/d/${esc(driveId)}/preview" loading="lazy" allow="autoplay; fullscreen" allowfullscreen title="${esc(v.title)}"></iframe>`
            : '<div class="sm-vr-noplay">الفيديو مو موجود</div>';
        const meta = [fmtDate(v.date), v.cost ? `التكلفة ${esc(v.cost)}` : ''].filter(Boolean).join(' · ');

        let reviewBox = '';
        if (!isRef) {
            const saved = review ? `<div class="sm-vr-saved is-${review.verdict === 'approved' ? 'ok' : 'notes'}">${review.verdict === 'approved' ? ICON.check + ' موافق' : ICON.note + ' عندك ملاحظات'}${review.at ? ` · ${esc(fmtDate(review.at))}` : ''}</div>` : '';
            reviewBox = `<div class="sm-vr-review">
                ${saved}
                <div class="sm-vr-verdicts">
                    <button type="button" class="sm-vr-verdict is-ok${pick === 'approved' ? ' is-on' : ''}" data-verdict="approved" data-id="${esc(v.id)}">${ICON.check} موافق</button>
                    <button type="button" class="sm-vr-verdict is-notes${pick === 'notes' ? ' is-on' : ''}" data-verdict="notes" data-id="${esc(v.id)}">${ICON.note} عندي ملاحظات</button>
                </div>
                <textarea class="smp-input sm-vr-note" data-note="${esc(v.id)}" rows="3" dir="auto" placeholder="اكتب ملاحظتك هون (اختياري لو موافق)">${esc(drafts[v.id] != null ? drafts[v.id] : (review ? review.note : ''))}</textarea>
                <button type="button" class="smp-btn is-primary sm-vr-save" data-save="${esc(v.id)}"${busy[v.id] ? ' disabled' : ''}>${busy[v.id] ? 'لحظة…' : 'احفظ رأيي'}</button>
            </div>`;
        }

        return `<article class="sm-vr-card${isRef ? ' is-ref' : ''}">
            <div class="sm-vr-player">${player}</div>
            <div class="sm-vr-info">
                <div class="sm-vr-top"><span class="sm-vr-num">${isRef ? 'المرجع' : '#' + esc(v.n)}</span>${!isRef && !review ? '<span class="sm-vr-wait">بانتظار رأيك</span>' : ''}</div>
                <h4>${esc(v.title)}</h4>
                ${meta ? `<div class="smp-muted">${meta}</div>` : ''}
                ${v.built_on ? `<div class="sm-vr-line"><b>مبني على:</b> ${esc(v.built_on)}</div>` : ''}
                ${v.changes ? `<div class="sm-vr-line"><b>${isRef ? 'ليش مرجع:' : 'إيش تغيّر:'}</b> ${esc(v.changes)}</div>` : ''}
                ${driveUrl ? `<a class="smp-link-btn" href="${esc(driveUrl)}" target="_blank" rel="noopener">${ICON.drive} افتحه بدرايف</a>` : ''}
                ${reviewBox}
                ${learned && learned.text ? `<div class="sm-vr-learned">${ICON.bulb}<div><b>${learned.scope === 'all' ? 'تعلّمته لكل العملاء' : 'تعلّمته لهالعميل'}</b><span>${esc(learned.text)}</span></div></div>` : ''}
            </div>
        </article>`;
    }

    function render() {
        if (!overlay) return;
        const clients = clientList();
        if (!activeClient || !clients.some(c => c.id === activeClient)) {
            const firstWaiting = clients.find(c => waiting(c.id));
            activeClient = (firstWaiting || clients[0] || {}).id || '';
        }
        const client = clients.find(c => c.id === activeClient);
        const videos = client ? videosOf(client.id) : [];
        let body;
        if (!loaded) body = '<div class="smp-muted">عم نجيب الفيديوهات…</div>';
        else if (!clients.length) body = '<div class="smp-muted">لسا ما في فيديوهات.</div>';
        else body = `${chipsHtml(clients)}
            ${client && client.style ? `<p class="sm-vr-style"><b>أسلوب ${esc(client.name)}:</b> ${esc(client.style)}</p>` : ''}
            <div class="sm-vr-grid">${videos.map(cardHtml).join('') || '<div class="smp-muted">ما في فيديوهات لهالعميل.</div>'}</div>`;
        const scroll = overlay.querySelector('.smp-modal-body');
        const top = scroll ? scroll.scrollTop : 0;
        overlay.innerHTML = `<div class="smp-modal sm-vr" role="dialog" aria-modal="true" aria-label="مراجعة الفيديوهات">
            <div class="smp-modal-head"><div><div class="smp-modal-eyebrow">مراجعة الفيديوهات</div><h3 class="smp-modal-title">${client ? `فيديوهات ${esc(client.name)} بالترتيب` : 'فيديوهات العملاء'}</h3></div><button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${ICON.close}</button></div>
            <div class="smp-modal-body is-single">${body}</div>
        </div>`;
        const next = overlay.querySelector('.smp-modal-body');
        if (next) next.scrollTop = top;
    }

    // Re-render only when nothing is being typed, so a live update doesn't wipe a note
    function refresh() {
        const typing = overlay && document.activeElement && overlay.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA';
        if (!typing) render();
    }

    async function save(id) {
        const verdict = editing[id] || ((data.reviews || {})[id] || {}).verdict;
        const note = String(drafts[id] != null ? drafts[id] : ((data.reviews || {})[id] || {}).note || '').trim();
        if (!verdict) return toast('اختار «موافق» أو «عندي ملاحظات» أول');
        if (verdict === 'notes' && !note) return toast('اكتب الملاحظة قبل ما تحفظ');
        busy[id] = true;
        render();
        try {
            await db.ref(`${ROOT}/reviews/${id}`).set({ verdict, note, at: Date.now(), by: (auth.currentUser && auth.currentUser.email) || '' });
            delete editing[id];
            delete drafts[id];
            toast('انحفظ رأيك ✓');
        } catch (e) {
            toast('ما انحفظ: ' + e.message);
        }
        busy[id] = false;
        render();
    }

    function close() {
        if (ref) ref.off();
        ref = null;
        if (overlay) overlay.remove();
        overlay = null;
        editing = {};
        drafts = {};
        busy = {};
    }

    window.openVideoReviews = function () {
        if (!isAdmin(typeof auth !== 'undefined' && auth.currentUser)) return toast('هالقسم للأدمن بس');
        close();
        overlay = document.createElement('div');
        overlay.className = 'smp-overlay is-top';
        overlay.id = 'smVideoReviews';
        document.body.appendChild(overlay);
        loaded = false;
        render();
        overlay.addEventListener('click', e => {
            if (e.target === overlay) return close();
            const t = e.target.closest('button');
            if (!t) return;
            if (t.hasAttribute('data-close')) return close();
            if (t.dataset.client) { activeClient = t.dataset.client; return render(); }
            if (t.dataset.verdict) {
                editing[t.dataset.id] = t.dataset.verdict;
                render();
                const box = overlay.querySelector(`[data-note="${CSS.escape(t.dataset.id)}"]`);
                if (box && t.dataset.verdict === 'notes') box.focus();
                return;
            }
            if (t.dataset.save) return save(t.dataset.save);
        });
        overlay.addEventListener('input', e => {
            if (e.target.dataset && e.target.dataset.note) drafts[e.target.dataset.note] = e.target.value;
        });
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        ref = db.ref(ROOT);
        ref.on('value', snap => {
            data = Object.assign({ clients: {}, videos: {}, reviews: {}, learned: {} }, snap.val() || {});
            loaded = true;
            refresh();
        }, err => {
            loaded = true;
            render();
            toast('ما قدرنا نجيب الفيديوهات: ' + err.message);
        });
    };
})();
