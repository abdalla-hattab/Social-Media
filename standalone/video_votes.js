// "موافقة الفيديوهات" window: makes the client's voting link (approve.html) and shows, for every
// video of the month, who voted approve or reject and when. Votes live in video_votes/<boardId>,
// one entry per voter per video, written by the client page approve.js.
(function () {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = msg => { if (typeof showToast === 'function') showToast(msg); else alert(msg); };
    const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const ICON = {
        close: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        copy: '<svg class="smp-ic" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>'
    };

    let overlay = null;
    let votesRef = null;
    let votes = {};
    let ctx = null;
    let lastLink = '';

    const videoLink = card => {
        const items = card.mediaItems || (card.mediaObj ? [card.mediaObj] : []);
        return items.find(m => m && m.type === 'frame-io' && m.url) || null;
    };

    const fmtTime = ts => ts ? new Date(ts).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';

    function monthCards() {
        const board = (typeof boards !== 'undefined' ? boards : []).find(b => b.id === ctx.boardId);
        if (!board) return [];
        const prefix = `${ctx.year}-${ctx.month}-`;
        return (board.cards || [])
            .filter(c => c && c.id && c.dateStr && c.dateStr.startsWith(prefix) && !c.isClientDayNote && videoLink(c))
            .sort((a, b) => parseInt(a.dateStr.split('-')[2], 10) - parseInt(b.dateStr.split('-')[2], 10));
    }

    function videoRow(c) {
        const link = videoLink(c);
        const day = parseInt(c.dateStr.split('-')[2], 10);
        const label = (c.title || c.fullText || c.idea || c.description || 'فيديو').toString().trim().slice(0, 90);
        const list = Object.values(votes[c.id] || {}).filter(v => v && v.vote).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const yes = list.filter(v => v.vote === 'approve').length;
        const no = list.filter(v => v.vote === 'reject').length;
        let verdict = '<span class="vv-badge">ما فيه أصوات لسا</span>';
        if (yes > no) verdict = '<span class="vv-badge is-yes">الأغلبية موافقين</span>';
        else if (no > yes) verdict = '<span class="vv-badge is-no">الأغلبية مو موافقين</span>';
        else if (yes) verdict = '<span class="vv-badge is-tie">متعادل</span>';
        const voters = list.length ? list.map(v => `<div class="vv-voter">
                <span class="vv-dot ${v.vote === 'approve' ? 'is-yes' : 'is-no'}"></span>
                <b>${esc(v.name)}</b>
                <span>${v.vote === 'approve' ? 'موافق' : 'مو موافق'}</span>
                <span class="vv-time">${esc(fmtTime(v.ts))}</span>
            </div>`).join('') : '';
        return `<div class="vv-video">
            <div class="vv-video-head">
                <div class="vv-thumb" ${link.thumbnail ? `style="background-image:url('${esc(link.thumbnail)}')"` : ''}>${link.thumbnail ? '' : '▶'}</div>
                <div class="vv-video-info">
                    <div class="vv-date">${day} ${MONTHS[ctx.month]}</div>
                    <div class="vv-title">${esc(label)}</div>
                    <a href="${esc(link.url)}" target="_blank" rel="noopener" class="smp-link-btn">شاهد الفيديو</a>
                </div>
                <div class="vv-counts"><span class="is-yes">✅ ${yes}</span><span class="is-no">❌ ${no}</span></div>
            </div>
            <div class="vv-verdict">${verdict}</div>
            ${voters ? `<div class="vv-voters">${voters}</div>` : ''}
        </div>`;
    }

    function render() {
        if (!overlay) return;
        const cards = monthCards();
        const body = cards.length
            ? cards.map(videoRow).join('')
            : '<div class="smp-muted">ما فيه فيديوهات بهالشهر. الفيديو لازم يكون فيه رابط Frame.io عشان يطلع هنا.</div>';
        overlay.innerHTML = `<div class="smp-modal" role="dialog" aria-modal="true" aria-label="موافقة الفيديوهات">
            <div class="smp-modal-head"><div><div class="smp-modal-eyebrow">موافقة الفيديوهات · ${MONTHS[ctx.month]} ${ctx.year}</div><h3 class="smp-modal-title">${esc(ctx.title)}: مين وافق على إيش</h3></div><button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${ICON.close}</button></div>
            <div class="smp-modal-body is-single">
                <div class="vv-share">
                    <div><b>رابط التصويت للعميل</b><span>كل واحد يفتحه، يكتب اسمه، ويضغط موافق أو مو موافق لكل فيديو.</span></div>
                    <button type="button" class="smp-btn is-primary" data-make-link>${ICON.copy} ${lastLink ? 'انسخ الرابط مرة ثانية' : 'انسخ رابط التصويت'}</button>
                </div>
                ${lastLink ? `<input class="smp-input vv-link" dir="ltr" readonly value="${esc(lastLink)}">` : ''}
                <div class="vv-list">${body}</div>
            </div>
        </div>`;
    }

    function close() {
        if (votesRef) votesRef.off();
        votesRef = null;
        if (overlay) overlay.remove();
        overlay = null;
        votes = {};
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
            const t = e.target.closest('button');
            if (!t) return;
            if (t.hasAttribute('data-close')) return close();
            if (t.hasAttribute('data-make-link')) return makeLink(t);
        });
        votesRef = db.ref('video_votes/' + boardId);
        votesRef.on('value', snap => { votes = snap.val() || {}; render(); }, err => {
            console.error(err);
            const list = overlay && overlay.querySelector('.vv-list');
            if (list) list.insertAdjacentHTML('afterbegin', '<div class="smp-muted">ما قدرنا نقرأ الأصوات. تأكد إن قواعد Firebase الجديدة انحطت.</div>');
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
        .vv-list { display: flex; flex-direction: column; gap: 10px; }
        .vv-video { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #fff; }
        .vv-video-head { display: flex; gap: 12px; align-items: center; }
        .vv-thumb { width: 48px; height: 64px; border-radius: 10px; background: #eef1f7 center/cover no-repeat; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
        .vv-video-info { flex: 1; min-width: 0; }
        .vv-date { font-size: 12px; color: #94a3b8; font-weight: 600; }
        .vv-title { font-size: 14px; font-weight: 600; color: #0f172a; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .vv-counts { display: flex; flex-direction: column; gap: 2px; font-weight: 700; font-size: 14px; text-align: left; }
        .vv-counts .is-yes { color: #16a34a; } .vv-counts .is-no { color: #dc2626; }
        .vv-verdict { margin-top: 8px; }
        .vv-badge { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #f1f5f9; color: #64748b; }
        .vv-badge.is-yes { background: #dcfce7; color: #166534; }
        .vv-badge.is-no { background: #fee2e2; color: #991b1b; }
        .vv-badge.is-tie { background: #fef3c7; color: #92400e; }
        .vv-voters { margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .vv-voter { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
        .vv-voter b { color: #0f172a; }
        .vv-time { margin-inline-start: auto; color: #94a3b8; font-size: 12px; }
        .vv-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .vv-dot.is-yes { background: #16a34a; } .vv-dot.is-no { background: #dc2626; }
        @media (max-width: 600px) { .vv-share { flex-direction: column; align-items: stretch; } }
    `;
    document.head.appendChild(style);
})();
