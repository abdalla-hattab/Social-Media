// Team workspace: the "اليوم" and "المراحل" screens shown above the client calendar ("العملاء").
// Loaded after app_v140.js and uses its globals (boards, activeBoardId, saveState, render).
// Removing this file's <script> and <link> tags brings the old dashboard back unchanged.
(function () {
    const VIEW_KEY = 'sm_workspace_view';
    const FILTER_KEY = 'sm_workspace_filter';
    const STAGES = [
        { key: 'idea', label: 'فكرة' },
        { key: 'writing', label: 'كتابة' },
        { key: 'production', label: 'تصميم ومونتاج' },
        { key: 'approval', label: 'بانتظار العميل' },
        { key: 'scheduled', label: 'مجدول' },
        { key: 'published', label: 'انتشر' }
    ];
    const STAGE_KEYS = STAGES.map(s => s.key);
    const DONE_STAGES = ['scheduled', 'published'];
    // Posts dated before this day were made before stages existed and count as published unless moved
    const TRACK_FROM = new Date(2026, 9, 15);
    const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const COLUMN_LIMIT = 40;
    // Screens shown in the top switch. "today" and "stages" are on hold until the team asks for them;
    // with a single screen the switch is hidden.
    const ENABLED_VIEWS = ['clients'];

    const ICONS = {
        video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
        image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
        instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>',
        facebook: '<svg viewBox="0 0 24 24"><path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/></svg>',
        tiktok: '<svg viewBox="0 0 24 24"><path d="M21 7.9V12a10 10 0 0 1-5-2v4.5a6.5 6.5 0 1 1-8-6.3v4.3a2.5 2.5 0 1 0 4 2V3h4.1A6 6 0 0 0 21 7.9z"/></svg>',
        snapchat: '<svg viewBox="0 0 24 24"><path d="M16.9 7.8a4.9 4.9 0 0 0-9.8 0c0 4.3-.2 6.4-4.1 8.1 2 .9 2 .9 3 3 3 0 4 2 6 2s3-2 6-2c1-2.1 1-2.1 3-3-3.9-1.7-4.1-3.8-4.1-8.1z"/></svg>',
        twitter: '<svg viewBox="0 0 24 24"><path d="M4 4l11.7 16H20L8.3 4zM4 20l6.8-6.8M13.2 10.8L20 4"/></svg>',
        linkedin: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5M8 8v.01M12 16v-5M16 16v-3a2 2 0 0 0-4 0"/></svg>',
        youtube: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
        open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
    };

    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const parseDay = str => {
        const parts = String(str || '').split('-').map(n => parseInt(n, 10));
        if (parts.length !== 3 || parts.some(isNaN)) return null;
        return new Date(parts[0], parts[1], parts[2]);
    };
    const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const dayLabel = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const shortDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const stageLabel = key => (STAGES.find(s => s.key === key) || STAGES[0]).label;

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
    }
    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    }
    function getView() {
        let v = null;
        try { v = localStorage.getItem(VIEW_KEY); } catch (e) { /* private mode */ }
        return ENABLED_VIEWS.includes(v) ? v : 'clients';
    }

    // Active client boards, in the same order as the client pills (the first two social boards are the agency's own)
    function clientBoards() {
        return boards.filter(b => b && b.type === 'social_scheduler').slice(2).filter(b => !b.isInactive);
    }

    // Where a post is in the workflow: an explicit stage set from the stages board wins, then the
    // publish status, then a guess from what the post already has (text, media)
    function postStage(post, day, today) {
        if (post.stage === 'published') return 'published';
        if (post.status === 'فوري') return 'published';
        if (post.status === 'جدولة') return day < today ? 'published' : 'scheduled';
        if (STAGE_KEYS.includes(post.stage)) return post.stage;
        if (day < TRACK_FROM) return 'published';
        const hasMedia = Array.isArray(post.mediaItems) && post.mediaItems.length > 0;
        const hasText = [post.fullText, post.fullTextInstagram, post.fullTextSnapchat, post.fullTextTiktok].some(t => t && String(t).trim()) || (Array.isArray(post.scriptScenes) && post.scriptScenes.length > 0);
        if (hasMedia && hasText) return 'approval';
        if (hasMedia) return 'production';
        if (hasText) return 'writing';
        return 'idea';
    }

    function allPosts() {
        const today = startOfToday();
        const out = [];
        clientBoards().forEach(board => (board.cards || []).forEach(post => {
            if (!post || post.isClientDayNote) return;
            const day = parseDay(post.dateStr);
            if (!day) return;
            const stage = postStage(post, day, today);
            out.push({ board, post, day, stage, late: day < today && !DONE_STAGES.includes(stage) });
        }));
        return out;
    }

    const byTime = (a, b) => (a.post.timeStr || '99:99').localeCompare(b.post.timeStr || '99:99');
    const byDateTime = (a, b) => (a.day - b.day) || byTime(a, b);

    function typeIcon(post) {
        const isVideo = post.postType === 'video';
        return `<span class="sm-ws-type ${isVideo ? 'is-video' : 'is-image'}" title="${isVideo ? 'فيديو' : 'صورة'}">${isVideo ? ICONS.video : ICONS.image}</span>`;
    }
    function platformIcons(post) {
        const list = Array.isArray(post.platforms) ? post.platforms : [];
        return list.filter(p => ICONS[p]).map(p => `<span class="sm-ws-plat is-${p}" title="${p}">${ICONS[p]}</span>`).join('');
    }
    function postTitle(post) {
        return esc(post.title || post.idea || 'منشور بدون عنوان');
    }

    function rowHtml(item, showDate) {
        const { board, post, day, stage, late } = item;
        const when = showDate ? shortDate(day) : (post.timeStr || '—');
        return `<button type="button" class="sm-ws-row" data-board="${esc(board.id)}" data-post="${esc(post.id)}">
            <span class="sm-ws-row-when">${esc(when)}</span>
            <span class="sm-ws-row-main">
                <span class="sm-ws-row-client">${esc(board.title)}</span>
                <span class="sm-ws-row-title">${postTitle(post)}</span>
            </span>
            <span class="sm-ws-row-icons">${typeIcon(post)}${platformIcons(post)}</span>
            <span class="sm-ws-badge is-${late ? 'late' : stage}">${late ? 'متأخر · ' + stageLabel(stage) : stageLabel(stage)}</span>
        </button>`;
    }

    function selectedDay() {
        const saved = window.smWsDay ? parseDay(window.smWsDay) : null;
        return saved || startOfToday();
    }

    function todayHtml() {
        const today = startOfToday();
        const day = selectedDay();
        const posts = allPosts();
        const dayPosts = posts.filter(p => sameDay(p.day, day)).sort(byTime);
        const late = posts.filter(p => p.late).sort(byDateTime);
        const waiting = posts.filter(p => p.stage === 'approval' && p.day >= today);
        const isToday = sameDay(day, today);
        const upcoming = [];
        for (let i = 1; i <= 7; i++) {
            const d = addDays(day, i);
            const list = posts.filter(p => sameDay(p.day, d)).sort(byTime);
            if (list.length) upcoming.push({ d, list });
        }

        return `
        <div class="sm-ws-head">
            <div>
                <div class="sm-ws-eyebrow">${isToday ? 'اليوم' : (sameDay(day, addDays(today, 1)) ? 'بكرا' : (sameDay(day, addDays(today, -1)) ? 'مبارح' : 'يوم'))}</div>
                <h2 class="sm-ws-title">${dayLabel(day)}</h2>
            </div>
            <div class="sm-ws-nav">
                <button type="button" class="sm-ws-icon-btn" data-day-shift="-1" aria-label="اليوم اللي قبل">${ICONS.prev}</button>
                ${isToday ? '' : '<button type="button" class="sm-ws-chip" data-day-shift="0">رجوع لليوم</button>'}
                <button type="button" class="sm-ws-icon-btn" data-day-shift="1" aria-label="اليوم اللي بعد">${ICONS.next}</button>
            </div>
        </div>

        <div class="sm-ws-stats">
            <div class="sm-ws-stat"><span>منشورات ${isToday ? 'اليوم' : 'هاليوم'}</span><b>${dayPosts.length}</b></div>
            <div class="sm-ws-stat is-late"><span>متأخرة</span><b>${late.length}</b></div>
            <div class="sm-ws-stat is-waiting"><span>بانتظار العميل</span><b>${waiting.length}</b></div>
        </div>

        <section class="sm-ws-section">
            <h3>منشورات ${isToday ? 'اليوم' : 'هاليوم'}</h3>
            ${dayPosts.length ? `<div class="sm-ws-list">${dayPosts.map(p => rowHtml(p, false)).join('')}</div>` : '<div class="sm-ws-empty">ما في منشورات بهاليوم</div>'}
        </section>

        ${late.length ? `<section class="sm-ws-section">
            <h3 class="is-late">متأخرة <span>تاريخها راح وما انجدولت</span></h3>
            <div class="sm-ws-list">${late.map(p => rowHtml(p, true)).join('')}</div>
        </section>` : ''}

        <section class="sm-ws-section">
            <h3>الأيام الجاية</h3>
            ${upcoming.length ? upcoming.map(g => `
                <div class="sm-ws-daygroup">
                    <div class="sm-ws-daygroup-label">${dayLabel(g.d)} <span>${g.list.length}</span></div>
                    <div class="sm-ws-list">${g.list.map(p => rowHtml(p, false)).join('')}</div>
                </div>`).join('') : '<div class="sm-ws-empty">ما في منشورات بالأسبوع الجاي</div>'}
        </section>`;
    }

    function stagesState() {
        const now = new Date();
        const saved = readJson(FILTER_KEY, {});
        const month = window.smWsMonth || { year: now.getFullYear(), month: now.getMonth() };
        return { month, client: saved.client || 'all', type: saved.type || 'all' };
    }

    function cardHtml(item) {
        const { board, post, day, late } = item;
        return `<div class="sm-ws-card${late ? ' is-late' : ''}" draggable="true" tabindex="0" role="button" data-board="${esc(board.id)}" data-post="${esc(post.id)}">
            <div class="sm-ws-card-top"><span class="sm-ws-card-client">${esc(board.title)}</span><span class="sm-ws-card-date">${shortDate(day)}</span></div>
            <div class="sm-ws-card-title">${postTitle(post)}</div>
            <div class="sm-ws-card-foot">${typeIcon(post)}${platformIcons(post)}${late ? '<span class="sm-ws-card-late">متأخر</span>' : ''}</div>
        </div>`;
    }

    function stagesHtml() {
        const st = stagesState();
        const clients = clientBoards();
        const posts = allPosts().filter(p =>
            p.day.getFullYear() === st.month.year && p.day.getMonth() === st.month.month &&
            (st.client === 'all' || p.board.id === st.client) &&
            (st.type === 'all' || (st.type === 'video') === (p.post.postType === 'video'))
        ).sort(byDateTime);

        const columns = STAGES.map(s => {
            const items = posts.filter(p => p.stage === s.key);
            const shown = items.slice(0, COLUMN_LIMIT);
            return `<div class="sm-ws-col is-${s.key}" data-stage="${s.key}">
                <div class="sm-ws-col-head"><span>${s.label}</span><b>${items.length}</b></div>
                <div class="sm-ws-col-body">
                    ${shown.map(cardHtml).join('') || '<div class="sm-ws-col-empty">فاضي</div>'}
                    ${items.length > shown.length ? `<div class="sm-ws-col-more">وكمان ${items.length - shown.length}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        return `
        <div class="sm-ws-head">
            <div>
                <div class="sm-ws-eyebrow">لوحة المراحل</div>
                <h2 class="sm-ws-title">${MONTHS[st.month.month]} ${st.month.year}</h2>
            </div>
            <div class="sm-ws-nav">
                <button type="button" class="sm-ws-icon-btn" data-month-shift="-1" aria-label="الشهر اللي قبل">${ICONS.prev}</button>
                <button type="button" class="sm-ws-icon-btn" data-month-shift="1" aria-label="الشهر اللي بعد">${ICONS.next}</button>
            </div>
        </div>
        <div class="sm-ws-filters">
            <select class="sm-ws-select" data-filter="client" aria-label="العميل">
                <option value="all">كل العملاء</option>
                ${clients.map(b => `<option value="${esc(b.id)}"${st.client === b.id ? ' selected' : ''}>${esc(b.title)}</option>`).join('')}
            </select>
            <div class="sm-ws-seg" role="group" aria-label="نوع المنشور">
                ${[['all', 'الكل'], ['video', 'فيديو'], ['image', 'صور']].map(([k, l]) => `<button type="button" data-filter-type="${k}" class="${st.type === k ? 'is-active' : ''}">${l}</button>`).join('')}
            </div>
            <span class="sm-ws-hint">اضغط على أي منشور عشان تنقله لمرحلة تانية</span>
        </div>
        <div class="sm-ws-board">${columns}</div>`;
    }

    function barHtml(view) {
        const lateCount = allPosts().filter(p => p.late).length;
        const tabs = [['today', 'اليوم'], ['stages', 'المراحل'], ['clients', 'العملاء']].filter(([k]) => ENABLED_VIEWS.includes(k));
        if (tabs.length < 2) return '';
        return `<div class="sm-ws-bar"><div class="sm-ws-bar-inner" role="tablist">
            ${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${view === k}" data-view="${k}" class="${view === k ? 'is-active' : ''}">${l}${k === 'today' && lateCount ? `<span class="sm-ws-bar-dot" title="منشورات متأخرة">${lateCount}</span>` : ''}</button>`).join('')}
        </div></div>`;
    }

    function closeMenu() {
        const menu = document.getElementById('smWsMenu');
        if (menu) menu.remove();
        document.removeEventListener('pointerdown', onOutsidePointer, true);
    }
    function onOutsidePointer(e) {
        const menu = document.getElementById('smWsMenu');
        if (menu && !menu.contains(e.target)) closeMenu();
    }

    function findPost(boardId, postId) {
        const board = boards.find(b => b && b.id === boardId);
        const post = board && (board.cards || []).find(c => c && c.id === postId);
        return { board, post };
    }

    function openMenu(cardEl) {
        closeMenu();
        const { post } = findPost(cardEl.dataset.board, cardEl.dataset.post);
        if (!post) return;
        const item = allPosts().find(p => p.post === post);
        const current = item ? item.stage : 'idea';
        const menu = document.createElement('div');
        menu.id = 'smWsMenu';
        menu.className = 'sm-ws-menu';
        menu.innerHTML = `
            <div class="sm-ws-menu-title">${postTitle(post)}</div>
            <div class="sm-ws-menu-label">انقله لـ</div>
            <div class="sm-ws-menu-stages">
                ${STAGES.map(s => `<button type="button" data-move="${s.key}" class="is-${s.key}${s.key === current ? ' is-current' : ''}">${s.label}</button>`).join('')}
            </div>
            <button type="button" class="sm-ws-menu-open" data-open>${ICONS.open} افتح المنشور</button>`;
        document.body.appendChild(menu);

        const rect = cardEl.getBoundingClientRect();
        if (window.innerWidth > 640) {
            const w = menu.offsetWidth, h = menu.offsetHeight;
            let left = rect.left + rect.width / 2 - w / 2;
            left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
            let top = rect.bottom + 8;
            if (top + h > window.innerHeight - 12) top = Math.max(12, rect.top - h - 8);
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        } else {
            menu.classList.add('is-sheet');
        }

        menu.addEventListener('click', e => {
            const move = e.target.closest('[data-move]');
            if (move) { closeMenu(); moveStage(cardEl.dataset.board, cardEl.dataset.post, move.dataset.move); return; }
            if (e.target.closest('[data-open]')) { closeMenu(); openPost(cardEl.dataset.board, cardEl.dataset.post); }
        });
        setTimeout(() => document.addEventListener('pointerdown', onOutsidePointer, true), 0);
    }

    function toast(msg) {
        if (typeof showToast === 'function') showToast(msg); else alert(msg);
    }

    function moveStage(boardId, postId, key) {
        const { post } = findPost(boardId, postId);
        if (!post || !STAGE_KEYS.includes(key)) return;
        const isScheduled = post.status === 'جدولة' || post.status === 'فوري';
        if (isScheduled && !DONE_STAGES.includes(key)) {
            toast('هالمنشور مجدول بنظام النشر. إذا بدك ترجعه، غيّره من نافذة المنشور.');
            return;
        }
        if (typeof window.pushUndoState === 'function') window.pushUndoState();
        post.stage = key;
        post.stageChangedAt = Date.now();
        saveState();
        render();
    }

    function openPost(boardId, postId) {
        const { post } = findPost(boardId, postId);
        if (!post) return;
        const day = parseDay(post.dateStr);
        setView('clients', true);
        activeBoardId = boardId;
        try { localStorage.setItem('ai_active_board', boardId); } catch (e) { /* private mode */ }
        window.activeSocialTab = 'calendar';
        if (day) {
            window.activeSocialMonthView = { year: day.getFullYear(), month: day.getMonth() };
            window.activeSocialDateOptions = { year: day.getFullYear(), month: day.getMonth(), date: day.getDate() };
        }
        render();
        setTimeout(() => { if (typeof window.openCreatePostModal === 'function') window.openCreatePostModal(postId); }, 120);
    }

    function setView(view, skipMount) {
        try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* private mode */ }
        closeMenu();
        if (skipMount) return;
        window.smMountWorkspace();
        const wrapper = document.querySelector('.sm-app-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }

    function bind(wrapper) {
        const bar = wrapper.querySelector(':scope > .sm-ws-bar');
        if (bar) bar.addEventListener('click', e => {
            const btn = e.target.closest('[data-view]');
            if (btn && btn.dataset.view !== getView()) setView(btn.dataset.view);
        });

        const view = wrapper.querySelector(':scope > #smWorkspaceView');
        if (!view) return;

        view.addEventListener('click', e => {
            const row = e.target.closest('.sm-ws-row');
            if (row) { openPost(row.dataset.board, row.dataset.post); return; }
            const card = e.target.closest('.sm-ws-card');
            if (card) { openMenu(card); return; }
            const dayShift = e.target.closest('[data-day-shift]');
            if (dayShift) {
                const n = parseInt(dayShift.dataset.dayShift, 10);
                const d = n === 0 ? startOfToday() : addDays(selectedDay(), n);
                window.smWsDay = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                window.smMountWorkspace();
                return;
            }
            const monthShift = e.target.closest('[data-month-shift]');
            if (monthShift) {
                const st = stagesState();
                const d = new Date(st.month.year, st.month.month + parseInt(monthShift.dataset.monthShift, 10), 1);
                window.smWsMonth = { year: d.getFullYear(), month: d.getMonth() };
                window.smMountWorkspace();
                return;
            }
            const typeBtn = e.target.closest('[data-filter-type]');
            if (typeBtn) {
                writeJson(FILTER_KEY, Object.assign(readJson(FILTER_KEY, {}), { type: typeBtn.dataset.filterType }));
                window.smMountWorkspace();
            }
        });
        view.addEventListener('keydown', e => {
            const card = e.target.closest && e.target.closest('.sm-ws-card');
            if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(card); }
        });
        view.addEventListener('change', e => {
            if (e.target.matches('[data-filter="client"]')) {
                writeJson(FILTER_KEY, Object.assign(readJson(FILTER_KEY, {}), { client: e.target.value }));
                window.smMountWorkspace();
            }
        });

        // Drag a card onto another column (mouse); on touch screens the tap menu does the same job
        view.querySelectorAll('.sm-ws-card').forEach(card => {
            card.addEventListener('dragstart', e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.board + '\n' + card.dataset.post);
                card.classList.add('is-dragging');
                closeMenu();
            });
            card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
        });
        view.querySelectorAll('.sm-ws-col').forEach(col => {
            col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('is-over'); });
            col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
            col.addEventListener('drop', e => {
                e.preventDefault();
                col.classList.remove('is-over');
                const [boardId, postId] = (e.dataTransfer.getData('text/plain') || '').split('\n');
                if (boardId && postId) moveStage(boardId, postId, col.dataset.stage);
            });
        });
    }

    window.smMountWorkspace = function () {
        if (window.isClientView || typeof boards === 'undefined') return;
        const wrapper = document.querySelector('.sm-app-wrapper');
        if (!wrapper) return;
        const oldBoard = wrapper.querySelector(':scope > #smWorkspaceView .sm-ws-board');
        const boardScroll = oldBoard ? oldBoard.scrollLeft : null;
        wrapper.querySelectorAll(':scope > .sm-ws-bar, :scope > #smWorkspaceView').forEach(el => el.remove());
        closeMenu();

        const view = getView();
        document.documentElement.setAttribute('data-sm-ws', view);
        const body = view === 'today' ? todayHtml() : (view === 'stages' ? stagesHtml() : '');
        wrapper.insertAdjacentHTML('afterbegin', barHtml(view) + (body ? `<div id="smWorkspaceView" class="sm-ws-view is-${view}">${body}</div>` : ''));

        const newBoard = wrapper.querySelector(':scope > #smWorkspaceView .sm-ws-board');
        if (newBoard && boardScroll !== null) newBoard.scrollLeft = boardScroll;
        bind(wrapper);
    };

    window.smPostStage = function (post) {
        const day = parseDay(post && post.dateStr);
        return day ? postStage(post, day, startOfToday()) : null;
    };

    if (document.querySelector('.sm-app-wrapper')) window.smMountWorkspace();
})();
