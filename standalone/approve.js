// Video voting page for clients: each person opens the shared link, watches every video
// of the month on Frame.io, and taps approve or reject. Votes are saved per person under
// inside the client's own board (ai_social_lists/<key>/video_votes/<cardId>/<uid>), where the
// share link already lets the client write, and every tap is also kept in video_votes_log.
(function () {
    const firebaseConfig = {
        apiKey: "AIzaSyCBC6_DRCiMwoGPIM1uexpfvXQIaeF-DOc",
        authDomain: "socail-media-creation.firebaseapp.com",
        databaseURL: "https://socail-media-creation-default-rtdb.firebaseio.com",
        projectId: "socail-media-creation",
        storageBucket: "socail-media-creation.firebasestorage.app",
        messagingSenderId: "46695151429",
        appId: "1:46695151429:web:5a0b35f86cd68b27eef02c"
    };
    const DB_URL = firebaseConfig.databaseURL;
    const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const NAME_KEY = 'sm_vote_name';

    const $ = id => document.getElementById(id);
    const listEl = $('list');

    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const showState = text => { listEl.innerHTML = `<div class="state">${esc(text)}</div>`; };

    let toastTimer = null;
    const toast = text => {
        const t = $('toast');
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    };

    const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
    const setName = n => { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* private mode */ } };

    function askName() {
        return new Promise(resolve => {
            const overlay = $('nameOverlay');
            const input = $('nameInput');
            input.value = getName();
            overlay.classList.add('show');
            setTimeout(() => input.focus(), 50);
            $('nameForm').onsubmit = e => {
                e.preventDefault();
                const n = input.value.trim().slice(0, 60);
                if (!n) return;
                setName(n);
                overlay.classList.remove('show');
                showVoter();
                resolve(n);
            };
        });
    }

    function showVoter() {
        const n = getName();
        $('voterBar').style.display = n ? 'flex' : 'none';
        $('voterName').textContent = n;
    }
    $('changeName').onclick = () => askName();

    const id = new URLSearchParams(location.search).get('id');
    if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
        showState('الرابط غير صحيح.');
        return;
    }

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    const auth = firebase.auth();

    let boardId = null;
    let boardKey = null;
    let uid = null;
    const myVotes = {};

    fetch(`${DB_URL}/sm_short_links/${id}.json`)
        .then(r => r.json())
        .then(data => {
            const parts = typeof data === 'string' ? data.split('|') : [];
            if (parts.length < 7 || parts[3] !== 'video_approval') throw new Error('bad link');
            boardId = parts[0];
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            const title = decodeURIComponent(parts[4] || '');
            const secret = parts[6];
            if (title) {
                $('pageTitle').textContent = `فيديوهات ${title}`;
                document.title = `فيديوهات ${title}`;
            }
            $('pageSub').textContent = `${MONTHS[month] || ''} ${year} · شوف كل فيديو واضغط موافق أو مو موافق`;

            const signIn = auth.currentUser ? Promise.resolve({ user: auth.currentUser }) : auth.signInAnonymously();
            return signIn
                .then(cred => {
                    uid = cred.user.uid;
                    return db.ref(`share_grants/${uid}/${boardId}`).set(secret);
                })
                .then(() => db.ref('ai_social_lists').orderByChild('id').equalTo(boardId).once('value'))
                .then(snap => {
                    let board = null;
                    snap.forEach(child => {
                        const v = child.val();
                        if (!board && v && v.id === boardId) { board = v; boardKey = child.key; }
                    });
                    if (!board) throw new Error('board not found');
                    return render(board, month, year);
                });
        })
        .catch(err => {
            console.error(err);
            showState('ما قدرنا نفتح الرابط. تأكد إنه الرابط كامل، أو اطلب رابط جديد.');
        });

    // A card counts as a video for voting when it has a Frame.io link
    function videoLink(card) {
        const items = card.mediaItems || (card.mediaObj ? [card.mediaObj] : []);
        const fio = items.find(m => m && m.type === 'frame-io' && m.url);
        return fio || null;
    }

    // Calendar posts of the month with a Frame.io link, then Frame.io links the agency pasted in (vote_videos)
    function videoItems(board, month, year) {
        const prefix = `${year}-${month}-`;
        const fromCalendar = (board.cards || [])
            .filter(c => c && c.id && c.dateStr && c.dateStr.startsWith(prefix) && !c.isClientDayNote && videoLink(c))
            .sort((a, b) => parseInt(a.dateStr.split('-')[2], 10) - parseInt(b.dateStr.split('-')[2], 10))
            .map(c => {
                const link = videoLink(c);
                const day = parseInt(c.dateStr.split('-')[2], 10);
                return {
                    id: c.id,
                    url: link.url,
                    thumbnail: link.thumbnail || '',
                    label: (c.title || c.fullText || c.idea || c.description || 'فيديو').toString().trim().slice(0, 120),
                    sub: `${day} ${MONTHS[month] || ''} · ${DAYS[new Date(year, month, day).getDay()]}`
                };
            });
        const pasted = (Array.isArray(board.vote_videos) ? board.vote_videos : Object.values(board.vote_videos || {}))
            .filter(v => v && v.id && v.url)
            .map(v => ({ id: v.id, url: v.url, thumbnail: v.thumbnail || '', label: v.title || 'فيديو', sub: '' }));
        return fromCalendar.concat(pasted);
    }

    function render(board, month, year) {
        const items = videoItems(board, month, year);

        if (!items.length) {
            showState('ما فيه فيديوهات لهذا الشهر لسا.');
            return;
        }

        listEl.innerHTML = items.map(c => {
            const thumb = c.thumbnail ? `style="background-image:url('${esc(c.thumbnail)}')"` : '';
            return `
            <div class="video" data-card="${esc(c.id)}">
                <div class="video-top">
                    <div class="thumb" ${thumb}>${c.thumbnail ? '' : '▶'}</div>
                    <div class="video-info">
                        ${c.sub ? `<div class="video-date">${esc(c.sub)}</div>` : ''}
                        <div class="video-title">${esc(c.label)}</div>
                        <a class="watch" href="${esc(c.url)}" target="_blank" rel="noopener">▶ شاهد الفيديو</a>
                    </div>
                </div>
                <div class="votes">
                    <button class="vote-btn yes" type="button" data-vote="approve">موافق ✅</button>
                    <button class="vote-btn no" type="button" data-vote="reject">مو موافق ❌</button>
                </div>
                <div class="my-vote"></div>
            </div>`;
        }).join('');

        showVoter();

        listEl.querySelectorAll('.video').forEach(el => {
            const cardId = el.getAttribute('data-card');
            el.querySelectorAll('.vote-btn').forEach(btn => {
                btn.onclick = () => vote(cardId, btn.getAttribute('data-vote'), el);
            });
            const mine = board.video_votes && board.video_votes[cardId] && board.video_votes[cardId][uid];
            if (mine) { myVotes[cardId] = mine; paint(el, mine); }
        });
    }

    function paint(el, v) {
        el.querySelector('.vote-btn.yes').classList.toggle('on', v && v.vote === 'approve');
        el.querySelector('.vote-btn.no').classList.toggle('on', v && v.vote === 'reject');
        const info = el.querySelector('.my-vote');
        if (v && v.ts) {
            const when = new Date(v.ts).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
            info.textContent = `اخترت ${v.vote === 'approve' ? 'موافق' : 'مو موافق'} · ${when}`;
        } else {
            info.textContent = '';
        }
    }

    async function vote(cardId, choice, el) {
        let name = getName();
        if (!name) name = await askName();
        const btns = el.querySelectorAll('.vote-btn');
        btns.forEach(b => { b.disabled = true; });
        const entry = { name, vote: choice, ts: firebase.database.ServerValue.TIMESTAMP };
        try {
            await db.ref(`ai_social_lists/${boardKey}/video_votes/${cardId}/${uid}`).set(entry);
            // The history line is a nice-to-have; the vote itself is already saved
            db.ref(`ai_social_lists/${boardKey}/video_votes_log/${cardId}`).push({ uid, name, vote: choice, ts: firebase.database.ServerValue.TIMESTAMP })
                .catch(e => console.warn('vote history not saved', e));
            const saved = { name, vote: choice, ts: Date.now() };
            myVotes[cardId] = saved;
            paint(el, saved);
            toast('تم حفظ رأيك، شكراً');
        } catch (err) {
            console.error(err);
            toast('ما انحفظ، جرّب مرة ثانية');
        } finally {
            btns.forEach(b => { b.disabled = false; });
        }
    }
})();
