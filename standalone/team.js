// "الفريق" window: add or remove agency team members from inside the dashboard.
// A member is a Firebase email/password account whose uid is in agency_users (the same list the
// sign-in check, the database rules and /api/social use). Names and emails for the list live in
// agency_members. New accounts are created through the Firebase Auth REST API so the owner stays
// signed in.
(function () {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = msg => { if (typeof showToast === 'function') showToast(msg); else alert(msg); };
    const ICON = {
        close: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        eye: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        copy: '<svg class="smp-ic" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
        check: '<svg class="smp-ic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
    };

    const AUTH_ERRORS = {
        EMAIL_EXISTS: 'exists',
        INVALID_EMAIL: 'الإيميل مش مكتوب صح',
        WEAK_PASSWORD: 'كلمة السر لازم تكون 6 حروف أو أكثر',
        MISSING_PASSWORD: 'اكتب كلمة سر',
        INVALID_PASSWORD: 'هالإيميل إله حساب، وكلمة السر مش هي. اكتب كلمة السر اللي بيفوت فيها، أو غيّرها من Firebase',
        INVALID_LOGIN_CREDENTIALS: 'هالإيميل إله حساب، وكلمة السر مش هي. اكتب كلمة السر اللي بيفوت فيها، أو غيّرها من Firebase',
        USER_DISABLED: 'هالحساب موقّف بـ Firebase',
        OPERATION_NOT_ALLOWED: 'تسجيل الدخول بالإيميل مقفل بإعدادات Firebase',
        ADMIN_ONLY_OPERATION: 'إنشاء حسابات جديدة مقفل بإعدادات Firebase (User actions → Enable create)',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كتير. جرّب بعد شوي'
    };

    async function authRest(method, body) {
        const key = firebase.app().options.apiKey;
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ returnSecureToken: false }, body))
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const code = ((data.error && data.error.message) || 'UNKNOWN').split(' ')[0].split(':')[0];
            throw Object.assign(new Error(code), { code });
        }
        return data;
    }

    // Creates the account, or finds it when it already exists and the password matches
    async function accountFor(email, password) {
        try {
            const created = await authRest('signUp', { email, password });
            return { uid: created.localId, isNew: true };
        } catch (e) {
            if (e.code !== 'EMAIL_EXISTS') throw e;
        }
        const existing = await authRest('signInWithPassword', { email, password });
        return { uid: existing.localId, isNew: false };
    }

    let overlay = null;
    let members = [];
    let lastAdded = null;

    async function loadMembers() {
        const [allowed, info] = await Promise.all([
            db.ref('agency_users').once('value').then(s => s.val() || {}),
            db.ref('agency_members').once('value').then(s => s.val() || {}).catch(() => ({}))
        ]);
        const me = auth.currentUser;
        members = Object.keys(allowed).filter(uid => allowed[uid] === true).map(uid => {
            const m = info[uid] || {};
            const isMe = me && me.uid === uid;
            return { uid, isMe, email: m.email || (isMe ? me.email : ''), name: m.name || '', addedAt: m.addedAt || 0 };
        }).sort((a, b) => (b.isMe - a.isMe) || (a.addedAt - b.addedAt));
    }

    function listHtml() {
        if (!members.length) return '<div class="smp-muted">عم نجيب الفريق…</div>';
        return members.map(m => `<div class="smp-acc-row sm-team-row">
            <span class="smp-acc"><span class="smp-acc-initial" style="--h:${(m.email || m.uid).length * 37 % 360}">${esc((m.name || m.email || '?').trim().charAt(0).toUpperCase())}</span></span>
            <div><b>${esc(m.name || m.email || 'عضو بالفريق')}${m.isMe ? ' <span class="sm-team-me">إنت</span>' : ''}</b><small>${esc(m.email || 'انضاف من Firebase')}</small></div>
            ${m.isMe ? '' : `<button type="button" class="smp-link-btn is-danger" data-remove="${esc(m.uid)}">شيل</button>`}
        </div>`).join('');
    }

    function render() {
        if (!overlay) return;
        overlay.innerHTML = `<div class="smp-modal is-narrow" role="dialog" aria-modal="true" aria-label="الفريق">
            <div class="smp-modal-head"><div><div class="smp-modal-eyebrow">الفريق</div><h3 class="smp-modal-title">مين بيقدر يفوت على لوحة التحكم</h3></div><button type="button" class="smp-icon-btn" data-close aria-label="سكّر">${ICON.close}</button></div>
            <div class="smp-modal-body is-single">
                <div class="smp-acc-list">${listHtml()}</div>
                ${lastAdded ? `<div class="sm-team-done">${ICON.check}<div><b>${esc(lastAdded.name || lastAdded.email)} صار بالفريق</b><span>يفوت على الموقع بهالإيميل وكلمة السر اللي كتبتها.</span></div><button type="button" class="smp-btn" data-copy-login>${ICON.copy} انسخ بيانات الدخول</button></div>` : ''}
                <div class="smp-label">أضف عضو</div>
                <form class="sm-team-form" autocomplete="off" novalidate>
                    <input type="text" class="smp-input" name="name" placeholder="الاسم (مثلاً: رانيا)" dir="auto">
                    <input type="email" class="smp-input" name="email" placeholder="الإيميل" dir="ltr" required autocomplete="off">
                    <div class="sm-team-pass"><input type="password" class="smp-input" name="password" placeholder="كلمة سر (6 حروف أو أكثر)" dir="ltr" required minlength="6" autocomplete="new-password"><button type="button" class="smp-icon-btn" data-toggle-pass aria-label="أظهر كلمة السر">${ICON.eye}</button></div>
                    <div class="sm-team-error" role="alert" hidden></div>
                    <button type="submit" class="smp-btn is-primary">أضف للفريق</button>
                </form>
                <p class="smp-hint">إذا الشخص إله حساب من قبل، اكتب نفس كلمة السر اللي بيفوت فيها.</p>
            </div>
        </div>`;
    }

    function showError(msg) {
        const el = overlay && overlay.querySelector('.sm-team-error');
        if (!el) return;
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    async function addMember(form) {
        const name = form.name.value.trim();
        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;
        if (!/^\S+@\S+\.\S+$/.test(email)) return showError('الإيميل مش مكتوب صح');
        if (password.length < 6) return showError('كلمة السر لازم تكون 6 حروف أو أكثر');
        if (members.some(m => m.email && m.email.toLowerCase() === email)) return showError('هالإيميل أصلاً بالفريق');
        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'لحظة…';
        showError('');
        try {
            const { uid, isNew } = await accountFor(email, password);
            await db.ref('agency_users/' + uid).set(true);
            await db.ref('agency_members/' + uid).set({ email, name, addedAt: Date.now(), addedBy: (auth.currentUser && auth.currentUser.email) || '' });
            lastAdded = { email, name, password, isNew };
            await loadMembers();
            render();
            toast('انضاف للفريق ✓');
        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'أضف للفريق';
            const msg = AUTH_ERRORS[e.code];
            showError(msg && msg !== 'exists' ? msg : (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message) ? 'ما عندك صلاحية تضيف أعضاء' : 'صار خطأ: ' + e.message));
        }
    }

    async function removeMember(uid) {
        const m = members.find(x => x.uid === uid);
        const go = async () => {
            try {
                await db.ref('agency_users/' + uid).remove();
                await db.ref('agency_members/' + uid).remove().catch(() => {});
                await loadMembers();
                render();
                toast('انشال من الفريق');
            } catch (e) {
                toast('ما قدرنا نشيله: ' + e.message);
            }
        };
        const label = m ? (m.name || m.email || 'هالعضو') : 'هالعضو';
        if (typeof window.showConfirmModal === 'function' && document.getElementById('globalConfirmModal')) window.showConfirmModal(go, `تشيل ${label} من الفريق؟`, 'ما رح يقدر يفوت على لوحة التحكم بعدها.');
        else if (window.confirm(`تشيل ${label} من الفريق؟`)) go();
    }

    function close() {
        if (overlay) overlay.remove();
        overlay = null;
        lastAdded = null;
    }

    window.openTeamModal = async function () {
        close();
        overlay = document.createElement('div');
        overlay.className = 'smp-overlay is-top';
        overlay.id = 'smTeam';
        document.body.appendChild(overlay);
        members = [];
        render();
        overlay.addEventListener('click', e => {
            if (e.target === overlay) return close();
            const t = e.target.closest('button');
            if (!t) return;
            if (t.hasAttribute('data-close')) return close();
            if (t.dataset.remove) return removeMember(t.dataset.remove);
            if (t.hasAttribute('data-toggle-pass')) {
                const input = overlay.querySelector('input[name="password"]');
                input.type = input.type === 'password' ? 'text' : 'password';
                return;
            }
            if (t.hasAttribute('data-copy-login') && lastAdded) {
                const text = `رابط لوحة التحكم: ${location.origin}\nالإيميل: ${lastAdded.email}\nكلمة السر: ${lastAdded.password}`;
                navigator.clipboard.writeText(text).then(() => toast('انسخ ✓ ابعته للموظف'), () => toast('ما قدرنا ننسخ'));
            }
        });
        overlay.addEventListener('submit', e => {
            e.preventDefault();
            addMember(e.target);
        });
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        try {
            await loadMembers();
        } catch (e) {
            members = [];
        }
        render();
    };
})();
