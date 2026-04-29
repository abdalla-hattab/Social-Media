const firebaseConfig = {
  apiKey: "AIzaSyCBC6_DRCiMwoGPIM1uexpfvXQIaeF-DOc",
  authDomain: "socail-media-creation.firebaseapp.com",
  databaseURL: "https://socail-media-creation-default-rtdb.firebaseio.com",
  projectId: "socail-media-creation",
  storageBucket: "socail-media-creation.firebasestorage.app",
  messagingSenderId: "46695151429",
  appId: "1:46695151429:web:5a0b35f86cd68b27eef02c"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let boards = [];
let localBoards = [];
let cloudBoards = [];
const smUrlParams = new URLSearchParams(window.location.search);

window.isClientView = smUrlParams.get('client_view') === 'true';
window.shortClientMonth = null;
window.shortClientYear = null;
window.isResolvingShortLink = false;

let activeBoardId = smUrlParams.get('board_id') || localStorage.getItem('ai_active_board');
let activeCardId = null;
let activeTargetListId = null;
let isGlobalDragging = false;
let isApplyingFirebaseSync = false;

const superShortId = smUrlParams.get('id');
if (superShortId) {
    window.isClientView = true;
    window.isResolvingShortLink = true;
    const ref = db.ref('sm_short_links/' + superShortId);
    
    // Fallback timeout bumped to 10 seconds to accommodate slower client connections
    const timeout = setTimeout(() => {
        ref.off('value');
        window.isResolvingShortLink = false;
        if (typeof render === 'function') render();
    }, 10000);

    ref.on('value', snap => {
        const fullC = snap.val();
        if (fullC) {
            clearTimeout(timeout);
            ref.off('value'); // Stop listening once we successfully fetch the board
            
            let parts;
            if (fullC.includes('|')) {
                parts = fullC.split('|');
            } else {
                // Fallback for old links with hyphens
                let tempParts = fullC.split('-');
                if (tempParts.length >= 3) {
                    let yr = tempParts.pop();
                    let mo = tempParts.pop();
                    let bId = tempParts.join('-');
                    parts = [bId, mo, yr];
                } else {
                    parts = tempParts;
                }
            }

            if (parts.length >= 1) {
                activeBoardId = parts[0];
                localStorage.setItem('ai_active_board', activeBoardId);
            }
            if (parts.length >= 2) window.shortClientMonth = parts[1];
            if (parts.length >= 3) window.shortClientYear = parts[2];
            
            if (window.shortClientMonth && window.shortClientYear) {
                window.activeSocialMonthView = { year: parseInt(window.shortClientYear, 10), month: parseInt(window.shortClientMonth, 10) };
                window.activeSocialDateOptions = { year: parseInt(window.shortClientYear, 10), month: parseInt(window.shortClientMonth, 10), date: 1 };
            }
            
            window.isResolvingShortLink = false;
            // Delay rendering slightly just to allow other synchronous listeners to trigger
            setTimeout(() => { if (typeof render === 'function') render(); }, 50);
        } else if (fullC === null) {
            // Short link does not exist in DB (invalid link)
            clearTimeout(timeout);
            ref.off('value');
            window.isResolvingShortLink = false;
            if (typeof render === 'function') render();
        }
    });
}

const shortC = smUrlParams.get('c');
if (shortC) {
    window.isClientView = true;
    let parts = shortC.split('-');
    if (parts.length >= 3) {
        window.shortClientYear = parts.pop();
        window.shortClientMonth = parts.pop();
        activeBoardId = parts.join('-');
        localStorage.setItem('ai_active_board', activeBoardId);
    } else if (parts.length >= 1) {
        activeBoardId = parts[0];
        localStorage.setItem('ai_active_board', activeBoardId);
    }
}

if (window.isClientView) {
    // Inject global CSS rule to ensure these elements stay hidden permanently overriding inline styles
    const styleNode = document.createElement('style');
    styleNode.innerHTML = `
        .sm-upload-prompt-dashed,
        #smUploadPrompt,
        #frameIoLabel,
        #frameIoContainer {
            display: none !important;
        }
    `;
    document.head.appendChild(styleNode);

    document.addEventListener("DOMContentLoaded", () => {
        // Run immediately and also in an interval just in case of race conditions
        const enforceClientView = () => {
            const prompt = document.getElementById("smUploadPrompt");
            if (prompt) {
                prompt.style.setProperty("display", "none", "important");
                prompt.style.cssText = "display: none !important;";
                
                const publishSec = document.getElementById("publishSection");
                if (publishSec) {
                    publishSec.style.setProperty("display", "none", "important");
                } else {
                    document.querySelectorAll(".sm-modal-section").forEach(sec => {
                        if (sec.innerHTML.includes("النشر") && sec.innerHTML.includes("مسودة")) {
                            sec.style.setProperty("display", "none", "important");
                        }
                    });
                }
            }
        };
        enforceClientView();
        setTimeout(enforceClientView, 500);
        setTimeout(enforceClientView, 1500);
    });
}


window.agencyAuthPassed = false;
if (!window.isClientView) {
    if (localStorage.getItem('agency_auth_token') === 'verified') {
        window.agencyAuthPassed = true;
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            const overlay = document.getElementById('agencyAuthOverlay');
            const mainContainer = document.getElementById('appContainer');
            if (overlay && mainContainer) {
                overlay.style.display = 'flex';
                mainContainer.style.display = 'none';
            }
        });
    }
} else {
    window.agencyAuthPassed = true;
}

window.verifyAgencyAuth = function() {
    const input = document.getElementById('agencyAuthInput').value;
    const errorEl = document.getElementById('agencyAuthError');
    const btn = document.getElementById('agencyAuthBtn');
    
    if (!input) return;
    btn.innerText = "جاري التحقق...";
    btn.style.opacity = '0.7';
    
    db.ref('agency_settings/password').once('value').then(snap => {
        let realPassword = snap.val();
        if (!realPassword) {
            // Uninitialized password, default to admin123
            realPassword = 'admin123';
            db.ref('agency_settings/password').set(realPassword);
        }
        
        if (input === realPassword) {
            localStorage.setItem('agency_auth_token', 'verified');
            window.agencyAuthPassed = true;
            if (document.activeElement) document.activeElement.blur();
            document.getElementById('agencyAuthOverlay').style.display = 'none';
            document.getElementById('appContainer').style.display = '';
            if (typeof render === 'function') render();
        } else {
            errorEl.style.display = 'block';
            btn.innerText = "الدخول للوحة التحكم";
            btn.style.opacity = '1';
        }
    }).catch(e => {
        errorEl.innerText = "حدث خطأ في الاتصال بالسيرفر";
        errorEl.style.display = 'block';
        btn.innerText = "الدخول للوحة التحكم";
        btn.style.opacity = '1';
    });
};

let rawOldListsData = localStorage.getItem('ai_accounts_lists');

// Initial hydration from what we have
function syncBoardsArray() {
    boards = [...cloudBoards];
}
syncBoardsArray();

// Migrate Kanban structure
function ensureBoardStructure() {
    boards.forEach(b => {
        if (!b.type) {
            if (b.title.trim().toLowerCase() === 'managing') b.type = 'kanban';
            else b.type = 'timer';
        }
        if (b.type === 'kanban' && !b.lists) {
            b.lists = [
                { id: 'list-' + Date.now(), title: b.title, cards: (b.cards || []), x: 40, y: 80 }
            ];
            delete b.cards;
        }
        if (b.type === 'kanban') {
            b.connections = b.connections || [];
            b.lists.forEach((l, i) => {
                if (l.x === undefined) l.x = 40 + (i * 340);
                if (l.y === undefined) l.y = 80;
            });
        }
        if (b.type === 'social_scheduler' && (b.title === 'Social Scheduler 📅' || b.title === 'Social Scheduler')) {
            b.title = 'Client 1';
        }
    });

    if (boards.length === 0) {
        // Auto-create the default Social Scheduler
        const defaultBoard = {
            id: 'board-social-default',
            title: 'Client 1',
            type: 'social_scheduler',
            lists: [],
            cards: [],
        };
        boards.push(defaultBoard);
        cloudBoards.push(defaultBoard);
    }

    if (!activeBoardId && boards.length > 0) {
        const sBoards = boards.filter(b => b.type === 'social_scheduler');
        activeBoardId = sBoards.length > 2 ? sBoards[2].id : boards[0].id;
    }
}

ensureBoardStructure();

// Setup Firebase real-time listener for Social Scheduler ONLY
window.isCloudDataLoaded = false;
db.ref('ai_social_lists').on('value', (snapshot) => {
    isApplyingFirebaseSync = true;
    window.isCloudDataLoaded = true;
    const data = snapshot.val();
    if (data) {
        cloudBoards = data;
        syncBoardsArray();
        ensureBoardStructure();
        if (typeof render === 'function') render();
    } else {
        // Initial Firebase migration (extract from old local database and push)
        if (rawOldListsData) {
            try {
                let oldBoards = JSON.parse(rawOldListsData);
                cloudBoards = oldBoards.filter(b => b.type === 'social_scheduler');
                if (cloudBoards.length > 0) {
                    db.ref('ai_social_lists').set(cloudBoards);
                }
            } catch(e) {}
        }
        syncBoardsArray();
        ensureBoardStructure();
        if (typeof render === 'function') render();
    }
    setTimeout(() => { isApplyingFirebaseSync = false; }, 500); 
});

function saveState() {
    if (isApplyingFirebaseSync) return; 
    
    cloudBoards = boards.filter(b => b.type === 'social_scheduler');

    // Push cloud boards to Firebase
    db.ref('ai_social_lists').set(cloudBoards).catch(err => console.error("Firebase Sync Error", err));
}

function ensureCardChecklist(card) {
    if (!card) return [];
    if (!Array.isArray(card.serviceChecklist)) {
        const legacyChecklist = Array.isArray(card.services)
            ? card.services
                .filter(item => item && typeof item === 'object' && typeof item.name === 'string')
                .map(item => ({ text: item.name.trim(), checked: !!item.checked }))
                .filter(item => item.text)
            : [];
        card.serviceChecklist = legacyChecklist;
    }
    card.serviceChecklist = card.serviceChecklist
        .map(item => {
            if (typeof item === 'string') {
                const text = item.trim();
                return text ? { text, checked: false } : null;
            }
            if (!item || typeof item !== 'object') return null;
            const text = typeof item.text === 'string'
                ? item.text.trim()
                : (typeof item.name === 'string' ? item.name.trim() : '');
            if (!text) return null;
            return { text, checked: !!item.checked };
        })
        .filter(Boolean);
    return card.serviceChecklist;
}

function cloneCardChecklist(card) {
    return ensureCardChecklist(card).map(item => ({ text: item.text, checked: !!item.checked }));
}

function renderCardChecklistEditor(card, options = {}) {
    const servicesList = document.getElementById('servicesList');
    const servicesItemInput = document.getElementById('servicesItemInput');
    const addServicesItemBtn = document.getElementById('addServicesItemBtn');
    if (!servicesList || !servicesItemInput || !addServicesItemBtn) return;

    const checklist = ensureCardChecklist(card);
    servicesList.innerHTML = '';

    if (checklist.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.textContent = options.emptyText || 'No service items yet. Add the agreed services below.';
        emptyState.style.fontSize = '13px';
        emptyState.style.color = '#5e6c84';
        emptyState.style.fontStyle = 'italic';
        servicesList.appendChild(emptyState);
    } else {
        checklist.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'nc-service-row' + (item.checked ? ' nc-is-checked' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'nc-modal-cb';
            checkbox.checked = !!item.checked;
            checkbox.onchange = () => {
                const isChecked = checkbox.checked;
                textInput.classList.toggle('nc-done', isChecked);
                checklist[index].checked = isChecked;
                saveState();
                setTimeout(() => {
                    render();
                    renderCardChecklistEditor(card, options);
                }, 0);
            };

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.value = item.text;
            textInput.placeholder = 'Describe the service';
            textInput.className = 'nc-service-text' + (item.checked ? ' nc-done' : '');
            textInput.oninput = () => {
                checklist[index].text = textInput.value;
            };
            textInput.onblur = () => {
                const value = textInput.value.trim();
                let needsRender = false;
                if (!value) {
                    checklist.splice(index, 1);
                    needsRender = true;
                } else {
                    if (checklist[index].text !== value) {
                        checklist[index].text = value;
                    }
                }
                saveState();
                if (needsRender) {
                    setTimeout(() => {
                        render();
                        renderCardChecklistEditor(card, options);
                    }, 0);
                }
            };
            textInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    textInput.blur();
                }
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '×';
            deleteBtn.className = 'nc-del-btn';
            if(deleteBtn) deleteBtn.onclick = () => {
                checklist.splice(index, 1);
                saveState();
                render();
                renderCardChecklistEditor(card, options);
            };

            row.appendChild(checkbox);
            row.appendChild(textInput);
            row.appendChild(deleteBtn);
            servicesList.appendChild(row);
        });
    }

    const handleAddService = () => {
        const value = servicesItemInput.value.trim();
        if (!value) return;
        checklist.push({ text: value, checked: false });
        servicesItemInput.value = '';
        saveState();
        render();
        renderCardChecklistEditor(card, options);
        servicesItemInput.focus();
    };

    if(addServicesItemBtn) addServicesItemBtn.onclick = handleAddService;
    addServicesItemBtn.onmousedown = (e) => {
        e.preventDefault();
        handleAddService();
    };

    servicesItemInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddService();
        }
    };
}

// DOM Elements
const appContainer = document.getElementById('appContainer');

window.globalDeleteTargetId = null;
window.globalDeleteStepCount = 0;

window.promptSecureDelete = function(bId, bTitle) {
    if (boards.length <= 1) {
        alert("لا يمكنك حذف المساحة الوحيدة المتبقية.");
        return;
    }
    window.globalDeleteTargetId = bId;
    window.globalDeleteStepCount = 0;
    
    let dm = document.getElementById('secureDeleteModal');
    if (!dm) {
        dm = document.createElement('div');
        dm.id = 'secureDeleteModal';
        dm.className = 'modal-overlay';
        dm.innerHTML = `
            <div class="modal-content" style="text-align: center; max-width: 380px;">
                <div class="modal-header" style="justify-content: center; flex-direction: column; border-bottom: none; padding-bottom: 0;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <h3 style="color: #ef4444; font-size: 20px;">تأكيد مسح المساحة المتقدم</h3>
                    <p style="color: #4a5568; font-size: 14px; margin-top: 8px;">هل أنت متأكد أنك تريد حذف: <strong id="secureDeleteTitle" style="color: #172b4d;"></strong>؟</p>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
                    <div id="secureDeleteMsg" style="font-size: 13px; font-weight: 600; color: #1a202c; min-height: 44px; display: flex; align-items: center; justify-content: center; background: #fff5f5; padding: 4px; border-radius: 6px; border: 1px dashed #feb2b2;"></div>
                    <button id="secureDeleteBtn" style="background: #ef4444; color: #fff; padding: 14px; border-radius: 6px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; user-select: none; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);">انقر هنا 3 مرات متتالية بالماوس للحذف</button>
                    <button onclick="document.getElementById('secureDeleteModal').classList.remove('active')" style="background: transparent; color: #718096; padding: 10px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 13px; text-decoration: underline;">تراجع وإغلاق النافذة</button>
                </div>
            </div>
        `;
        document.body.appendChild(dm);
        
        const btn = document.getElementById('secureDeleteBtn');
        if(btn) btn.addEventListener('keydown', (e) => {
            e.preventDefault();
        });
        
        if(btn) btn.onclick = (e) => {
            if (e.detail === 0 || (e.clientX === 0 && e.clientY === 0) || !e.isTrusted) {
                return;
            }
            window.globalDeleteStepCount++;
            const msgEl = document.getElementById('secureDeleteMsg');
            if (window.globalDeleteStepCount === 1) {
                btn.style.background = '#dc2626';
                btn.style.transform = 'scale(0.98)';
                setTimeout(() => btn.style.transform = 'none', 100);
                msgEl.textContent = 'تأكيد 1/3: لا يمكن التراجع عن هذا الإجراء إطلاقا.';
                btn.textContent = 'انقر مرة أخرى (تبقت نقرتان بالماوس)';
            } else if (window.globalDeleteStepCount === 2) {
                btn.style.background = '#b91c1c';
                btn.style.transform = 'scale(0.96)';
                setTimeout(() => btn.style.transform = 'none', 100);
                msgEl.textContent = 'تأكيد 2/3: سيتم مسح جميع بيانات العميل و المنشورات تماماً.';
                btn.textContent = 'انقر للحذف النهائي والكامل';
            } else if (window.globalDeleteStepCount >= 3) {
                window.executeSecureDelete();
            }
        };
    }
    
    document.getElementById('secureDeleteTitle').textContent = bTitle || 'هذه المساحة';
    const msg = document.getElementById('secureDeleteMsg');
    msg.textContent = 'يتطلب الفحص الأمني 3 نقرات يدوية بالماوس لمنع الحذف بالخطأ من لوحة المفاتيح.';
    msg.style.color = '#c53030';
    
    const btn = document.getElementById('secureDeleteBtn');
    btn.style.background = '#ef4444';
    btn.textContent = 'انقر هنا 3 مرات بالماوس للحذف';
    
    dm.classList.add('active');
};

window.executeSecureDelete = function() {
    const targetBoard = boards.find(bd => bd.id === window.globalDeleteTargetId);
    boards = boards.filter(bd => bd.id !== window.globalDeleteTargetId);
    
    if (activeBoardId === window.globalDeleteTargetId) {
        const nextBoard = boards.find(b => targetBoard && b.type === targetBoard.type) || boards[0];
        activeBoardId = nextBoard ? nextBoard.id : null;
    }
    saveState();
    
    const dm = document.getElementById('secureDeleteModal');
    if (dm) dm.classList.remove('active');
    
    const cm = document.getElementById('switchBoardModal');
    if (cm) cm.classList.remove('active');
    
    if (typeof render === 'function') render();
    if (typeof showToast === 'function') showToast("تم مسح المساحة بالكامل بنجاح.");
};

const switchBoardModal = document.getElementById('switchBoardModal');
const boardListMenu = document.getElementById('boardListMenu');
const openSwitchBoardsBtn = document.getElementById('openSwitchBoardsBtn');
const closeSwitchBoardModal = document.getElementById('closeSwitchBoardModal');

const addBoardModal = document.getElementById('addBoardModal');
const closeAddBoardModal = document.getElementById('closeAddBoardModal');
const newBoardTitle = document.getElementById('newBoardTitle');
const confirmAddBoardBtn = document.getElementById('confirmAddBoardBtn');
const openAddTimerBoardBtn = document.getElementById('openAddTimerBoardBtn');
const openAddKanbanBoardBtn = document.getElementById('openAddKanbanBoardBtn');
const openAddSocialBoardBtn = document.getElementById('openAddSocialBoardBtn');
let pendingNewBoardType = 'timer';

const addCardModal = document.getElementById('addCardModal');
const closeAddModal = document.getElementById('closeAddModal');
const confirmAddBtn = document.getElementById('confirmAddBtn');
const newCardTitle = document.getElementById('newCardTitle');
const newCardDays = document.getElementById('newCardDays');
const newCardHours = document.getElementById('newCardHours');
const newCardMins = document.getElementById('newCardMins');

const timerModal = document.getElementById('modal');
const closeTimerModal = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const saveTimerBtn = document.getElementById('saveTimerBtn');
const removeTimerBtn = document.getElementById('removeTimerBtn');
const deleteCardBtn = document.getElementById('deleteCardBtn');
const timerInputsSection = document.getElementById('timerInputsSection');

const inputDays = document.getElementById('inputDays');
const inputHours = document.getElementById('inputHours');
const inputMins = document.getElementById('inputMins');

[inputDays, inputHours, inputMins, newCardDays, newCardHours, newCardMins].forEach(input => {
    if (!input) return;
    if(input) input.addEventListener('focus', function() { if (this.value === '0') this.value = ''; });
    if(input) input.addEventListener('blur', function() { if (this.value === '') this.value = '0'; });
    input.addEventListener('input', function() {
        if (this.value.length > 1 && this.value.startsWith('0')) {
            this.value = parseInt(this.value, 10);
        }
    });
});

const toast = document.getElementById('toast');
const toggleNavPosBtn = document.getElementById('toggleNavPosBtn');
const topNavBar = document.querySelector('.top-nav-bar');

const trelloCardDetailsModal = document.getElementById('trelloCardDetailsModal');
const closeTrelloCardDetailsModalBtn = document.getElementById('closeTrelloCardDetailsModalBtn');
const trelloHistoryDisplayArea = document.getElementById('trelloHistoryDisplayArea');

if (closeTrelloCardDetailsModalBtn) {
    if(closeTrelloCardDetailsModalBtn) closeTrelloCardDetailsModalBtn.onclick = () => trelloCardDetailsModal.classList.remove('active');
}

// Trello Globals
let trelloKey = localStorage.getItem('trelloKey') || '';
let trelloToken = localStorage.getItem('trelloToken') || '';

// Trello Auth Modals & Logic
const trelloSettingsModal = document.getElementById('trelloSettingsModal');
const closeTrelloSettingsModal = document.getElementById('closeTrelloSettingsModal');
const trelloApiKeyInput = document.getElementById('trelloApiKey');
const trelloTokenInput = document.getElementById('trelloToken');
const fetchTrelloBoardsBtn = document.getElementById('fetchTrelloBoardsBtn');
const trelloBoardSelectGroup = document.getElementById('trelloBoardSelectGroup');
const trelloBoardSelect = document.getElementById('trelloBoardSelect');
const saveTrelloSettingsBtn = document.getElementById('saveTrelloSettingsBtn');

if (closeTrelloSettingsModal) {
    if(closeTrelloSettingsModal) closeTrelloSettingsModal.onclick = () => trelloSettingsModal.classList.remove('active');
}

function openTrelloSettingsModal() {
    trelloApiKeyInput.value = localStorage.getItem('trelloKey') || '';
    trelloTokenInput.value = localStorage.getItem('trelloToken') || '';
    
    trelloBoardSelectGroup.style.display = 'none';
    trelloBoardSelect.innerHTML = '';
    
    trelloSettingsModal.classList.add('active');
}

if (fetchTrelloBoardsBtn) {
    if(fetchTrelloBoardsBtn) fetchTrelloBoardsBtn.onclick = async () => {
        const key = trelloApiKeyInput.value.trim();
        const token = trelloTokenInput.value.trim();
        if(!key || !token) {
            showToast("Enter both Key and Token first");
            return;
        }
        
        const btnText = fetchTrelloBoardsBtn.textContent;
        fetchTrelloBoardsBtn.textContent = "Fetching...";
        
        try {
            const res = await fetch(`https://api.trello.com/1/members/me/boards?fields=name,url&key=${key}&token=${token}`);
            if(!res.ok) throw new Error("Invalid credentials");
            const fetchedBoards = await res.json();
            
            trelloBoardSelect.innerHTML = '<option value="">-- Choose a Board to Link --</option>';
            fetchedBoards.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                const curBoard = boards.find(b2 => b2.id === activeBoardId);
                if(curBoard && curBoard.trelloBoardId === b.id) opt.selected = true;
                trelloBoardSelect.appendChild(opt);
            });
            
            trelloBoardSelectGroup.style.display = 'block';
        } catch (err) {
            showToast("Failed to connect to Trello API");
        } finally {
            fetchTrelloBoardsBtn.textContent = btnText;
        }
    };
}

window.handleToggleReorder = function(e, listId, edge, targetType) {
    const transferTypeObj = Array.from(e.dataTransfer.types).find(t => t.startsWith('application/x-transfer-'));
    if (!transferTypeObj) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    let sourceTrackerRaw = transferTypeObj.replace('application/x-transfer-', '');
    const map = { 'ch': 'clientHappiness', 'ms': 'moneySmelling', 'nc': 'newClients', 'pd': 'pipedrive', 'trello': 'trello', 'ads': 'ads' };
    const sourceTracker = map[sourceTrackerRaw];
    
    if (!sourceTracker || sourceTracker === targetType) return;
    
    const activeBoard = boards && typeof activeBoardId !== 'undefined' ? boards.find(b => b.id === activeBoardId) : null;
    if (!activeBoard) return;
    
    const list = activeBoard.lists.find(l => l.id === listId);
    if (!list) return;
    
    list.edgeOrder = list.edgeOrder || {};
    let curOrder = list.edgeOrder[edge] || ['clientHappiness', 'moneySmelling', 'newClients', 'pipedrive', 'trello', 'ads'];
    
    const oldIdx = curOrder.indexOf(sourceTracker);
    const newIdx = curOrder.indexOf(targetType);
    
    if (oldIdx !== -1) curOrder.splice(oldIdx, 1);
    if (newIdx !== -1) {
        curOrder.splice(newIdx, 0, sourceTracker);
    } else {
        curOrder.push(sourceTracker);
    }
    
    list.edgeOrder[edge] = curOrder;
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
};

window.openTrelloCardDetailsModal = async function(cardId, listId) {
    const activeBoard = boards.find(b => b.id === activeBoardId);
    if (!activeBoard) return;
    
    const titleInput = document.getElementById('trelloCardTitleInput');
    const descInput = document.getElementById('trelloCardDescInput');
    const saveBtn = document.getElementById('trelloCardSaveBtn');
    const statusMsg = document.getElementById('trelloCardSaveStatus');
    const historySection = document.getElementById('trelloHistorySection');
    const historyArea = document.getElementById('trelloHistoryDisplayArea');
    
    const adsMetricsSection = document.getElementById('adsMetricsSection');
    const adsMetricSpend = document.getElementById('adsMetricSpend');
    const adsMetricRoas = document.getElementById('adsMetricRoas');
    const adsMetricCpa = document.getElementById('adsMetricCpa');
    const adsMetricConversions = document.getElementById('adsMetricConversions');
    const adsMetricStatus = document.getElementById('adsMetricStatus');
    const adsMetricPlatform = document.getElementById('adsMetricPlatform');
    
    titleInput.value = '';
    titleInput.placeholder = 'Loading title...';
    titleInput.disabled = true;
    
    descInput.value = '';
    descInput.placeholder = 'Loading description...';
    descInput.disabled = true;
    
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    statusMsg.style.opacity = '0';
    
    const targetLocalCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
    const targetLocalList = activeBoard.lists.find(l => l.id === listId);
    const isAdsTracker = targetLocalList && targetLocalList.trackerType === 'ads';
    
    if (adsMetricsSection) {
        if (isAdsTracker) {
            adsMetricsSection.style.display = 'block';
            const m = targetLocalCard && targetLocalCard.adsMetrics ? targetLocalCard.adsMetrics : {};
            if (adsMetricSpend) adsMetricSpend.value = m.spend !== undefined ? m.spend : '';
            if (adsMetricRoas) adsMetricRoas.value = m.roas !== undefined ? m.roas : '';
            if (adsMetricCpa) adsMetricCpa.value = m.cpa !== undefined ? m.cpa : '';
            if (adsMetricConversions) adsMetricConversions.value = m.conversions !== undefined ? m.conversions : '';
            if (adsMetricStatus) adsMetricStatus.value = m.status || '';
            if (adsMetricPlatform) adsMetricPlatform.value = m.platform || '';
            
            const saveAdsMetrics = () => {
                const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
                if (liveCard) {
                    liveCard.adsMetrics = {
                        spend: adsMetricSpend && adsMetricSpend.value !== '' ? parseFloat(adsMetricSpend.value) : undefined,
                        roas: adsMetricRoas && adsMetricRoas.value !== '' ? parseFloat(adsMetricRoas.value) : undefined,
                        cpa: adsMetricCpa && adsMetricCpa.value !== '' ? parseFloat(adsMetricCpa.value) : undefined,
                        conversions: adsMetricConversions && adsMetricConversions.value !== '' ? parseInt(adsMetricConversions.value, 10) : undefined,
                        status: adsMetricStatus ? adsMetricStatus.value : '',
                        platform: adsMetricPlatform ? adsMetricPlatform.value : ''
                    };
                    saveState();
                    if (typeof render === 'function') render();
                }
            };

            if (adsMetricSpend) adsMetricSpend.oninput = saveAdsMetrics;
            if (adsMetricRoas) adsMetricRoas.oninput = saveAdsMetrics;
            if (adsMetricCpa) adsMetricCpa.oninput = saveAdsMetrics;
            if (adsMetricConversions) adsMetricConversions.oninput = saveAdsMetrics;
            if (adsMetricStatus) adsMetricStatus.onchange = saveAdsMetrics;
            if (adsMetricPlatform) adsMetricPlatform.onchange = saveAdsMetrics;

        } else {
            adsMetricsSection.style.display = 'none';
        }
    }
    
    const deleteBtn = document.getElementById('trelloCardDeleteBtn');
    if (deleteBtn) {
        deleteBtn.textContent = 'Delete Task from Trello';
        deleteBtn.disabled = false;
    }
    
    const btnRed = document.getElementById('trelloActionColorRedBtn');
    const btnGreen = document.getElementById('trelloActionColorGreenBtn');
    const btnYellow = document.getElementById('trelloActionColorYellowBtn');
    const btnOrange = document.getElementById('trelloActionColorOrangeBtn');
    const btnClear = document.getElementById('trelloActionColorClearBtn');
    
    if (btnRed) {
        if(btnRed) btnRed.onclick = () => { 
            const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
            if(liveCard) { liveCard.color = 'red'; saveState(); render(); showToast("Card marked as Hot"); }
        };
    }
    if (btnGreen) {
        if(btnGreen) btnGreen.onclick = () => { 
            const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
            if(liveCard) { liveCard.color = 'green'; saveState(); render(); showToast("Card marked as Ready"); }
        };
    }
    if (btnYellow) {
        if(btnYellow) btnYellow.onclick = () => { 
            const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
            if(liveCard) { liveCard.color = 'yellow'; saveState(); render(); showToast("Card marked as Neutral"); }
        };
    }
    if (btnOrange) {
        if(btnOrange) btnOrange.onclick = () => { 
            const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
            if(liveCard) { liveCard.color = 'orange'; saveState(); render(); showToast("Card marked as Sad"); }
        };
    }
    if (btnClear) {
        if(btnClear) btnClear.onclick = () => { 
            const liveCard = activeBoard.lists.flatMap(l => l.cards).find(c => c.id === cardId);
            if(liveCard) { delete liveCard.color; saveState(); render(); showToast("Card color cleared"); }
        };
    }
    
    const record = activeBoard.telemetry ? activeBoard.telemetry[cardId] : null;
    
    if (record) {
        historySection.style.display = 'block';
        const currentList = activeBoard.lists.find(l => l.id === listId);
        
        let combinedHistory = record.history ? [...record.history] : [];
        let currentListName = "Unknown List";
        if (currentList) {
            currentListName = currentList.title;
        } else {
            const foundMapped = activeBoard.lists.find(l => l.trelloListId === record.listId);
            if (foundMapped) currentListName = foundMapped.title;
        }
        
        const currentDurationMs = Date.now() - record.startTime;
        combinedHistory.push({
            listId: record.listId,
            listName: currentListName,
            durationMs: currentDurationMs,
            isActive: true
        });
        
        combinedHistory.forEach(h => {
            if (h.listId) {
                const mappedList = activeBoard.lists.find(l => l.trelloListId === h.listId);
                if (mappedList) {
                    h.listName = mappedList.title;
                }
            }
        });
        
        const aggregates = {};
        combinedHistory.forEach(h => {
            if (!aggregates[h.listName]) aggregates[h.listName] = 0;
            aggregates[h.listName] += h.durationMs;
        });
        
        let html = `<div style="font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--secondary-text); margin-bottom: 12px; border-bottom: 2px solid #f4f5f7; padding-bottom: 8px;">Aggregate Total Time</div>`;
        html += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">`;
        
        const sortedAggregates = Object.keys(aggregates).map(listName => {
            return { listName, totalMs: aggregates[listName] };
        }).sort((a, b) => b.totalMs - a.totalMs);

        sortedAggregates.forEach((item, index) => {
            const listName = item.listName;
            const totalMs = item.totalMs;

            const totalSecs = Math.floor(totalMs / 1000);
            const m = Math.floor(totalSecs / 60);
            const h = Math.floor(m / 60);
            const d = Math.floor(h / 24);
            
            let timeStr = '';
            if (d > 0) timeStr += `${d}d `;
            if (h > 0 || d > 0) timeStr += `${h % 24}h `;
            timeStr += `${m % 60}m`;
            if (d === 0 && h === 0 && m === 0) timeStr = '< 1m';
            
            const cardHtml = `
                <div style="background: white; border: 1px solid #dfe1e6; border-radius: 8px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 12px; color: var(--secondary-text); font-weight: 500;">${listName}</div>
                    <div style="font-size: 16px; font-weight: 700; color: #0c66e4;">${timeStr}</div>
                </div>
            `;

            if (index < 3) {
                html += cardHtml;
            } else if (index === 3) {
                html += `<div id="extra-aggregates" style="display: none; flex-direction: column; gap: 8px;">`;
                html += cardHtml;
            } else {
                html += cardHtml;
            }
        });

        if (sortedAggregates.length > 3) {
            html += `</div>`;
            html += `<button onclick="document.getElementById('extra-aggregates').style.display='flex'; this.style.display='none';" style="margin-top: 4px; padding: 8px; border: 1px solid #dfe1e6; border-radius: 6px; background: #fafbfc; cursor: pointer; font-weight: 600; font-size: 12px; color: #0c66e4; transition: background 0.2s; width: 100%;" onmouseover="this.style.background='#f4f5f7'" onmouseout="this.style.background='#fafbfc'">Show more</button>`;
        }
        
        html += `</div>`;
        
        html += `<div style="font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--secondary-text); margin-bottom: 16px; border-bottom: 2px solid #f4f5f7; padding-bottom: 8px;">Chronological Timeline Path</div>`;
        html += `<div style="position: relative; padding-left: 14px; margin-top: 20px;">`;
        html += `<div style="position: absolute; left: 19px; top: 10px; bottom: 20px; width: 2px; background: #dfe1e6;"></div>`;
        
        combinedHistory.slice().reverse().forEach((h, idx) => {
            const isLast = idx === combinedHistory.length - 1;
            const totalSecs = Math.floor(h.durationMs / 1000);
            const m = Math.floor(totalSecs / 60);
            const hr = Math.floor(m / 60);
            const d = Math.floor(hr / 24);
            
            let timeStr = '';
            if (d > 0) timeStr += `${d}d `;
            if (hr > 0 || d > 0) timeStr += `${hr % 24}h `;
            timeStr += `${m % 60}m`;
            if (d === 0 && hr === 0 && m === 0) timeStr = '< 1m';
            
            const dotColor = h.isActive ? '#0c66e4' : '#8590a2';
            const textColor = h.isActive ? 'var(--text-color)' : 'var(--secondary-text)';
            
            html += `
                <div style="position: relative; padding-left: 32px; margin-bottom: ${isLast ? '0' : '28px'};">
                    <div style="position: absolute; left: -1px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 0 4px white, 0 0 0 5px rgba(0,0,0,0.06);"></div>
                    <div style="font-size: 15px; font-weight: 600; color: ${textColor}; margin-bottom: 6px;">${h.listName}</div>
                    <div style="display: inline-flex; align-items: center; background: ${h.isActive ? 'rgba(12,102,228,0.08)' : '#f4f5f7'}; color: ${h.isActive ? '#0c66e4' : '#44546f'}; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${timeStr} ${h.isActive ? '<span style="margin-left:6px;">• Active Now</span>' : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        historyArea.innerHTML = html;
        
    } else {
        historySection.style.display = 'none';
        historyArea.innerHTML = '';
    }
    
    trelloCardDetailsModal.classList.add('active');
    
    try {
        const res = await fetch(`https://api.trello.com/1/cards/${cardId}?fields=name,desc&key=${trelloKey}&token=${trelloToken}`);
        if (!res.ok) throw new Error("Failed to fetch card details");
        const cardData = await res.json();
        
        titleInput.value = cardData.name;
        descInput.value = cardData.desc || '';
        
        titleInput.disabled = false;
        descInput.disabled = false;
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        
        const previewArea = document.getElementById('trelloCardDescPreviewArea');
        const renderImagePreviews = () => {
            if (!previewArea) return;
            const val = descInput.value || '';
            const regex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
            let match;
            const images = [];
            while ((match = regex.exec(val)) !== null) {
                images.push(match[1]);
            }
            
            if (images.length === 0) {
                previewArea.innerHTML = '';
                return;
            }
            
            const trKey = localStorage.getItem('trelloKey');
            const trToken = localStorage.getItem('trelloToken');
            
            let html = '<label style="font-size: 11px; font-weight: 700; color: var(--secondary-color); margin-bottom: 4px; display: block; text-transform: uppercase;">Image Previews</label>';
            html += '<div style="display:flex; flex-direction:column; gap:8px;">';
            images.forEach(url => {
                const authenticatedUrl = url.includes('?') ? `${url}&key=${trKey}&token=${trToken}` : `${url}?key=${trKey}&token=${trToken}`;
                html += `<img src="${authenticatedUrl}" style="width: 100%; border-radius: 6px; border: 1px solid #dfe1e6; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" />`;
            });
            html += '</div>';
            previewArea.innerHTML = html;
        };
        
        descInput.oninput = renderImagePreviews;
        renderImagePreviews();
        
        const handleImageUpload = async (file) => {
            if (!file || !file.type.startsWith('image/')) return;
            
            const cursor = descInput.selectionStart || descInput.value.length;
            const uploadingText = `\n![Uploading ${file.name}...]()\n`;
            const oldVal = descInput.value;
            descInput.value = oldVal.slice(0, cursor) + uploadingText + oldVal.slice(cursor);
            renderImagePreviews();
            
            try {
                const formData = new FormData();
                formData.append('key', trelloKey);
                formData.append('token', trelloToken);
                formData.append('file', file);
                formData.append('name', file.name);
                
                const uploadRes = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments`, {
                    method: 'POST',
                    body: formData
                });
                
                if (!uploadRes.ok) throw new Error('Upload failed');
                const data = await uploadRes.json();
                
                descInput.value = descInput.value.replace(uploadingText, `\n![${file.name}](${data.url})\n`);
                renderImagePreviews();
                showToast("Image attached to Trello!");
            } catch (e) {
                console.error("Trello Image Upload Error", e);
                showToast("Failed to upload image. File might be too large.");
                descInput.value = descInput.value.replace(uploadingText, '');
                renderImagePreviews();
            }
        };

        descInput.onpaste = (e) => {
            if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
                e.preventDefault();
                handleImageUpload(e.clipboardData.files[0]);
            }
        };
        
        descInput.ondragover = (e) => {
            e.preventDefault();
            descInput.style.backgroundColor = 'rgba(12,102,228,0.05)';
        };
        
        descInput.ondragleave = (e) => {
            e.preventDefault();
            descInput.style.backgroundColor = '';
        };
        
        descInput.ondrop = (e) => {
            e.preventDefault();
            descInput.style.backgroundColor = '';
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleImageUpload(e.dataTransfer.files[0]);
            }
        };
        
        if(saveBtn) saveBtn.onclick = async () => {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            statusMsg.style.opacity = '0';
            
            try {
                const putRes = await fetch(`https://api.trello.com/1/cards/${cardId}?key=${trelloKey}&token=${trelloToken}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: titleInput.value.trim(),
                        desc: descInput.value.trim()
                    })
                });
                
                if (!putRes.ok) throw new Error("Failed to update Trello");
                
                statusMsg.style.opacity = '1';
                
                const allLists = activeBoard.lists;
                allLists.forEach(l => {
                    const cMatch = l.cards.find(c => c.id === cardId);
                    if (cMatch) {
                        cMatch.title = titleInput.value.trim();
                    }
                });
                
                saveState();
                render();
                
                setTimeout(() => {
                    trelloCardDetailsModal.classList.remove('active');
                }, 1000);
            } catch (err) {
                showToast("Failed to save changes to Trello");
            } finally {
                saveBtn.textContent = 'Save to Trello';
                saveBtn.disabled = false;
            }
        };
        
        const deleteBtn = document.getElementById('trelloCardDeleteBtn');
        if (deleteBtn) {
            deleteBtn.style.display = targetLocalCard.isTrelloTask ? 'block' : 'none';
            if(deleteBtn) deleteBtn.onclick = async () => {
                if (!confirm("Are you sure you want to permanently delete this task from Trello?")) return;
                
                const originalText = deleteBtn.textContent;
                deleteBtn.textContent = 'Deleting...';
                deleteBtn.disabled = true;
                
                try {
                    const delRes = await fetch(`https://api.trello.com/1/cards/${cardId}?key=${trelloKey}&token=${trelloToken}`, {
                        method: 'DELETE'
                    });
                    
                    window.isMetricsFadingIn = true;
                    saveState();
                    
                    if (!delRes.ok) throw new Error("Failed to delete from Trello");
                    
                    activeBoard.lists.forEach(l => {
                        l.cards = l.cards.filter(c => c.id !== cardId);
                    });
                    
                    saveState();
                    render();
                    
                    trelloCardDetailsModal.classList.remove('active');
                } catch (err) {
                    showToast("Failed to delete task from Trello");
                    deleteBtn.textContent = originalText;
                    deleteBtn.disabled = false;
                }
            };
        }
        

    } catch (err) {
        showToast("Error loading Trello card details");
        trelloCardDetailsModal.classList.remove('active');
    }
};

if (saveTrelloSettingsBtn) {
    if(saveTrelloSettingsBtn) saveTrelloSettingsBtn.onclick = () => {
        const key = trelloApiKeyInput.value.trim();
        const token = trelloTokenInput.value.trim();
        localStorage.setItem('trelloKey', key);
        localStorage.setItem('trelloToken', token);
        
        trelloKey = key;
        trelloToken = token;
        
        const curBoard = boards.find(b => b.id === activeBoardId);
        if (curBoard) {
            const selectedBoardId = trelloBoardSelect.value;
            if (selectedBoardId) {
                curBoard.trelloBoardId = selectedBoardId;
                curBoard.trelloBoardName = trelloBoardSelect.options[trelloBoardSelect.selectedIndex].text;
                showToast(`Linked to Trello!`);
            } else {
                curBoard.trelloBoardId = null;
                showToast("Saved Credentials");
            }
            saveState();
            render(); 
        }
        
        trelloSettingsModal.classList.remove('active');
    };
}

// Pipedrive Globals
let pipedriveDomain = localStorage.getItem('pipedriveDomain') || '';
let pipedriveToken = localStorage.getItem('pipedriveToken') || '';

const pipedriveSettingsModal = document.getElementById('pipedriveSettingsModal');
const closePipedriveSettingsModal = document.getElementById('closePipedriveSettingsModal');

// ==============================================================
// Global Optimization: Prevent native pinch-zoom lag in apps
// On Mac trackpads, pinch-zoom triggers wheel events with ctrlKey.
// Natively zooming a heavy grid causes paint freezing.
// ==============================================================
if(document) document.addEventListener('wheel', (e) => {
    if ((e.ctrlKey || e.metaKey) && document.querySelector('.social-scheduler-view')) {
        e.preventDefault();
    }
}, { passive: false });

// Social Media Scheduler Modals
const createPostModal = document.getElementById('createPostModal');
window.currentEditingSocialPostId = null;

window.smEscapeHTML = function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};


window.showCustomConfirm = function(title, message, confirmText, cancelText, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.WebkitBackdropFilter = 'blur(4px)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease-out';
    overlay.style.direction = 'rtl';

    const modal = document.createElement('div');
    modal.style.background = '#ffffff';
    modal.style.borderRadius = '20px';
    modal.style.padding = '24px';
    modal.style.width = '90%';
    modal.style.maxWidth = '340px';
    modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
    modal.style.transform = 'scale(0.95) translateY(10px)';
    modal.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    modal.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: #fee2e2; color: #ef4444; margin: 0 auto 16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
        </div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #0f172a; text-align: center;">${title}</h3>
        <p style="margin: 0 0 24px; font-size: 14px; color: #64748b; text-align: center; line-height: 1.6; font-weight: 500;">${message}</p>
        <div style="display: flex; gap: 12px;">
            <button id="sm-confirm-btn" style="flex: 1; padding: 10px; border: none; border-radius: 10px; background: #ef4444; color: white; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">${confirmText}</button>
            <button id="sm-cancel-btn" style="flex: 1; padding: 10px; border: 2px solid #e2e8f0; border-radius: 10px; background: transparent; color: #475569; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1';" onmouseout="this.style.background='transparent'; this.style.borderColor='#e2e8f0';">${cancelText}</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1) translateY(0)';
    });

    const close = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.95) translateY(10px)';
        setTimeout(() => overlay.remove(), 300);
    };

    modal.querySelector('#sm-confirm-btn').onclick = () => {
        close();
        if (onConfirm) onConfirm();
    };

    modal.querySelector('#sm-cancel-btn').onclick = close;
    if(overlay) overlay.onclick = (e) => {
        if (e.target === overlay) close();
    };
};

window.getHiddenSocialEvents = function() {
    const boardKey = `hiddenSocialEvents_${activeBoardId || 'default'}`;
    const stored = localStorage.getItem(boardKey);
    if (!stored) {
        // By default, ALL events are hidden
        return window.specialAwarenessDays.map(e => `${e.m}-${e.d}`);
    }
    return JSON.parse(stored);
};

window.hideSpecialEvent = function(e, eventId) {
    e.stopPropagation();
    const eventEl = e.currentTarget.closest('[data-special-event="true"]');
    
    const boardKey = `hiddenSocialEvents_${activeBoardId || 'default'}`;
    let hidden = window.getHiddenSocialEvents();
    if (!hidden.includes(eventId)) {
        hidden.push(eventId);
        localStorage.setItem(boardKey, JSON.stringify(hidden));
    }
    if (eventEl) {
        eventEl.style.transition = 'all 0.3s ease';
        eventEl.style.opacity = '0';
        eventEl.style.transform = 'scale(0.8)';
        setTimeout(() => eventEl.remove(), 300);
    }
};

window.eventCategoryMap = {
    'عالمي': { bg: '#fff7ed', text: '#d97706', dot: '#f59e0b' },
    'اجتماعي': { bg: '#eff6ff', text: '#2563eb', dot: '#3b82f6' },
    'ثقافي': { bg: '#fdf2f8', text: '#db2777', dot: '#ec4899' },
    'صحي': { bg: '#ecfdf5', text: '#059669', dot: '#10b981' },
    'رياضي': { bg: '#fef2f2', text: '#dc2626', dot: '#ef4444' },
    'بيئي': { bg: '#eef2ff', text: '#4f46e5', dot: '#6366f1' },
    'تجاري': { bg: '#fdf4ff', text: '#c026d3', dot: '#d946ef' },
    'تقني': { bg: '#f3e8ff', text: '#9333ea', dot: '#a855f7' },
    'ديني': { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' }
};

window.specialAwarenessDays = [
    // January (m: 0)
    { m: 0, d: 1, name: "رأس السنة الميلادية", desc: "بداية العام الميلادي الجديد", category: "عالمي" },
    { m: 0, d: 4, name: "اليوم العالمي للغة برايل", desc: "للتوعية بأهمية لغة برايل للمكفوفين", category: "ثقافي" },
    { m: 0, d: 24, name: "اليوم الدولي للتعليم", desc: "الاحتفاء بدور التعليم في تحقيق السلام والتنمية", category: "ثقافي" },
    { m: 0, d: 26, name: "اليوم العالمي للجمارك", desc: "للإشادة بجهود رجال الجمارك حول العالم", category: "عالمي" },
    { m: 0, d: 28, name: "يوم الحد من انبعاثات الكربون", desc: "للتوعية بضرورة حماية البيئة وتقليل التلوث", category: "بيئي" },

    // February (m: 1)
    { m: 1, d: 4, name: "اليوم العالمي للسرطان", desc: "لرفع الوعي العالمي وتوحيد الجهود لمكافحة السرطان", category: "صحي" },
    { m: 1, d: 11, name: "المرأة في ميدان العلوم", desc: "المرأة والفتاة في ميدان العلوم والأبحاث", category: "ثقافي" },
    { m: 1, d: 13, name: "اليوم العالمي للإذاعة", desc: "للاحتفاء بدور الإذاعة المسموعة وإيصال المعلومات", category: "ثقافي" },
    { m: 1, d: 14, name: "عيد الحب", desc: "يوم للتعبير عن الحب والتقدير", category: "اجتماعي" },
    { m: 1, d: 20, name: "يوم العدالة الاجتماعية", desc: "لتعزيز مبادئ العدالة والمساواة في المجتمعات", category: "اجتماعي" },
    { m: 1, d: 21, name: "اليوم الدولي للغة الأم", desc: "للاحتفال بالتنوع اللغوي والثقافي", category: "ثقافي" },

    // March (m: 2)
    { m: 2, d: 1, name: "الدفاع المدني / صفر تمييز", desc: "يوم الدفاع المدني وتصفير التمييز بكافة أشكاله", category: "عالمي" },
    { m: 2, d: 3, name: "يوم الحياة البرية", desc: "للاحتفاء بتنوع النباتات والحيوانات البرية وحمايتها", category: "بيئي" },
    { m: 2, d: 8, name: "يوم المرأة العالمي", desc: "للاحتفال بإنجازات المرأة وحقوقها", category: "اجتماعي" },
    { m: 2, d: 15, name: "حقوق المستهلك", desc: "للتوعية بحقوق المستهلكين وحمايتها", category: "تجاري" },
    { m: 2, d: 20, name: "يوم السعادة العالمي", desc: "للاعتراف بأهمية السعادة والرفاهية", category: "اجتماعي" },
    { m: 2, d: 21, name: "عيد الأم / يوم الشعر", desc: "تكريم للأمهات والاحتفاء بالشعر والشعراء", category: "اجتماعي" },
    { m: 2, d: 22, name: "يوم المياه العالمي", desc: "للفت الانتباه لأهمية المياه العذبة", category: "بيئي" },
    { m: 2, d: 27, name: "يوم المسرح العالمي", desc: "لإبراز أهمية الفنون المسرحية", category: "ثقافي" },

    // April (m: 3)
    { m: 3, d: 1, name: "كذبة أبريل / يوم المرح", desc: "يوم للمقالب والخدع والمرح في العمل", category: "عالمي" },
    { m: 3, d: 2, name: "يوم التوحد / كتاب الطفل", desc: "للتوعية بالتوحد والتشجيع على قراءة كتب الأطفال", category: "صحي" },
    { m: 3, d: 4, name: "يوم المخطوطات العربية", desc: "للاحتفاء بالتراث المخطوط وحفظه", category: "ثقافي" },
    { m: 3, d: 5, name: "اليوم العالمي للضمير", desc: "لترسيخ ثقافة السلام والوعي", category: "عالمي" },
    { m: 3, d: 6, name: "الرياضة للتنمية والسلام", desc: "استخدام الرياضة لتوحيد الشعوب", category: "رياضي" },
    { m: 3, d: 7, name: "يوم الصحة العالمي", desc: "يسلط الضوء على القضايا الصحية العالمية الكبرى", category: "صحي" },
    { m: 3, d: 15, name: "يوم الفن العالمي", desc: "للترويج لتطور الوعي الفني", category: "ثقافي" },
    { m: 3, d: 18, name: "يوم التراث العالمي", desc: "للحفاظ على التراث الإنساني ومواقع التراث", category: "ثقافي" },
    { m: 3, d: 20, name: "اليوم العالمي للغة الصينية", desc: "للاحتفاء باللغة الصينية وتاريخها", category: "ثقافي" },
    { m: 3, d: 21, name: "يوم الإبداع والابتكار", desc: "لتشجيع التفكير الابتكاري وحل المشكلات", category: "عالمي" },
    { m: 3, d: 22, name: "يوم الأرض", desc: "لزيادة الوعي بالقضايا البيئية والكوكبية", category: "بيئي" },
    { m: 3, d: 23, name: "اليوم العالمي للكتاب", desc: "للتشجيع على القراءة وحماية حقوق المؤلفين", category: "ثقافي" },
    { m: 3, d: 23, name: "يوم اللغة الإنجليزية والإسبانية", desc: "اليوم العالمي للغة الإنجليزية والإسبانية", category: "ثقافي" },
    { m: 3, d: 25, name: "اليوم العالمي للملاريا", desc: "للتعريف بجهود مكافحة الملاريا", category: "صحي" },
    { m: 3, d: 26, name: "يوم الملكية الفكرية", desc: "للتوعية بأهمية حماية حقوق الإبداع والابتكار", category: "تجاري" },
    { m: 3, d: 28, name: "السلامة والصحة في العمل", desc: "لزيادة الوعي بالسلامة المهنية", category: "صحي" },
    { m: 3, d: 29, name: "يوم الرقص العالمي", desc: "للاحتفال بفن الرقص", category: "ثقافي" },
    { m: 3, d: 30, name: "يوم موسيقى الجاز", desc: "تسليط الضوء على هذه الموسيقى وتاريخها", category: "ثقافي" },

    // May (m: 4)
    { m: 4, d: 1, name: "يوم العمال العالمي / شهر التوعية بالسيلياك", desc: "احتفال عالمي بالعمال وشهر التوعية بالسيلياك", category: "اجتماعي" },
    { m: 4, d: 3, name: "يوم حرية الصحافة", desc: "لتقييم حالة حرية الصحافة حول العالم", category: "ثقافي" },
    { m: 4, d: 4, name: "يوم الضحك العالمي", desc: "يوم الضحك العالمي", category: "عالمي" },
    { m: 4, d: 5, name: "اليوم العالمي للربو", desc: "اليوم العالمي للربو", category: "صحي" },
    { m: 4, d: 8, name: "يوم الصليب والهلال الأحمر", desc: "لتقدير جهود العاملين في الإغاثة", category: "صحي" },
    { m: 4, d: 12, name: "اليوم العالمي للتمريض", desc: "تقدير وتكريم الكوادر التمريضية", category: "صحي" },
    { m: 4, d: 15, name: "اليوم العالمي للأسر", desc: "اليوم العالمي للأسر", category: "اجتماعي" },
    { m: 4, d: 16, name: "يوم الضوء العالمي", desc: "يوم الضوء العالمي", category: "تقني" },
    { m: 4, d: 17, name: "يوم الاتصالات / اليوم العالمي لارتفاع ضغط الدم", desc: "يوم الاتصالات / اليوم العالمي لارتفاع ضغط الدم", category: "تقني" },
    { m: 4, d: 18, name: "اليوم العالمي للمتاحف", desc: "اليوم العالمي للمتاحف", category: "ثقافي" },
    { m: 4, d: 20, name: "اليوم العالمي للنحل", desc: "للتوعية بأهمية الملقحات", category: "بيئي" },
    { m: 4, d: 21, name: "التنوع الثقافي", desc: "لحوار الحضارات وتقبل الآخر", category: "ثقافي" },
    { m: 4, d: 31, name: "الامتناع عن التدخين", desc: "يوم التوعية بأضرار التبغ", category: "صحي" },

    // June (m: 5)
    { m: 5, d: 1, name: "اليوم العالمي للحليب / اليوم العالمي للوالدين", desc: "لتكريم الآباء والحث على التغذية السليمة", category: "اجتماعي" },
    { m: 5, d: 3, name: "اليوم العالمي للدراجات الهوائية", desc: "للتشجيع على استخدام وسائل نقل صحية", category: "رياضي" },
    { m: 5, d: 5, name: "اليوم العالمي للبيئة", desc: "للتوعية وحماية بيئتنا", category: "بيئي" },
    { m: 5, d: 7, name: "اليوم العالمي لسلامة الأغذية", desc: "لتسليط الضوء على سلامة الغذاء والصحة", category: "صحي" },
    { m: 5, d: 8, name: "اليوم العالمي للمحيطات", desc: "لحماية المسطحات المائية والمحيطات", category: "بيئي" },
    { m: 5, d: 12, name: "اليوم العالمي لمكافحة عمل الأطفال", desc: "لتسليط الضوء على حقوق ومصلحة الأطفال", category: "اجتماعي" },
    { m: 5, d: 14, name: "اليوم العالمي للمتبرعين بالدم", desc: "لشكر المتبرعين بالدم والتوعية بأهمية التبرع", category: "صحي" },
    { m: 5, d: 15, name: "التوعية بشأن إساءة معاملة كبار السن", desc: "لتعزيز بيئة آمنة وراعية لكبار السن", category: "اجتماعي" },
    { m: 5, d: 16, name: "بداية السنة الهجرية 1448هـ", desc: "بداية السنة الهجرية 1448هـ", category: "ديني" },
    { m: 5, d: 17, name: "يوم مكافحة التصحر والجفاف", desc: "للعمل على حماية الأراضي من الجفاف", category: "بيئي" },
    { m: 5, d: 18, name: "يوم فن الطبخ المستدام", desc: "دعم الطبخ المحلي والعادات الغذائية السليمة", category: "ثقافي" },
    { m: 5, d: 18, name: "اليوم العالمي للسوشي", desc: "اليوم العالمي للسوشي والتسويق للمطاعم", category: "تجاري" },
    { m: 5, d: 20, name: "يوم اللاجئ العالمي", desc: "لدعم حقوق اللاجئين وتفهم معاناتهم", category: "اجتماعي" },
    { m: 5, d: 21, name: "يوم الأب / اليوم العالمي للموسيقى / ذكرى مبايعة ولي العهد (ميلادي)", desc: "ذكرى مبايعة ولي العهد ويوم الأب العالمي", category: "اجتماعي" },
    { m: 5, d: 23, name: "يوم الخدمة العامة", desc: "للإشادة بالموظفين ودورهم في الخدمة العامة", category: "عالمي" },
    { m: 5, d: 23, name: "اليوم الأولمبي للجري", desc: "التشجيع على الممارسة والنشاط الرياضي", category: "رياضي" },
    { m: 5, d: 25, name: "يوم البحارة", desc: "لتسليط الضوء على إسهامات البحارة", category: "عالمي" },
    { m: 5, d: 26, name: "يوم مكافحة إساءة استعمال المخدرات", desc: "لمكافحة المخدرات وحماية الشباب", category: "صحي" },
    { m: 5, d: 27, name: "يوم المؤسسات المتناهية الصغر والصغيرة", desc: "لدعم المشاريع التجارية والمؤسسات المتوسطة", category: "تجاري" },
    { m: 5, d: 30, name: "العمل البرلماني", desc: "للاحتفال بالبرلمانات ودورها", category: "عالمي" },

    // July (m: 6)
    { m: 6, d: 11, name: "يوم السكان العالمي", desc: "للاهتمام بقضايا النمو السكاني", category: "عالمي" },
    { m: 6, d: 15, name: "مهارات الشباب", desc: "لتمكين الشباب للعمل", category: "اجتماعي" },
    { m: 6, d: 17, name: "يوم الإيموجي", desc: "للاحتفال بالرموز التعبيرية الرقمية الممتعة", category: "تجاري" },
    { m: 6, d: 18, name: "يوم نيلسون مانديلا", desc: "استذكار لجهود ومبادئ مانديلا", category: "عالمي" },
    { m: 6, d: 20, name: "يوم الشطرنج", desc: "للاحتفاء برياضة الشطرنج الذهنية", category: "ثقافي" },
    { m: 6, d: 28, name: "يوم التهاب الكبد", desc: "للتوعية بهذا المرض والوقاية منه", category: "صحي" },
    { m: 6, d: 30, name: "يوم الصداقة العالمي", desc: "للاحتفال بالصداقة كمبادرة للسلام", category: "اجتماعي" },

    // August (m: 7)
    { m: 7, d: 9, name: "يوم الشعوب الأصلية", desc: "للاحتفاء بثقافات الشعوب المتبقية", category: "ثقافي" },
    { m: 7, d: 12, name: "يوم الشباب الدولي", desc: "للتوعية بقضايا الشباب وتمكينهم", category: "اجتماعي" },
    { m: 7, d: 19, name: "العمل الإنساني / التصوير", desc: "لتقدير العاملين في المجال الإنساني وعالم التصوير", category: "عالمي" },
    { m: 7, d: 29, name: "مكافحة التجارب النووية", desc: "لحظر ووقف التجارب النووية", category: "عالمي" },

    // September (m: 8)
    { m: 8, d: 5, name: "العمل الخيري", desc: "لتشجيع العمل التطوعي والخيري", category: "اجتماعي" },
    { m: 8, d: 8, name: "يوم محو الأمية", desc: "للحد من الأمية حول العالم", category: "ثقافي" },
    { m: 8, d: 15, name: "يوم الديمقراطية", desc: "للاحتفاء بمبادئ الديمقراطية والتعبير", category: "عالمي" },
    { m: 8, d: 16, name: "حفظ طبقة الأوزون", desc: "للتوعية بأهمية الغلاف الجوي", category: "بيئي" },
    { m: 8, d: 21, name: "يوم السلام", desc: "للترويج لإنهاء الصراعات", category: "عالمي" },
    { m: 8, d: 23, name: "اليوم الوطني السعودي", desc: "احتفال المملكة العربية السعودية بتوحيدها", category: "عالمي", dot: '#006c35', bg: '#e0f2e9', text: '#006c35' },
    { m: 8, d: 27, name: "يوم السياحة العالمي", desc: "لتسليط الضوء على أهمية القطاع السياحي", category: "عالمي" },
    { m: 8, d: 29, name: "يوم القلب العالمي", desc: "للتوعية بأمراض القلب وأهمية صحته", category: "صحي" },
    { m: 8, d: 30, name: "يوم الترجمة العالمي", desc: "للاحتفاء بالترجمة وحوار الحضارات", category: "ثقافي" },

    // October (m: 9)
    { m: 9, d: 1, name: "القهوة / المسنين", desc: "للاحتفاء بعشاق القهوة وتقدير كبار السن", category: "تجاري" },
    { m: 9, d: 2, name: "يوم اللاعنف", desc: "لترسيخ ثقافة السلام بعيداً عن التعنيف", category: "عالمي" },
    { m: 9, d: 5, name: "يوم المعلم العالمي", desc: "لتكريم وتقدير المعلمين ودورهم", category: "ثقافي" },
    { m: 9, d: 9, name: "يوم البريد العالمي", desc: "توعية حول أثر خدمات البريد", category: "عالمي" },
    { m: 9, d: 10, name: "الصحة النفسية", desc: "للتوعية بأهمية الصحة العقلية", category: "صحي" },
    { m: 9, d: 11, name: "يوم الفتاة العالمي", desc: "للاعتراف بحقوق الفتيات والتحديات التي تواجههن", category: "اجتماعي" },
    { m: 9, d: 16, name: "يوم الأغذية العالمي", desc: "للحد من الجوع والأمن الغذائي", category: "صحي" },
    { m: 9, d: 17, name: "القضاء على الفقر", desc: "لدعم ومساندة من يعانون الفقرات", category: "اجتماعي" },
    { m: 9, d: 24, name: "يوم الأمم المتحدة", desc: "الاحتفال بذكرى تأسيس منظمة الأمم المتحدة", category: "عالمي" },
    { m: 9, d: 31, name: "اليوم العالمي للمدن", desc: "لتشجيع التوسع الحضري المستدام", category: "عالمي" },

    // November (m: 10)
    { m: 10, d: 1, name: "يوم النباتيين العالمي", desc: "لتشجيع النظم الغذائية النباتية", category: "صحي" },
    { m: 10, d: 10, name: "العلوم من أجل السلام", desc: "ربط العلم والتنمية بمساعي السلام", category: "عالمي" },
    { m: 10, d: 14, name: "يوم السكري العالمي", desc: "للتوعية بمرض السكري وطرق تجنبه", category: "صحي" },
    { m: 10, d: 16, name: "يوم التسامح", desc: "لترسيخ مفهوم التسامح بين الشعوب", category: "اجتماعي" },
    { m: 10, d: 19, name: "اليوم الدولي للرجل", desc: "للاعتراف بإسهامات الرجل وخاصة الصحية", category: "اجتماعي" },
    { m: 10, d: 20, name: "يوم الطفل العالمي", desc: "لتعزيز الترابط الدولي والتوعية بحقوق الأطفال", category: "اجتماعي" },
    { m: 10, d: 21, name: "يوم التلفزيون", desc: "لتقدير الأثر والتأثير المتلفز", category: "ثقافي" },

    // December (m: 11)
    { m: 11, d: 1, name: "اليوم العالمي للإيدز", desc: "للتوعية بمرض نقص المناعة", category: "صحي" },
    { m: 11, d: 2, name: "إلغاء الرق", desc: "للتأكيد على القضاء على الاستعباد", category: "اجتماعي" },
    { m: 11, d: 3, name: "ذوي الإعاقة", desc: "لدعم دمج الأشخاص ذوي الإعاقة", category: "اجتماعي" },
    { m: 11, d: 5, name: "يوم المتطوعين", desc: "للإشادة بالمتطوعين وأعمالهم", category: "اجتماعي" },
    { m: 11, d: 9, name: "مكافحة الفساد", desc: "للتوعية بمخاطر الفساد وتعزيز النزاهة", category: "عالمي" },
    { m: 11, d: 10, name: "حقوق الإنسان", desc: "الاحتفاء بالإعلان العالمي لحقوق الإنسان", category: "عالمي" },
    { m: 11, d: 11, name: "اليوم الدولي للجبال", desc: "للتوعية بأهمية التنمية الجبلية", category: "بيئي" },
    { m: 11, d: 18, name: "اللغة العربية / المهاجرين", desc: "للاحتفاء بلغة الضاد، وللتوعية بحقوق المهاجرين", category: "ثقافي" },
    { m: 11, d: 20, name: "التضامن الإنساني", desc: "للوقوف جنباً إلى جنب كبشر", category: "اجتماعي" }
];

window.restoreMonthEvents = function(monthIndex) {
    const boardKey = `hiddenSocialEvents_${activeBoardId || 'default'}`;
    let hidden = window.getHiddenSocialEvents();
    const originalLength = hidden.length;
    hidden = hidden.filter(id => !id.startsWith(`${monthIndex}-`));
    if (hidden.length !== originalLength) {
        localStorage.setItem(boardKey, JSON.stringify(hidden));
        // Force a re-render to show them
        if (typeof render === 'function') render();
    }
};

window.hideAllMonthEvents = function(monthIndex) {
    const boardKey = `hiddenSocialEvents_${activeBoardId || 'default'}`;
    let hidden = window.getHiddenSocialEvents();
    
    const monthEvents = window.specialAwarenessDays.filter(e => e.m === monthIndex);
    
    let changed = false;
    monthEvents.forEach(e => {
        const eventId = `${e.m}-${e.d}`;
        if (!hidden.includes(eventId)) {
            hidden.push(eventId);
            changed = true;
        }
    });
    
    if (changed) {
        localStorage.setItem(boardKey, JSON.stringify(hidden));
        if (typeof render === 'function') render();
    }
};

window.openCreatePostModal = function(postId = null) {
    if (window.isLiveModeActive && !postId) {
        if (typeof showToast === 'function') {
            showToast('⚠️ يتم إنشاء المنشورات في وضع المسودات فقط. استخدم وضع النشر (Live) للجدولة.');
        } else {
            alert('يتم إنشاء المنشورات في وضع المسودات فقط. استخدم وضع النشر (Live) للجدولة.');
        }
        return;
    }

    if (createPostModal) {
        window.currentEditingSocialPostId = postId;
        const textArea = document.querySelector('.sm-textarea');
        const publishToggles = createPostModal.querySelectorAll('.sm-toggle-btn');
        
        // Reset modal fields first
        if (textArea) {
            textArea.value = '';
            const cc = document.querySelector('.sm-char-count');
            if (cc) cc.innerText = '0 حرف';
        }
        
        // Always reset draft icon highlights explicitly so state doesn't leak between posts
        const draftIconsState = document.querySelectorAll('.sm-platform-empty > div > div');
        draftIconsState.forEach(icon => {
            icon.style.boxShadow = 'none';
            icon.removeAttribute('data-active');
        });
        const wrapperEl = document.getElementById('formatSelectorsWrapper');
        if (wrapperEl) wrapperEl.style.marginBottom = '0px';
        ['igFormatSelector', 'tiktokFormatSelector'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.maxHeight = '0';
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            }
        });
        
        const liveBadge = document.getElementById('createPostModalLiveBadge');
        if (liveBadge) {
            liveBadge.style.display = window.isLiveModeActive ? 'flex' : 'none';
        }
        
        const frameIoLabel = document.getElementById('frameIoLabel');
        const frameIoContainer = document.getElementById('frameIoContainer');
        if (window.isLiveModeActive) {
            if (frameIoLabel) frameIoLabel.style.display = 'none';
            if (frameIoContainer) frameIoContainer.style.display = 'none';
        } else {
            if (frameIoLabel) frameIoLabel.style.display = 'flex';
            if (frameIoContainer) frameIoContainer.style.display = 'flex';
        }

        const clientEditsContainer = document.getElementById('clientEditsContainer');
        const clientEditsInput = document.getElementById('clientEditsInput');
        const clientEditsLabel = document.getElementById('clientEditsLabel');
        if (clientEditsInput) clientEditsInput.value = '';
        
        const agencyEditsContainer = document.getElementById('agencyClientEditsContainer');
        const agencyEditsInput = document.getElementById('agencyClientEditsInput');
        const agencyEditsDiff = document.getElementById('agencyClientEditsDiff');
        
        let postForEdits = null;
        if (postId && typeof boards !== 'undefined' && typeof activeBoardId !== 'undefined') {
            const activeBoard = boards.find(b => b.id === activeBoardId);
            if (activeBoard && activeBoard.cards) {
                postForEdits = activeBoard.cards.find(c => c.id === postId);
            }
        }
        
        const isClientModified = postForEdits ? postForEdits.clientModified : false;
        const editsVal = postForEdits ? (postForEdits.clientEdits || '') : '';
        
        if (!window.isClientView) {
            // Agency View
            if (clientEditsContainer) clientEditsContainer.style.setProperty("display", "none", "important");
            if (clientEditsLabel) clientEditsLabel.style.setProperty("display", "none", "important");
            
            if (agencyEditsContainer && agencyEditsInput) {
                if (window.smShowClientEditsToggle !== false && isClientModified) {
                    agencyEditsContainer.style.display = 'block';
                    agencyEditsInput.style.display = 'block';
                    agencyEditsInput.value = editsVal;
                    
                    const btnResolve = document.getElementById('btnResolveClientEdits');
                    if (btnResolve) btnResolve.style.display = 'block';
                    
                    const leftTitle = document.getElementById('leftPaneEditsTitle');
                    if (leftTitle) leftTitle.textContent = "ملاحظات العميل";
                    
                    if (agencyEditsDiff) window.updateLiveDiff();
                } else {
                    agencyEditsContainer.style.display = 'none';
                }
            }
        } else {
            // Client View
            if (clientEditsContainer && clientEditsInput) {
                clientEditsContainer.style.setProperty("display", "flex", "important");
                clientEditsContainer.style.setProperty("flex-direction", "column", "important");
                clientEditsInput.value = editsVal;
                if (clientEditsLabel) clientEditsLabel.style.setProperty("display", "flex", "important");
            }
            
            // Hide Agency container entirely for Client
            if (agencyEditsContainer) {
                agencyEditsContainer.style.setProperty("display", "none", "important");
            }
        }
        
        const localBoard = boards.find(b => b.id === activeBoardId);
        const connected = localBoard ? (localBoard.connectedAccounts || {}) : {};
        
        const igLiveConfigBox = document.getElementById('igLiveConfigBox');
        if (igLiveConfigBox) igLiveConfigBox.style.display = 'none';
        
        const fbLiveConfigBox = document.getElementById('fbLiveConfigBox');
        if (fbLiveConfigBox) fbLiveConfigBox.style.display = 'none';
        
        const tiktokLiveConfigBox = document.getElementById('tiktokLiveConfigBox');
        if (tiktokLiveConfigBox) tiktokLiveConfigBox.style.display = 'none';

        const livePlatformsSection = document.getElementById('smLivePlatformsSection');
        const smPlatformsSection = document.getElementById('smPlatformsSection');
        const formatSelectorsWrapper = document.getElementById('formatSelectorsWrapper');
        
        if (livePlatformsSection) {
            if (window.isLiveModeActive) {
                livePlatformsSection.style.display = 'block';
                if (smPlatformsSection) {
                    smPlatformsSection.style.display = 'block';
                    smPlatformsSection.style.pointerEvents = 'none';
                    smPlatformsSection.style.opacity = '0.7';
                }
                if (formatSelectorsWrapper) formatSelectorsWrapper.style.display = 'none';
                const liveContainer = document.getElementById('smLivePlatformsContainer');
                if (liveContainer) {
                    const allPlatforms = [
                        { id: 'facebook', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg>', colorFill: '#1877f2', colorBg: '#e6f2ff' },
                        { id: 'instagram', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>', colorFill: '#e1306c', colorBg: '#fce4ec' },
                        { id: 'snapchat', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.882 7.842a4.882 4.882 0 1 0 -9.764 0c0 4.288 -.348 7.023 -2.618 7.023c-.314 0 -1.5 .5 -1.5 1.25c0 .64 .324 1.135 1.704 1.135c.421 0 1.956 -.093 3.654 .231c.365 .07 .666 .273 .97 .702c1.472 2.062 4.093 1.849 5.342 0c.304 -.429 .605 -.632 .97 -.702c1.7 -.324 3.233 -.231 3.654 -.231c1.38 0 1.704 -.494 1.704 -1.135c0 -.75 -1.186 -1.25 -1.5 -1.25c-2.27 0 -2.618 -2.735 -2.618 -7.023z"></path></svg>', colorFill: '#ca8a04', colorBg: '#fef9c3' },
                        { id: 'twitter', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>', colorFill: '#0f1419', colorBg: '#f1f5f9' },
                        { id: 'linkedin', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>', colorFill: '#0a66c2', colorBg: '#e4f0fd' },
                        { id: 'tiktok', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.12-3.44-3.17-3.8-5.46-.4-2.51.69-5.17 2.73-6.69 1.51-1.12 3.35-1.57 5.11-1.33v4.22c-1.14-.15-2.31.22-3.11 1.01-.89.87-1.1 2.27-.47 3.35.48.98 1.63 1.56 2.73 1.5 1.78-.15 2.91-1.74 2.87-3.53.01-4.14.01-8.29.01-12.43 0-.52-.01-1.04-.01-1.56Z"/></svg>', colorFill: '#000000', colorBg: '#f1f5f9' }
                    ];
                    
                    let html = '';
                    allPlatforms.forEach(p => {
                        const isConn = !!connected[p.id];
                        const fg = isConn ? p.colorFill : '#94a3b8';
                        const bg = isConn ? p.colorBg : '#f8fafc';
                        
                        const cursorStyle = isConn 
                            ? "cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" 
                            : "cursor: pointer; opacity: 0.6; transition: transform 0.2s, filter 0.2s; filter: grayscale(100%);";
                        
                        const hoverEffects = isConn 
                            ? `onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"` 
                            : `onmouseover="this.style.transform='scale(1.1)'; this.style.filter='grayscale(0%)'" onmouseout="this.style.transform='scale(1)'; this.style.filter='grayscale(100%)'" title="Connect ${p.id} via Zernio"`;
                            
                        const clickHandler = isConn 
                            ? `onclick="if(typeof window.toggleLivePlatform==='function') window.toggleLivePlatform(this, '${p.colorFill}', '${p.id}')"` 
                            : `onclick="if(typeof showToast==='function') { showToast('⚠️ حساب ${p.id} غير متصل بعد، يرجى ربطه أولاً.'); } else { alert('حساب ${p.id} غير متصل بعد، يرجى ربطه أولاً.'); }"`;
                        
                        html += `
                            <div class="sm-live-platform-icon" data-platform="${p.id}" style="flex-shrink:0; width:34px; height:34px; border-radius:50%; background:${bg}; display:flex; align-items:center; justify-content:center; color:${fg}; ${cursorStyle}" ${clickHandler} ${hoverEffects}>
                                ${p.icon}
                            </div>
                        `;
                    });
                    liveContainer.innerHTML = html;
                }
            } else {
                livePlatformsSection.style.display = 'none';
                if (smPlatformsSection) {
                    smPlatformsSection.style.display = 'block';
                    smPlatformsSection.style.pointerEvents = 'auto';
                    smPlatformsSection.style.opacity = '1';
                }
                if (formatSelectorsWrapper) formatSelectorsWrapper.style.display = 'grid';
            }
        }
        if (window.clearMediaUpload) window.clearMediaUpload(); // clears gallery
        
        if (typeof window.updatePublishTogglesVisibility === 'function') {
            window.updatePublishTogglesVisibility(true);
        }

        
        let targetOpt = window.activeSocialDateOptions;
        const activeBoard = boards.find(b => b.id === activeBoardId);
        
        const modalDateInput = document.querySelector('.sm-date-input');
        if (modalDateInput) {
            let syncOpt = targetOpt;
            if (postId && activeBoard && activeBoard.cards) {
                const existingPost = activeBoard.cards.find(c => c.id === postId);
                if (existingPost && existingPost.dateStr) {
                    const parts = existingPost.dateStr.split('-');
                    if (parts.length === 3) {
                        syncOpt = { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10), date: parseInt(parts[2], 10) };
                    }
                }
            }
            if (syncOpt) {
                const yyyy = syncOpt.year;
                const mm = String(syncOpt.month + 1).padStart(2, '0');
                const dd = String(syncOpt.date).padStart(2, '0');
                modalDateInput.value = `${yyyy}-${mm}-${dd}`;
            }
        }
        
        // Calculate and show post number indicator
        let postNum = 1;
        if (activeBoard && activeBoard.cards && targetOpt) {
            const targetDateStr = `${targetOpt.year}-${targetOpt.month}-${targetOpt.date}`;
            const dayPosts = activeBoard.cards.filter(c => c.dateStr === targetDateStr && (window.smShowClientEditsToggle !== false || !c.isClientDayNote));
            
            if (postId) {
                const idx = dayPosts.findIndex(c => c.id === postId);
                if (idx > -1) postNum = idx + 1;
            } else {
                postNum = dayPosts.length + 1;
            }
        }
        
        const indicator = document.getElementById('smActivePostIndicator');
        const numSpan = document.getElementById('smActivePostNum');
        if (indicator && numSpan) {
            numSpan.textContent = postNum;
            indicator.style.display = 'flex';
        }
        
        const arabicOrdinals = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
        const modalTitle = document.getElementById('createPostModalTitle');
        if (modalTitle) {
            if (postId) {
                const ordinalText = postNum <= 10 ? arabicOrdinals[postNum] : postNum;
                modalTitle.textContent = `المنشور ${ordinalText}`;
            } else {
                modalTitle.textContent = 'إنشاء منشور';
            }
        }
        
        if (!postId) {
            const vidInput = document.querySelector(`input[name="smPostType"][value="video"]`);
            if (vidInput) {
                vidInput.checked = true;
                const parent = vidInput.parentElement;
                parent.style.borderColor = '#f97316';
                parent.style.background = '#fffaf5';
                const span = parent.querySelector('span');
                if(span) span.style.color = '#c2410c';
                
                const sibling = parent.nextElementSibling || parent.previousElementSibling;
                if (sibling) {
                    sibling.style.borderColor = '#cbd5e1';
                    sibling.style.background = 'white';
                    const sibSpan = sibling.querySelector('span');
                    if(sibSpan) sibSpan.style.color = '#475569';
                }
            }
        }
        
        if (postId) {
            const activeBoard = boards.find(b => b.id === activeBoardId);
            if (activeBoard && activeBoard.cards) {
                const post = activeBoard.cards.find(c => c.id === postId);
                if (post) {
                    if (textArea) {
                        textArea.value = post.fullText || post.description || '';
                        const cc = document.querySelector('.sm-char-count');
                        if (cc) cc.innerText = textArea.value.length + ' حرف';
                    }
                    
                    // Restore Platforms
                    if (post.platforms && post.platforms.length > 0) {
                        setTimeout(() => {
                            post.platforms.forEach(plat => {
                                // For live mode
                                const liveIcon = document.querySelector(`.sm-live-platform-icon[data-platform="${plat}"]`);
                                if (liveIcon && typeof window.toggleLivePlatform === 'function') {
                                    let fillCol = '#000';
                                    if (plat === 'instagram') fillCol = '#e1306c';
                                    if (plat === 'facebook') fillCol = '#1877f2';
                                    if (plat === 'snapchat') fillCol = '#ca8a04';
                                    if (plat === 'twitter') fillCol = '#0f1419';
                                    if (plat === 'linkedin') fillCol = '#0a66c2';
                                    const isIconConnected = liveIcon.getAttribute('onclick') && liveIcon.getAttribute('onclick').includes('toggleLivePlatform');
                                    if (isIconConnected && liveIcon.getAttribute('data-active') !== 'true') {
                                        window.toggleLivePlatform(liveIcon, fillCol, plat);
                                    }
                                }
                                
                                // For draft mode
                                const draftIcons = document.querySelectorAll('.sm-platform-empty > div > div');
                                draftIcons.forEach(icon => {
                                    const onclickAttr = icon.getAttribute('onclick') || '';
                                    let matched = false;
                                    if (plat === 'instagram' && onclickAttr.includes('#e1306c')) matched = true;
                                    if (plat === 'facebook' && onclickAttr.includes('#1877f2')) matched = true;
                                    if (plat === 'snapchat' && onclickAttr.includes('#ca8a04')) matched = true;
                                    if (plat === 'twitter' && onclickAttr.includes('#0f1419')) matched = true;
                                    if (plat === 'linkedin' && onclickAttr.includes('#0a66c2')) matched = true;
                                    if (plat === 'tiktok' && onclickAttr.includes('#000000')) matched = true;
                                    
                                    if (matched && icon.getAttribute('data-active') !== 'true') {
                                        let col = '#000';
                                        if (plat === 'instagram') col = '#e1306c';
                                        if (plat === 'facebook') col = '#1877f2';
                                        if (plat === 'snapchat') col = '#ca8a04';
                                        if (plat === 'twitter') col = '#0f1419';
                                        if (plat === 'linkedin') col = '#0a66c2';
                                        let target = null;
                                        if (plat === 'instagram') target = 'igFormatSelector';
                                        if (plat === 'tiktok') target = 'tiktokFormatSelector';
                                        
                                        if (typeof selectSocialPlatform === 'function') {
                                            selectSocialPlatform(icon, col, target);
                                        }
                                    }
                                });
                            });
                        }, 100);
                    }
                    
                    const pType = post.postType || 'image';
                    const ptInput = document.querySelector(`input[name="smPostType"][value="${pType}"]`);
                    if (ptInput) {
                        ptInput.checked = true;
                        const parent = ptInput.parentElement;
                        parent.style.borderColor = '#f97316';
                        parent.style.background = '#fffaf5';
                        const span = parent.querySelector('span');
                        if(span) span.style.color = '#c2410c';
                        
                        const sibling = parent.nextElementSibling || parent.previousElementSibling;
                        if (sibling) {
                            sibling.style.borderColor = '#cbd5e1';
                            sibling.style.background = 'white';
                            const sibSpan = sibling.querySelector('span');
                            if(sibSpan) sibSpan.style.color = '#475569';
                        }
                    }

                    
                    // Manually inject gallery items safely
                    const mediaItems = post.mediaItems || (post.mediaObj ? [post.mediaObj] : []);
                    if (mediaItems.length > 0) {
                        const previewContainer = document.getElementById('smMediaPreviewContainer');
                        const uploadPrompt = document.getElementById('smUploadPrompt');
                        const gallery = document.getElementById('smMediaGallery');
                        
                        if (previewContainer && gallery) {
                            previewContainer.style.display = 'block';
                            gallery.innerHTML = ''; // Ensure clear
                            
                            mediaItems.forEach((mi, index) => {
                                const wrap = document.createElement('div');
                                wrap.style.cssText = 'flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; position: relative; background:#fff; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
                                
                                const delBtn = window.isClientView ? '' : `<button style="position: absolute; top: 4px; right: 4px; z-index: 5; background: #ef4444; color: white; border-radius: 50%; width: 16px; height: 16px; border: none; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1;" onclick="event.stopPropagation(); window.removeMediaItem(this)">×</button>`;
                                const badge = `<div class="sm-gallery-badge" style="position: absolute; top: 6px; left: 6px; z-index: 10; background: #f97316; color: white; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${index + 1}</div>`;
                                // For loaded dataUrls, estimate MB from base64 length or just use placeholder
                                const sizeMB = mi.dataUrl ? (mi.dataUrl.length * 0.75 / (1024 * 1024)).toFixed(2) : '0.10';
                                const sizeBadge = `<div style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); z-index: 5; background: rgba(0,0,0,0.65); color: white; border-radius: 4px; padding: 2px 4px; font-size: 8px; white-space: nowrap;">MB ${sizeMB}</div>`;
                                
                                if (mi.type === 'frame-io') {
                                    wrap.className = 'frame-io-media';
                                    wrap.setAttribute('data-url', mi.url);
                                    if (mi.thumbnail) wrap.setAttribute('data-thumbnail', mi.thumbnail);
                                    if (mi.mediaType) wrap.setAttribute('data-media-type', mi.mediaType);
                                    if (mi.duration) wrap.setAttribute('data-duration', mi.duration);
                                    wrap.style.cssText = "position: relative; width: 100%; max-width: 160px; border-radius: 8px; overflow: hidden; border: 1px solid #edf2f7; background: #fff; display: flex; flex-direction: column; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);";
                                    const placeholderId = 'frameIoPlaceholder-' + Date.now() + '-' + index;
                                    let isGoogleDrive = mi.url.includes('drive.google.com');
                                    let labelText = isGoogleDrive ? 'Google Drive' : 'Frame.io';
                                    
                                    if (isGoogleDrive) {
                                        visualContent = `<iframe src="${mi.url}" style="width: 100%; height: 100%; border: none; pointer-events: none; z-index:1;"></iframe>`;
                                    } else {
                                        if (mi.thumbnail) {
                                            const fallbackHtml = `<div style="width: 100%; height: 100%; position: absolute; top:0; left:0; background: #1e293b; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; z-index: 1;">لا توجد معاينة</div>`;
                                            visualContent = `<img src="${mi.thumbnail}" onerror="this.outerHTML=this.getAttribute('data-fallback')" data-fallback="${fallbackHtml.replace(/"/g, '&quot;')}" style="width: 100%; height: 100%; object-fit: contain; position: absolute; top:0; left:0; background: ${mi.thumbnail.includes('frame.io') ? '#f8fafc' : '#000'}; z-index: 1;">`;
                                        } else {
                                            visualContent = `<div style="width: 100%; height: 100%; position: absolute; top:0; left:0; background: #1e293b; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; z-index: 1;">لا توجد معاينة</div>`;
                                        }
                                    }
                                    
                                    wrap.innerHTML = `
                                        <div id="${placeholderId}-img" onclick="event.stopPropagation(); window.showFrameIoVideo(null, '${mi.url}', '${placeholderId}')" style="cursor: pointer; width: 100%; aspect-ratio: 9/16; background: #1e293b; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                                            ${badge}
                                            ${visualContent}

                                        </div>
                                        <div style="padding: 10px; background: #ffffff; display: flex; justify-content: center; border-top: 1px solid #edf2f7;">
                                            <button onclick="event.stopPropagation(); window.showFrameIoVideo(this, '${mi.url}', '${placeholderId}')" style="display:flex; align-items:center; justify-content:center; gap:6px; width: 100%; background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 8px 0; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                                                ${mi.mediaType === 'image' 
                                                    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> عرض` 
                                                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> عرض ${mi.duration ? '('+mi.duration+')' : ''}`
                                                }
                                            </button>
                                        </div>
                                        ${window.isClientView ? '' : `<button onclick="event.stopPropagation(); window.removeMediaItem(this)" style="position:absolute; top:6px; right:6px; width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.95); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#e53e3e; font-weight:bold; font-size:14px; box-shadow:0 1px 3px rgba(0,0,0,0.2); z-index:10; line-height: 1;">×</button>`}
                                    `;
                                } else {
                                    wrap.className = 'sm-media-item-container';
                                    wrap.style.cssText = 'position: relative; width: 100%; max-width: 160px; border-radius: 8px; overflow: hidden; border: 1px solid #edf2f7; background: #fff; display: flex; flex-direction: column; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);';
                                    const mediaTypeLabel = mi.type === 'video' ? 'فيديو' : 'صورة';
                                    const mediaElem = mi.type === 'video' 
                                        ? `<video class="sm-gallery-vid" src="${mi.dataUrl}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0; z-index: 1;" muted></video>`
                                        : `<img class="sm-gallery-img" src="${mi.dataUrl}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0; z-index: 1;">`;
                                    const clickHandler = `window.viewMediaFull(this.closest('.sm-media-item-container').querySelector('.sm-gallery-vid, .sm-gallery-img').src, '${mi.type === 'video' ? 'video' : 'image'}', event)`;
                                    
                                    wrap.innerHTML = `
                                        <div style="width: 100%; aspect-ratio: 9/16; background: #1e293b; position: relative; overflow: hidden; cursor:pointer;" onclick="${clickHandler}">
                                            ${mediaElem}
                                            ${delBtn}
                                            ${badge}
                                            ${sizeBadge}
                                        </div>
                                        <div style="padding: 10px; background: #ffffff; display: flex; justify-content: center; border-top: 1px solid #edf2f7;">
                                            <button onclick="${clickHandler}" style="width: 100%; background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 8px 0; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                                                عرض ال${mediaTypeLabel}
                                            </button>
                                        </div>
                                    `;
                                }
                                gallery.appendChild(wrap);
                            });
                        }
                    }
                    
                    // Match toggle 
                    if (post.status) {
                        let targetStatus = post.status;
                        if (!window.isLiveModeActive) targetStatus = 'مسودة';
                        else targetStatus = 'جدولة'; // Force schedule when inside Live mode
                        
                        publishToggles.forEach(b => {
                            b.classList.remove('active');
                            if (b.textContent.trim() === targetStatus) b.classList.add('active');
                        });
                        // Wait for modal transition then trigger the toggle logic 
                        setTimeout(() => {
                            const activeBtn = Array.from(publishToggles).find(b => b.classList.contains('active'));
                            if (activeBtn) activeBtn.click();
                        }, 50);
                        
                        // Show warning or success if user opened a post in Live mode
                        const warningEl = document.getElementById('smLiveScheduleWarning');
                        const successEl = document.getElementById('smLiveScheduledSuccess');
                        
                        if (window.isLiveModeActive) {
                            if (post.status === 'مسودة') {
                                if (warningEl) warningEl.style.display = 'block';
                                if (successEl) successEl.style.display = 'none';
                            } else if (post.status === 'جدولة') {
                                if (warningEl) warningEl.style.display = 'none';
                                if (successEl) successEl.style.display = 'block';
                            } else {
                                if (warningEl) warningEl.style.display = 'none';
                                if (successEl) successEl.style.display = 'none';
                            }
                        } else {
                            if (warningEl) warningEl.style.display = 'none';
                            if (successEl) successEl.style.display = 'none';
                        }
                    }
                    
                    // Set correct date target
                    if (post.dateStr) {
                        const parts = post.dateStr.split('-');
                        targetOpt = { year: parseInt(parts[0]), month: parseInt(parts[1]), date: parseInt(parts[2]) };
                        window.activeSocialDateOptions = targetOpt; // update exact selection
                    }
                }
            }
        }
        
        // Conditionally hide 'Instant' (فوري) if date is not today
        const todayForCheck = new Date();
        const resolvedOpt = targetOpt || window.activeSocialDateOptions;
        const isToday = resolvedOpt &&
                        resolvedOpt.date === todayForCheck.getDate() &&
                        resolvedOpt.month === todayForCheck.getMonth() &&
                        resolvedOpt.year === todayForCheck.getFullYear();

        publishToggles.forEach(btn => {
            if (btn.innerText.trim() === 'فوري') {
                if (isToday && window.isLiveModeActive) {
                    btn.style.display = 'inline-block';
                } else {
                    btn.style.display = 'none';
                    if (btn.classList.contains('active')) {
                        btn.classList.remove('active');
                        const draftBtn = Array.from(publishToggles).find(b => b.innerText.trim() === 'مسودة');
                        if (draftBtn) {
                            draftBtn.classList.add('active');
                            // Ensure the related input states sync if click is needed or handled elsewhere
                        }
                    }
                }
            }
        });
        
        const subtitle = document.getElementById('createPostSubtitle');
        if (subtitle && targetOpt) {
            const monthNamesArabic = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            const dayNamesArabic = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
            const d = new Date(targetOpt.year, targetOpt.month, targetOpt.date);
            const dayOfWeekArabic = dayNamesArabic[d.getDay()];
            const monthText = monthNamesArabic[targetOpt.month];
            
            subtitle.textContent = `للنشر يوم: ${dayOfWeekArabic} ${targetOpt.date} ${monthText} ${targetOpt.year}`;
            subtitle.style.fontWeight = '600';
            subtitle.style.color = '#f97316';
        } else if (subtitle) {
            subtitle.textContent = 'أنشئ وانشر محتواك على منصاتك';
            subtitle.style.fontWeight = 'normal';
            subtitle.style.color = '#718096';
        }
        
        const existingPostsArea = document.getElementById('smModalExistingPostsArea');
        if (existingPostsArea && targetOpt) {
            existingPostsArea.innerHTML = '';
            const activeBoard = boards.find(b => b.id === activeBoardId);
            if (activeBoard && activeBoard.cards) {
                const targetDateStr = `${targetOpt.year}-${targetOpt.month}-${targetOpt.date}`;
                let dayPosts = activeBoard.cards.filter(c => c.dateStr === targetDateStr && (window.smShowClientEditsToggle !== false || !c.isClientDayNote));
                
                if (dayPosts.length > 0 || postId) {
                    let html = `<h4 style="font-size:12px; color:#64748b; margin-bottom:8px; font-weight:600;">منشورات هذا اليوم:</h4><div id="smModalPostsList" style="display:flex; flex-direction:column; gap:6px;">`;
                    
                    html += dayPosts.map((p, idx) => {
                        const safeFullText = p.fullText ? window.smEscapeHTML(p.fullText) : '';
                        const safeDesc = p.description ? window.smEscapeHTML(p.description) : '';
                        const textSnippetRaw = p.fullText ? p.fullText.substring(0, 30) + '...' : (p.description ? p.description.substring(0, 30) + '...' : 'مسودة منشور...');
                        const textSnippet = window.smEscapeHTML(textSnippetRaw);
                        const items = p.mediaItems || (p.mediaObj ? [p.mediaObj] : []);
                        
                        const defaultIcon = p.postType === 'video' ? '▶️' : '🖼️';
                        let mediaThumb = `<div style="font-size:12px; margin-left:6px; flex-shrink:0;">${defaultIcon}</div>`;
                        if (items.length > 0) {
                            const m = items[0];
                            if (m.dataUrl && (!m.type || m.type === 'image')) {
                                mediaThumb = `<img src="${m.dataUrl}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                            } else if (m.thumbnail) {
                                mediaThumb = `<img src="${m.thumbnail}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                            } else if (m.type === 'frame-io' || m.type === 'video' || (m.dataUrl && m.dataUrl.startsWith('data:video/'))) {
                                mediaThumb = `<div style="width:24px; height:24px; border-radius:4px; background:#1e293b; color:white; display:flex; align-items:center; justify-content:center; margin-left:6px; flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
                            }
                        }
                        
                        const isActive = p.id === postId;
                        let bg = isActive ? '#eff6ff' : '#ffffff';
                        let border = isActive ? '1px solid #3b82f6' : '1px solid #e2e8f0';
                        let accentColor = '#94a3b8'; 
                        
                        if (!isActive) {
                            if (p.status === 'فوري') { bg = '#f0fdf4'; border = '1px solid #bbf7d0'; accentColor = '#22c55e'; }
                            else if (p.status === 'جدولة') { bg = '#fffbeb'; border = '1px solid #fde68a'; accentColor = '#f59e0b'; }
                        } else {
                            if (p.status === 'فوري') accentColor = '#22c55e';
                            else if (p.status === 'جدولة') accentColor = '#f59e0b';
                        }
                        
                        const hoverStyle = isActive ? "" : "onmouseover=\"this.style.transform='scale(1.02)'\" onmouseout=\"this.style.transform='scale(1)'\"";
                        const clickEvt = isActive ? "" : `onclick="const ta = document.querySelector('.sm-textarea'); const hi = document.getElementById('smMediaInput'); if((ta && ta.value.trim()) || (hi && hi.files.length>0) || document.getElementById('smMediaGallery').children.length > 0) window.saveSocialDraft(true); setTimeout(() => window.openCreatePostModal('${p.id}'), 100);"`;
                        const pointerEvt = isActive ? "pointer-events: none; opacity: 0.9;" : "cursor: pointer;";
                        const shadow = isActive ? "box-shadow: 0 0 0 2px rgba(59,130,246,0.3);" : "box-shadow: 0 1px 2px rgba(0,0,0,0.05);";

                        return `
                        <div data-id="${p.id}" ${clickEvt} ${hoverStyle} title="${safeFullText || safeDesc || ''}" style="padding: 6px; border-radius: 6px; background: ${bg}; border: ${border}; border-right: 3px solid ${accentColor}; font-size: 11px; color: #1e293b; display: flex; align-items: center; transition: transform 0.1s; direction: rtl; ${pointerEvt} ${shadow}">
                            <div class="sm-sidebar-drag-handle" style="font-weight: 800; color: #cbd5e1; font-size: 14px; margin-left: 8px; cursor: grab; user-select: none; -webkit-user-select: none; display: flex; align-items: center; justify-content: center; pointer-events: auto;" onclick="event.stopPropagation();">${idx + 1}</div>
                            ${mediaThumb}
                            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-weight: ${isActive ? '700' : '500'}; color: ${isActive ? '#1d4ed8' : '#1e293b'}; margin-left: 4px;">${textSnippet}</div>
                            ${window.isClientView ? '' : `
                            <button onclick="event.stopPropagation(); window.deleteSocialPost('${p.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; border-radius: 4px; pointer-events: auto; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: all 0.2s;" onmouseover="this.style.opacity='1'; this.style.background='#fee2e2';" onmouseout="this.style.opacity='0.7'; this.style.background='transparent';" title="حذف المنشور">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>`}
                        </div>`;
                    }).join('');
                    
                    html += `</div>`;
                    
                    existingPostsArea.innerHTML = html;
                    existingPostsArea.style.display = 'block';
                    
                    setTimeout(() => {
                        const listEl = document.getElementById('smModalPostsList');
                        if (listEl && typeof Sortable !== 'undefined') {
                            new Sortable(listEl, {
                                animation: 150,
                                handle: '.sm-sidebar-drag-handle',
                                onEnd: function () {
                                    const board = boards.find(b => b.id === activeBoardId);
                                    if (board && board.cards) {
                                        const dateStr = `${targetOpt.year}-${targetOpt.month}-${targetOpt.date}`;
                                        const originalDayCards = board.cards.filter(c => c.dateStr === dateStr);
                                        const newOrderDOMIds = Array.from(listEl.children).map(c => c.getAttribute('data-id')).filter(id => id);
                                        const rearrangedDayCards = newOrderDOMIds.map(id => originalDayCards.find(c => c.id === id)).filter(c => c);
                                        
                                        let replacementIndex = 0;
                                        board.cards = board.cards.map(c => {
                                            if (c.dateStr === dateStr) {
                                                const replacementCard = rearrangedDayCards[replacementIndex];
                                                replacementIndex++;
                                                return replacementCard;
                                            }
                                            return c;
                                        });
                                        
                                        saveState();
                                        render();
                                        setTimeout(() => window.openCreatePostModal(window.currentEditingSocialPostId), 50);
                                    }
                                }
                            });
                        }
                    }, 50);
                } else {
                    existingPostsArea.style.display = 'none';
                }
            } else {
                existingPostsArea.style.display = 'none';
            }
        }
        const feedbackSec = document.getElementById('smClientFeedbackSection');
        const footer = createPostModal.querySelector('.sm-modal-footer');
        const modalBody = createPostModal.querySelector('.modal-body');
        
        if (footer) footer.style.display = 'flex';
        
        if (modalBody) {
            // Restore settings
            const leftCol = modalBody.querySelector('.sm-modal-left-col');
            if (leftCol) leftCol.style.display = 'flex';
            
            const uploadPrompt = modalBody.querySelector('.sm-upload-prompt-dashed');
            if (uploadPrompt) uploadPrompt.style.display = 'flex';
            
            const charCount = modalBody.querySelector('.sm-char-count');
            if (charCount) charCount.style.display = 'block';
            
            modalBody.style.gridTemplateColumns = '1fr 280px';
            modalBody.style.maxWidth = 'none';
            modalBody.style.margin = '0';
            
            const textH4 = modalBody.querySelector('.sm-textarea-header');
            if (textH4) textH4.style.display = 'block';
            
            const textArea = modalBody.querySelector('.sm-textarea');
            if (textArea) {
                textArea.style.pointerEvents = 'auto';
                textArea.style.background = '#ffffff';
            }
            
            const deleteBtn = document.getElementById('btnDeletePost');
            if (deleteBtn) deleteBtn.style.display = 'flex';
            
            // Frame.io vs Client Edits
            const frameIoLabel = document.getElementById('frameIoLabel');
            const frameIoContainer = document.getElementById('frameIoContainer');
            const clientEditsLabel = document.getElementById('clientEditsLabel');
            const clientEditsContainer = document.getElementById('clientEditsContainer');
            const clientEditsInput = document.getElementById('clientEditsInput');
            
            let existingEdits = '';
            if (postId) {
                const activeBoard = boards.find(b => b.id === activeBoardId);
                if (activeBoard && activeBoard.cards) {
                    const post = activeBoard.cards.find(c => c.id === postId);
                    if (post && post.clientEdits) existingEdits = post.clientEdits;
                }
            }
            if (clientEditsInput) { 
                const newTextArea = document.createElement('textarea');
                newTextArea.id = 'clientEditsInput';
                newTextArea.placeholder = clientEditsInput.placeholder;
                newTextArea.className = clientEditsInput.className || '';
                newTextArea.style.cssText = clientEditsInput.style.cssText;
                newTextArea.value = existingEdits;
                newTextArea.innerHTML = window.smEscapeHTML ? window.smEscapeHTML(existingEdits) : existingEdits;
                newTextArea.oninput = function() {
                    if (window.currentEditingSocialPostId && typeof boards !== 'undefined' && typeof activeBoardId !== 'undefined') {
                        const board = boards.find(b => b.id === activeBoardId);
                        if (board && board.cards) {
                            const post = board.cards.find(c => c.id === window.currentEditingSocialPostId);
                            if (post) {
                                post.clientEdits = this.value;
                                if (typeof window.saveState === 'function') window.saveState();
                                if (typeof window.saveSocialDraft === 'function') window.saveSocialDraft(true);
                                if (typeof window.updateLiveDiff === 'function') window.updateLiveDiff();
                            }
                        }
                    }
                };
                
                // Copy any other attributes like dir="rtl"
                Array.from(clientEditsInput.attributes).forEach(attr => {
                    if (attr.name !== 'id' && attr.name !== 'style' && attr.name !== 'class' && attr.name !== 'placeholder') {
                        newTextArea.setAttribute(attr.name, attr.value);
                    }
                });
                
                clientEditsInput.parentNode.replaceChild(newTextArea, clientEditsInput);
            }
            
            if (window.isClientView) {
                const zone = document.getElementById("smUploadZone");
                if (zone) zone.style.setProperty("margin-bottom", "0px", "important");
                if (zone) zone.style.setProperty("display", "block", "important"); // Keep media visible
                
                const prompt = document.getElementById("smUploadPrompt");
                if (prompt) {
                    prompt.style.setProperty("display", "none", "important");
                    prompt.style.cssText = "display: none !important;";
                }
                
                if (frameIoLabel) frameIoLabel.style.setProperty("display", "none", "important");
                if (frameIoContainer) frameIoContainer.style.setProperty("display", "none", "important");
                
                const publishSec = document.getElementById("publishSection");
                if (publishSec) {
                    publishSec.style.setProperty("display", "none", "important");
                } else {
                    // Fallback if index.html is cached
                    document.querySelectorAll(".sm-modal-section").forEach(sec => {
                        if (sec.innerHTML.includes("النشر") && sec.innerHTML.includes("مسودة")) {
                            sec.style.setProperty("display", "none", "important");
                        }
                    });
                }
                
                if (clientEditsLabel) clientEditsLabel.style.setProperty("display", "flex", "important");
                if (clientEditsContainer) clientEditsContainer.style.setProperty("display", "flex", "important");
                
                // Backup creation if the user is stuck on cached index.html
                if (!document.getElementById("clientEditsInput") && prompt) {
                    const editsLabel = document.createElement("div");
                    editsLabel.id = "clientEditsLabel";
                    editsLabel.style.cssText = "color: #22c55e; font-size: 15px; font-weight: 600; align-items: center; gap: 8px; margin-bottom: 12px; width: 100%; text-align: right; display: flex;";
                    editsLabel.innerHTML = "هل هناك تعديلات؟";
                    prompt.appendChild(editsLabel);

                    const editsContainer = document.createElement("div");
                    editsContainer.id = "clientEditsContainer";
                    editsContainer.style.cssText = "width: 100%; max-width: 100%; display: flex;";
                    editsContainer.innerHTML = '<textarea id="clientEditsInput" oninput="if(window.currentEditingSocialPostId&&window.boards&&window.activeBoardId){const board=boards.find(b=>b.id===activeBoardId);if(board&&board.cards){const post=board.cards.find(c=>c.id===window.currentEditingSocialPostId);if(post){post.clientEdits=this.value;post.clientModified=this.value.trim()!==\'\';if(window.saveState)window.saveState();if(typeof window.saveSocialDraft===\'function\')setTimeout(()=>window.saveSocialDraft(true),50);if(typeof window.updateLiveDiff===\'function\')setTimeout(window.updateLiveDiff,100);}}}" placeholder="اكتب ملاحظاتك أو طلبات التعديل هنا..." style="width:100%; min-height: 80px; border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 6px; padding: 12px; font-size: 13px; outline:none; resize: vertical;"></textarea>';
                    prompt.appendChild(editsContainer);
                    
                    const newInputs = document.getElementById("clientEditsInput");
                    if (newInputs) { newInputs.value = existingEdits; newInputs.innerHTML = existingEdits; }
                }
            } else {
                if (frameIoLabel) frameIoLabel.style.setProperty("display", "flex", "important");
                if (frameIoContainer) frameIoContainer.style.setProperty("display", "flex", "important");
                
                const publishSec = document.getElementById("publishSection");
                if (publishSec) publishSec.style.setProperty("display", "block", "important");
                
                if (clientEditsLabel) clientEditsLabel.style.setProperty("display", "none", "important");
                if (clientEditsContainer) clientEditsContainer.style.setProperty("display", "none", "important");
            }
        }
        

        createPostModal.classList.add('active');
    }
};
const closeCreatePostModal = document.getElementById('closeCreatePostModal');



const pipedriveDomainInput = document.getElementById('pipedriveDomain');
const pipedriveTokenInput = document.getElementById('pipedriveToken');
const fetchPipedrivePipelinesBtn = document.getElementById('fetchPipedrivePipelinesBtn');
const pipedrivePipelineSelectGroup = document.getElementById('pipedrivePipelineSelectGroup');
const pipedrivePipelineSelect = document.getElementById('pipedrivePipelineSelect');
const savePipedriveSettingsBtn = document.getElementById('savePipedriveSettingsBtn');

if (closePipedriveSettingsModal) {
    if(closePipedriveSettingsModal) closePipedriveSettingsModal.onclick = () => pipedriveSettingsModal.classList.remove('active');
}

if (closeCreatePostModal && createPostModal) {
    window.handleModalDismiss = () => {
        const createPostModal = document.getElementById('createPostModal');
        const textArea = document.querySelector('.sm-textarea');
        try {
            const textContent = textArea ? textArea.value.trim() : '';
            const gallery = document.getElementById('smMediaGallery');
            const hasGalleryItems = gallery && gallery.children.length > 0;
            
            const isEmpty = !textContent && !hasGalleryItems;
            
            if (isEmpty) {
                if (window.currentEditingSocialPostId) {
                    const board = boards.find(b => b.id === activeBoardId);
                    if (board) {
                        const idx = board.cards.findIndex(c => c.id === window.currentEditingSocialPostId);
                        if (idx > -1) {
                            board.cards.splice(idx, 1);
                            if (typeof saveState === 'function') saveState();
                            if (typeof render === 'function') render();
                        }
                    }
                }
            } else {
                if (typeof window.saveSocialDraft === 'function') window.saveSocialDraft(true);
            }
        } catch (e) {
            console.error("Error during modal dismiss logic", e);
        } finally {
            if (createPostModal) createPostModal.classList.remove('active');
            if (textArea) textArea.value = '';
            if (typeof window.clearMediaUpload === 'function') window.clearMediaUpload();
        }
    };

    if(closeCreatePostModal) closeCreatePostModal.onclick = window.handleModalDismiss;
    
    // Close modal if clicking outside the content box
    if(createPostModal) createPostModal.addEventListener('click', (e) => {
        if (e.target === createPostModal) {
            window.handleModalDismiss();
        }
    });

    // Also bind Cancel button inside modal body
    const cancelBtn = createPostModal.querySelector('.sm-btn-cancel');
    if (cancelBtn) if(cancelBtn) cancelBtn.onclick = window.handleModalDismiss;

    // Bind Publish Mode toggles
    const publishToggles = createPostModal.querySelectorAll('.sm-toggle-btn');
    const optionalWrapper = document.getElementById('sm-optional-fields-wrapper');
    const primaryActionBtn = document.getElementById('sm-primary-action-btn');
    if (primaryActionBtn) {
        if(primaryActionBtn) primaryActionBtn.onclick = () => window.saveSocialDraft();
    }

    if (publishToggles.length > 0) {
        publishToggles.forEach(btn => {
            if(btn) btn.onclick = () => {
                publishToggles.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const mode = btn.textContent.trim();
                
                if (mode === 'مسودة') {
                    if (optionalWrapper) optionalWrapper.classList.add('collapsed');
                    if (primaryActionBtn) primaryActionBtn.textContent = 'حفظ كمسودة';
                } else if (mode === 'فوري') {
                    if (optionalWrapper) optionalWrapper.classList.add('collapsed');
                    if (primaryActionBtn) primaryActionBtn.textContent = 'نشر الآن';
                } else {
                    if (optionalWrapper) optionalWrapper.classList.remove('collapsed');
                    if (primaryActionBtn) primaryActionBtn.textContent = 'جدولة المنشور';
                    
                    const dateInput = createPostModal.querySelector('.sm-date-input');
                    const timeInput = createPostModal.querySelector('.sm-time-input');
                    if (dateInput && window.activeSocialDateOptions) {
                        const d = window.activeSocialDateOptions.date.toString().padStart(2, '0');
                        const m = (window.activeSocialDateOptions.month + 1).toString().padStart(2, '0');
                        const y = window.activeSocialDateOptions.year;
                        dateInput.value = `${y}-${m}-${d}`;
                    }
                    if (timeInput) {
                        // Retrieve the time from the current post if it exists, otherwise default to blank or a placeholder
                        let currentEditingPost = null;
                        if (window.boards && window.activeBoardId && window.currentEditingSocialPostId) {
                            const b = boards.find(bd => bd.id === window.activeBoardId);
                            if (b && b.cards) currentEditingPost = b.cards.find(c => c.id === window.currentEditingSocialPostId);
                        }
                        if (currentEditingPost && currentEditingPost.timeStr) {
                            timeInput.value = currentEditingPost.timeStr;
                        } else {
                            timeInput.value = '16:00';
                        }
                    }
                }
            };
        });
    }
}

function openPipedriveSettingsModal() {
    pipedriveDomainInput.value = localStorage.getItem('pipedriveDomain') || '';
    pipedriveTokenInput.value = localStorage.getItem('pipedriveToken') || '';
    pipedrivePipelineSelectGroup.style.display = 'none';
    pipedrivePipelineSelect.innerHTML = '';
    pipedriveSettingsModal.classList.add('active');
}

if (fetchPipedrivePipelinesBtn) {
    if(fetchPipedrivePipelinesBtn) fetchPipedrivePipelinesBtn.onclick = async () => {
        const domain = pipedriveDomainInput.value.trim();
        const token = pipedriveTokenInput.value.trim();
        if(!domain || !token) {
            showToast("Enter both Domain and Token first");
            return;
        }
        
        const btnText = fetchPipedrivePipelinesBtn.textContent;
        fetchPipedrivePipelinesBtn.textContent = "Fetching...";
        
        try {
            const res = await fetch(`https://${domain}.pipedrive.com/api/v1/pipelines?api_token=${token}`);
            if(!res.ok) throw new Error("Invalid credentials");
            const payload = await res.json();
            const fetchedPipelines = payload.data || [];
            
            pipedrivePipelineSelect.innerHTML = '<option value="">-- Choose a Pipeline to Link --</option>';
            fetchedPipelines.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                const curBoard = boards.find(b2 => b2.id === activeBoardId);
                if(curBoard && curBoard.pipedrivePipelineId == p.id) opt.selected = true;
                pipedrivePipelineSelect.appendChild(opt);
            });
            
            pipedrivePipelineSelectGroup.style.display = 'block';
        } catch (err) {
            showToast("Failed to fetch Pipedrive pipelines. Check API token or Domain.");
        } finally {
            fetchPipedrivePipelinesBtn.textContent = btnText;
        }
    };
}

if (savePipedriveSettingsBtn) {
    if(savePipedriveSettingsBtn) savePipedriveSettingsBtn.onclick = () => {
        const domain = pipedriveDomainInput.value.trim();
        const token = pipedriveTokenInput.value.trim();
        localStorage.setItem('pipedriveDomain', domain);
        localStorage.setItem('pipedriveToken', token);
        
        pipedriveDomain = domain;
        pipedriveToken = token;
        
        const curBoard = boards.find(b => b.id === activeBoardId);
        if (curBoard) {
            const selectedPipelineId = pipedrivePipelineSelect.value;
            if (selectedPipelineId) {
                curBoard.pipedrivePipelineId = selectedPipelineId;
                curBoard.pipedrivePipelineName = pipedrivePipelineSelect.options[pipedrivePipelineSelect.selectedIndex].text;
                showToast(`Linked to Pipedrive!`);
            } else {
                curBoard.pipedrivePipelineId = null;
                showToast("Saved Credentials");
            }
            saveState();
            render(); 
        }
        
        pipedriveSettingsModal.classList.remove('active');
    };
}

const trelloMappingModal = document.getElementById('trelloMappingModal');
const closeTrelloMappingModal = document.getElementById('closeTrelloMappingModal');
const trelloTrackerCheckboxes = document.getElementById('trelloTrackerCheckboxes');
const trelloSpawnDirection = document.getElementById('trelloSpawnDirection');
const generateTrelloTrackersBtn = document.getElementById('generateTrelloTrackersBtn');
const trelloSelectAllBtn = document.getElementById('trelloSelectAllBtn');
let pendingSourceList = null;

if (trelloSelectAllBtn) {
    if(trelloSelectAllBtn) trelloSelectAllBtn.onclick = () => {
        const checkboxes = document.querySelectorAll('.trello-tracker-cb');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        trelloSelectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    };
}

if (closeTrelloMappingModal) {
    if(closeTrelloMappingModal) closeTrelloMappingModal.onclick = () => trelloMappingModal.classList.remove('active');
}

let pendingLayoutList = null;
const trelloLayoutModal = document.getElementById('trelloLayoutModal');
const layoutSpacingX = document.getElementById('layoutSpacingX');
const layoutSpacingY = document.getElementById('layoutSpacingY');

if (document.getElementById('closeTrelloLayoutModal')) {
    document.getElementById('closeTrelloLayoutModal').onclick = () => {
        trelloLayoutModal.classList.remove('active');
    };
}

if (document.getElementById('saveTrelloLayoutBtn')) {
    document.getElementById('saveTrelloLayoutBtn').onclick = () => {
        if (pendingLayoutList) {
            pendingLayoutList.trelloOffsetX = parseInt(layoutSpacingX.value) || 0;
            pendingLayoutList.trelloSpacingY = parseInt(layoutSpacingY.value) || 60;
            pendingLayoutList.trelloAlignType = 'top'; // Hardcoded fallback for existing math
            const curBoard = boards.find(b => b.id === activeBoardId);
            if (curBoard && window.applySmartPacking) window.applySmartPacking(curBoard);
            saveState();
            if (typeof render === 'function') render();
            trelloLayoutModal.classList.remove('active');
        }
    };
}

window.openTrelloLayoutModal = function(list) {
    pendingLayoutList = list;
    if (layoutSpacingX) layoutSpacingX.value = list.trelloOffsetX !== undefined ? list.trelloOffsetX : 0;
    if (layoutSpacingY) layoutSpacingY.value = list.trelloSpacingY !== undefined ? list.trelloSpacingY : 60;
    if (trelloLayoutModal) trelloLayoutModal.classList.add('active');
};

let pendingAdsLayoutList = null;
const adsLayoutModal = document.getElementById('adsLayoutModal');
const adsLayoutSpacingX = document.getElementById('adsLayoutSpacingX');
const adsLayoutSpacingY = document.getElementById('adsLayoutSpacingY');

if (document.getElementById('closeAdsLayoutModal')) {
    document.getElementById('closeAdsLayoutModal').onclick = () => {
        adsLayoutModal.classList.remove('active');
    };
}

if (document.getElementById('saveAdsLayoutBtn')) {
    document.getElementById('saveAdsLayoutBtn').onclick = () => {
        if (pendingAdsLayoutList) {
            pendingAdsLayoutList.adsOffsetX = parseInt(adsLayoutSpacingX.value) || 0;
            pendingAdsLayoutList.adsSpacingY = parseInt(adsLayoutSpacingY.value) || 60;
            pendingAdsLayoutList.adsOffsetY = 600; // Hardcoded fallback for existing math
            pendingAdsLayoutList.adsAlignType = 'top'; // Hardcoded fallback for existing math
            
            const curBoard = boards.find(b => b.id === activeBoardId);
            if (curBoard && window.applySmartPacking) window.applySmartPacking(curBoard);
            
            saveState();
            if (typeof render === 'function') render();
            adsLayoutModal.classList.remove('active');
        }
    };
}

window.openAdsLayoutModal = function(list) {
    pendingAdsLayoutList = list;
    if (adsLayoutSpacingX) adsLayoutSpacingX.value = list.adsOffsetX !== undefined ? list.adsOffsetX : 0;
    if (adsLayoutSpacingY) adsLayoutSpacingY.value = list.adsSpacingY !== undefined ? list.adsSpacingY : 60;
    if (adsLayoutModal) adsLayoutModal.classList.add('active');
};

async function openTrelloMappingGenerator(sourceList, trackerType = 'trello') {
    window.pendingTrackerType = trackerType;
    const curBoard = boards.find(b => b.id === activeBoardId);
    if (!trelloKey || !trelloToken || !curBoard) {
        showToast("Enter Trello Key and Token in settings first!");
        return;
    }
    
    pendingSourceList = sourceList;
    if (trelloSelectAllBtn) trelloSelectAllBtn.textContent = 'Select All';
    
    const existingConnections = (curBoard.connections || []).filter(c => c.source === sourceList.id);
    const typeMatch = window.pendingTrackerType || 'trello';
    const existingTrackers = existingConnections.map(c => curBoard.lists.find(l => l.id === c.target)).filter(l => Boolean(l) && (l.trackerType || 'trello') === typeMatch);
    const existingTrackerTrelloIds = existingTrackers.map(l => l.trelloListId).filter(Boolean);
    
    let preSelectedBoardId = null;
    let preSelectedSourcePort = 'top';
    let preSelectedTargetPort = 'auto';

    if (existingTrackers.length > 0) {
        if (existingTrackers[0].trelloBoardId) preSelectedBoardId = existingTrackers[0].trelloBoardId;
        if (existingConnections.length > 0) {
            preSelectedSourcePort = existingConnections[0].sourcePort || 'top';
            
            const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            if (existingConnections[0].targetPort !== opp[preSelectedSourcePort]) {
                preSelectedTargetPort = existingConnections[0].targetPort || 'auto';
            }
        }
    }
    
    trelloSpawnDirection.value = preSelectedSourcePort;
    const targetPortSelect = document.getElementById('trelloTargetPort');
    if (targetPortSelect) targetPortSelect.value = preSelectedTargetPort;

    const boardSelect = document.getElementById('trelloMappingBoardSelect');
    
    try {
        const boardsRes = await fetch(`https://api.trello.com/1/members/me/boards?fields=name,url&key=${trelloKey}&token=${trelloToken}`);
        if(!boardsRes.ok) throw new Error("Failed to fetch boards");
        const tBoards = await boardsRes.json();
        
        if (boardSelect) {
            boardSelect.innerHTML = '<option value="">-- Choose a Board --</option>';
            tBoards.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                
                if (preSelectedBoardId) {
                    if (preSelectedBoardId === b.id) opt.selected = true;
                } else if (curBoard.trelloBoardId === b.id) {
                    opt.selected = true;
                }
                
                boardSelect.appendChild(opt);
            });
            
            const fetchListsForBoard = async (boardId) => {
                trelloTrackerCheckboxes.innerHTML = '<div style="padding:10px; font-size:13px; color:#5e6c84;">Loading lists...</div>';
                try {
                    const res = await fetch(`https://api.trello.com/1/boards/${boardId}/lists?key=${trelloKey}&token=${trelloToken}`);
                    if(!res.ok) throw new Error("Failed parameter");
                    const tLists = await res.json();
                    
                    trelloTrackerCheckboxes.innerHTML = '';
                    tLists.forEach(tl => {
                        const row = document.createElement('label');
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.padding = '10px 12px';
                        row.style.margin = '0 0 6px 0';
                        row.style.borderRadius = '6px';
                        row.style.background = '#ffffff';
                        row.style.border = '1px solid #dfe1e6';
                        row.style.cursor = 'pointer';
                        row.style.transition = 'all 0.2s ease';
                        row.onmouseenter = () => { row.style.boxShadow = '0 2px 4px rgba(9, 30, 66, 0.08)'; row.style.borderColor = 'var(--primary-color)'; };
                        row.onmouseleave = () => { row.style.boxShadow = 'none'; row.style.borderColor = '#dfe1e6'; };

                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.value = tl.id;
                        cb.className = 'trello-tracker-cb';
                        cb.dataset.name = tl.name;
                        cb.style.cursor = 'pointer';
                        cb.style.margin = '0';
                        cb.checked = existingTrackerTrelloIds.includes(tl.id);

                        const span = document.createElement('span');
                        span.textContent = tl.name;
                        span.style.marginLeft = '12px';
                        span.style.fontSize = '14px';
                        span.style.color = 'var(--text-color)';
                        span.style.fontWeight = '500';

                        row.appendChild(cb);
                        row.appendChild(span);
                        trelloTrackerCheckboxes.appendChild(row);
                    });
                } catch (err) {
                    showToast("Failed to fetch Trello lists");
                    trelloTrackerCheckboxes.innerHTML = '';
                }
            };

            boardSelect.onchange = () => {
                const selectedBoardId = boardSelect.value;
                if (selectedBoardId) {
                    fetchListsForBoard(selectedBoardId);
                } else {
                    trelloTrackerCheckboxes.innerHTML = '';
                }
            };
            
            if (boardSelect.value) {
                fetchListsForBoard(boardSelect.value);
            } else if (tBoards.length > 0) {
                boardSelect.value = tBoards[0].id;
                fetchListsForBoard(tBoards[0].id);
            } else {
                trelloTrackerCheckboxes.innerHTML = '';
            }
        }
        
        trelloMappingModal.classList.add('active');
    } catch (err) {
        showToast("Failed to fetch Trello boards");
    }
}

const trelloTasksMappingModal = document.getElementById('trelloTasksMappingModal');
const closeTrelloTasksMappingModal = document.getElementById('closeTrelloTasksMappingModal');
const generateTrelloTasksBtn = document.getElementById('generateTrelloTasksBtn');

if (closeTrelloTasksMappingModal) {
    if(closeTrelloTasksMappingModal) closeTrelloTasksMappingModal.onclick = () => trelloTasksMappingModal.classList.remove('active');
}

const serviceCardsModal = document.getElementById('serviceCardsModal');
const closeServiceCardsModal = document.getElementById('closeServiceCardsModal');

if (closeServiceCardsModal) {
    if(closeServiceCardsModal) closeServiceCardsModal.onclick = () => serviceCardsModal.classList.remove('active');
}

function openServiceCardsModal(title, icon, cards) {
    const activeBoard = boards.find(b => b.id === activeBoardId);
    if (!activeBoard) return;
    
    const titleEl = document.getElementById('serviceCardsModalTitle');
    const iconEl = document.getElementById('serviceCardsModalIcon');
    const container = document.getElementById('serviceCardsModalList');
    
    if (titleEl) titleEl.textContent = title;
    if (iconEl) {
        if (icon.includes('<svg')) {
            iconEl.innerHTML = icon.replace(/width="14"/g, 'width="32"').replace(/height="14"/g, 'height="32"');
        } else {
            iconEl.innerHTML = icon;
            iconEl.style.fontSize = '32px';
        }
    }
    
    if (container) {
        container.innerHTML = '';
        if (cards.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--secondary-color); font-size: 13px;">No clients found for this criteria.</div>';
        } else {
            cards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card';
                cardEl.style.flexDirection = 'row';
                
                const cColor = (activeBoard.cardColors && activeBoard.cardColors[card.id]) ? activeBoard.cardColors[card.id] : (card.color || 'default');
                const borderHex = cColor === 'green' ? '#22A06B' : cColor === 'red' ? '#C9372C' : cColor === 'orange' ? '#FF9800' : cColor === 'yellow' ? '#F5CD47' : '#5e6c84';
                
                cardEl.style.borderLeft = `4px solid ${borderHex}`;
                cardEl.style.padding = '12px 16px';
                cardEl.style.marginBottom = '8px';
                cardEl.style.cursor = 'pointer';
                cardEl.style.display = 'flex';
                cardEl.style.justifyContent = 'space-between';
                cardEl.style.alignItems = 'center';
                
                const nameContainer = document.createElement('div');
                nameContainer.style.display = 'flex';
                nameContainer.style.alignItems = 'center';
                
                const nameEl = document.createElement('div');
                nameEl.style.fontWeight = '600';
                nameEl.style.color = '#172b4d';
                nameEl.style.fontSize = '14px';
                nameEl.textContent = card.title || 'Untitled Client';
                nameContainer.appendChild(nameEl);
                
                let sentEmoji = '';
                const isSentimentModal = ['Green Clients', 'Yellow Clients', 'Orange Clients', 'Red Clients', 'Unassigned Clients'].includes(title);
                
                if (!isSentimentModal) {
                    if (cColor === 'green') sentEmoji = '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#43A047"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><path d="M8 15 Q12 19 16 15" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>';
                    else if (cColor === 'yellow') sentEmoji = '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FDD835"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><line x1="8" y1="15" x2="16" y2="15" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>';
                    else if (cColor === 'orange') sentEmoji = '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF9800"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><path d="M8 17 Q12 13 16 17" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>';
                    else if (cColor === 'red') sentEmoji = '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#E53935"/><circle cx="8" cy="11" r="1.5" fill="#212121"/><circle cx="16" cy="11" r="1.5" fill="#212121"/><line x1="6" y1="8" x2="10" y2="10" stroke="#212121" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="8" x2="14" y2="10" stroke="#212121" stroke-width="2" stroke-linecap="round"/><path d="M8 17 Q12 13 16 17" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>';
                }
                
                if (sentEmoji) {
                    const seEl = document.createElement('span');
                    seEl.style.marginLeft = '4px';
                    seEl.style.display = 'flex';
                    seEl.style.alignItems = 'center';
                    seEl.innerHTML = sentEmoji;
                    nameContainer.appendChild(seEl);
                }
                
                if (card.services && card.services.length > 0) {
                    const localEmojiMap = {
                        'Store': '🛍️',
                        'Paid Ads': '🚀',
                        'Social Media': '📱',
                        'SEO': '🔎',
                        'WA API': '💬',
                        'Website monitoring': '⚡',
                        'Marketplaces': '🛒'
                    };
                    const svcsEl = document.createElement('div');
                    svcsEl.style.display = 'flex';
                    svcsEl.style.marginLeft = '8px';
                    svcsEl.style.fontSize = '13px';
                    
                    let htmlStr = '';
                    card.services.forEach(svc => htmlStr += `<span style="margin-right:2px;" title="${svc}">${localEmojiMap[svc]||'🔧'}</span>`);
                    svcsEl.innerHTML = htmlStr;
                    nameContainer.appendChild(svcsEl);
                }
                
                const viewBtn = document.createElement('div');
                viewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5e6c84" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7; transition: opacity 0.2s;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
                
                cardEl.onmouseenter = () => viewBtn.querySelector('svg').style.opacity = '1';
                cardEl.onmouseleave = () => viewBtn.querySelector('svg').style.opacity = '0.7';
                
                cardEl.appendChild(nameContainer);
                cardEl.appendChild(viewBtn);
                
                if(cardEl) cardEl.onclick = () => {
                    serviceCardsModal.classList.remove('active');
                    const activeBoard = boards.find(b => b.id === activeBoardId);
                    if (activeBoard) {
                        activeBoard.isolateCardId = card.id;
                        saveState();
                        render();
                        setTimeout(() => {
                            const target = document.querySelector(`[data-card-id="${card.id}"]`);
                            if (target) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                                target.style.boxShadow = '0 0 0 3px #0c66e4, 0 8px 24px rgba(12, 102, 228, 0.4)';
                                target.style.transform = 'scale(1.02)';
                                target.style.transition = 'all 0.3s ease';
                            }
                        }, 100);
                    }
                };
                
                container.appendChild(cardEl);
            });
        }
    }
    
    if (serviceCardsModal) serviceCardsModal.classList.add('active');
}

const trelloTasksViewModal = document.getElementById('trelloTasksViewModal');
const closeTrelloTasksViewModal = document.getElementById('closeTrelloTasksViewModal');

if (closeTrelloTasksViewModal) {
    if(closeTrelloTasksViewModal) closeTrelloTasksViewModal.onclick = () => trelloTasksViewModal.classList.remove('active');
}

function openTrelloTasksViewModal(list) {
    const listTitle = document.getElementById('trelloTasksViewTitle');
    const container = document.getElementById('trelloTasksViewList');
    
    if (listTitle) listTitle.textContent = list.title || "Team Tasks";
    if (container) {
        container.innerHTML = '';
        
        const tasks = list.cards.filter(c => c.isTrelloTask);
        if (tasks.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--secondary-color); font-size: 13px;">No tasks found here.</div>';
        } else {
            tasks.forEach(task => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card';
                cardEl.style.borderLeft = '3px solid #5e6c84';
                cardEl.style.cursor = 'pointer';
                cardEl.style.marginBottom = '0';
                if(cardEl) cardEl.onclick = () => openTrelloCardDetailsModal(task.id, list.id);
                
                const titleEl = document.createElement('div');
                titleEl.className = 'card-title';
                titleEl.style.lineHeight = '1.4';
                titleEl.textContent = task.title;
                
                cardEl.appendChild(titleEl);
                container.appendChild(cardEl);
            });
        }
    }
    
    if (trelloTasksViewModal) trelloTasksViewModal.classList.add('active');
}

const clientHappinessMappingModal = document.getElementById('clientHappinessMappingModal');
const closeClientHappinessMappingModal = document.getElementById('closeClientHappinessMappingModal');
const clientHappinessSpawnDirection = document.getElementById('clientHappinessSpawnDirection');
const clientHappinessTargetPort = document.getElementById('clientHappinessTargetPort');
const generateClientHappinessTrackerBtn = document.getElementById('generateClientHappinessTrackerBtn');

if (closeClientHappinessMappingModal) {
    if(closeClientHappinessMappingModal) closeClientHappinessMappingModal.onclick = () => clientHappinessMappingModal.classList.remove('active');
}

if (generateClientHappinessTrackerBtn) {
    if(generateClientHappinessTrackerBtn) generateClientHappinessTrackerBtn.onclick = () => {
        if (!pendingSourceList) return;
        
        const spawnDir = clientHappinessSpawnDirection.value;
        const targetPort = clientHappinessTargetPort.value;
        const curBoard = boards.find(b => b.id === activeBoardId);
        
        let actualTargetPort = targetPort;
        if (actualTargetPort === 'auto') {
            const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            actualTargetPort = opp[spawnDir] || 'left';
        }
        
        let targetX = pendingSourceList.x || 0;
        let targetY = pendingSourceList.y || 80;
        
        if (spawnDir === 'right') targetX += 340;
        else if (spawnDir === 'left') targetX -= 340;
        else if (spawnDir === 'bottom') targetY += 200;
        else if (spawnDir === 'top') targetY -= 200;
        
        if (!curBoard.connections) curBoard.connections = [];
        const existingClientHappinessConn = curBoard.connections.find(c => 
            c.source === pendingSourceList.id && curBoard.lists.find(l => l.id === c.target && l.isClientHappiness)
        );
        
        if (existingClientHappinessConn) {
            // Update existing connection and list position
            existingClientHappinessConn.sourcePort = spawnDir;
            existingClientHappinessConn.targetPort = actualTargetPort;
            
            const targetList = curBoard.lists.find(l => l.id === existingClientHappinessConn.target);
            if (targetList) {
                targetList.x = targetX;
                targetList.y = targetY;
            }
            
            showToast("Updated Client Happiness tracker position!");
        } else {
            // Create new
            const newListId = 'list-' + Date.now();
            const newList = {
                id: newListId,
                title: 'Client Happiness',
                cards: [],
                x: targetX,
                y: targetY,
                theme: pendingSourceList.theme || 'default',
                isClientHappiness: true
            };
            
            curBoard.lists.push(newList);
            curBoard.connections.push({
                source: pendingSourceList.id,
                target: newListId,
                sourcePort: spawnDir,
                targetPort: actualTargetPort
            });
            showToast("Created a Client Happiness tracker!");
        }
        
        saveState();
        render();
        
        
        clientHappinessMappingModal.classList.remove('active');
    };
}

const moneySmellingMappingModal = document.getElementById('moneySmellingMappingModal');
const closeMoneySmellingMappingModal = document.getElementById('closeMoneySmellingMappingModal');
const moneySmellingSpawnDirection = document.getElementById('moneySmellingSpawnDirection');
const moneySmellingTargetPort = document.getElementById('moneySmellingTargetPort');
const generateMoneySmellingTrackerBtn = document.getElementById('generateMoneySmellingTrackerBtn');

if (closeMoneySmellingMappingModal) {
    if(closeMoneySmellingMappingModal) closeMoneySmellingMappingModal.onclick = () => moneySmellingMappingModal.classList.remove('active');
}

const newClientsMappingModal = document.getElementById('newClientsMappingModal');
const closeNewClientsMappingModal = document.getElementById('closeNewClientsMappingModal');
const newClientsSpawnDirection = document.getElementById('newClientsSpawnDirection');
const newClientsTargetPort = document.getElementById('newClientsTargetPort');
const generateNewClientsTrackerBtn = document.getElementById('generateNewClientsTrackerBtn');

if (closeNewClientsMappingModal) {
    if(closeNewClientsMappingModal) closeNewClientsMappingModal.onclick = () => newClientsMappingModal.classList.remove('active');
}

if (generateMoneySmellingTrackerBtn) {
    if(generateMoneySmellingTrackerBtn) generateMoneySmellingTrackerBtn.onclick = () => {
        if (!pendingSourceList) return;
        
        const spawnDir = moneySmellingSpawnDirection.value;
        const targetPort = moneySmellingTargetPort.value;
        const curBoard = boards.find(b => b.id === activeBoardId);
        
        let actualTargetPort = targetPort;
        if (actualTargetPort === 'auto') {
            const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            actualTargetPort = opp[spawnDir] || 'left';
        }
        
        let targetX = pendingSourceList.x || 0;
        let targetY = pendingSourceList.y || 80;
        
        if (spawnDir === 'right') targetX += 340;
        else if (spawnDir === 'left') targetX -= 340;
        else if (spawnDir === 'bottom') targetY += 200;
        else if (spawnDir === 'top') targetY -= 200;
        
        if (!curBoard.connections) curBoard.connections = [];
        const existingMoneySmellingConn = curBoard.connections.find(c => 
            c.source === pendingSourceList.id && curBoard.lists.find(l => l.id === c.target && l.isMoneySmelling)
        );
        
        if (existingMoneySmellingConn) {
            // Update existing connection and list position
            existingMoneySmellingConn.sourcePort = spawnDir;
            existingMoneySmellingConn.targetPort = actualTargetPort;
            
            const targetList = curBoard.lists.find(l => l.id === existingMoneySmellingConn.target);
            if (targetList) {
                targetList.x = targetX;
                targetList.y = targetY;
            }
            
            showToast("Updated Money Smelling tracker position!");
        } else {
            // Create new
            const newListId = 'list-' + Date.now();
            const newList = {
                id: newListId,
                title: 'Money Smelling',
                cards: [],
                x: targetX,
                y: targetY,
                theme: pendingSourceList.theme || 'default',
                isMoneySmelling: true
            };
            
            curBoard.lists.push(newList);
            curBoard.connections.push({
                source: pendingSourceList.id,
                target: newListId,
                sourcePort: spawnDir,
                targetPort: actualTargetPort
            });
            showToast("Created a Money Smelling tracker!");
        }
        
        saveState();
        render();
        
        moneySmellingMappingModal.classList.remove('active');
    };
}

if (generateNewClientsTrackerBtn) {
    if(generateNewClientsTrackerBtn) generateNewClientsTrackerBtn.onclick = () => {
        if (!pendingSourceList) return;
        
        const spawnDir = newClientsSpawnDirection.value;
        const targetPort = newClientsTargetPort.value;
        const curBoard = boards.find(b => b.id === activeBoardId);
        
        let actualTargetPort = targetPort;
        if (actualTargetPort === 'auto') {
            const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            actualTargetPort = opp[spawnDir] || 'left';
        }
        
        let targetX = pendingSourceList.x || 0;
        let targetY = pendingSourceList.y || 80;
        
        if (spawnDir === 'right') targetX += 340;
        else if (spawnDir === 'left') targetX -= 340;
        else if (spawnDir === 'bottom') targetY += 200;
        else if (spawnDir === 'top') targetY -= 200;
        
        if (!curBoard.connections) curBoard.connections = [];
        const existingNewClientsConn = curBoard.connections.find(c => 
            c.source === pendingSourceList.id && curBoard.lists.find(l => l.id === c.target && l.isNewClients)
        );
        
        if (existingNewClientsConn) {
            // Update existing connection and list position
            existingNewClientsConn.sourcePort = spawnDir;
            existingNewClientsConn.targetPort = actualTargetPort;
            
            const targetList = curBoard.lists.find(l => l.id === existingNewClientsConn.target);
            if (targetList) {
                targetList.x = targetX;
                targetList.y = targetY;
            }
            
            showToast("Updated New Clients tracker position!");
        } else {
            // Create new
            const newListId = 'list-' + Date.now();
            const newList = {
                id: newListId,
                title: 'New Clients',
                cards: [],
                x: targetX,
                y: targetY,
                theme: pendingSourceList.theme || 'default',
                isNewClients: true
            };
            
            curBoard.lists.push(newList);
            curBoard.connections.push({
                source: pendingSourceList.id,
                target: newListId,
                sourcePort: spawnDir,
                targetPort: actualTargetPort
            });
            showToast("Created a New Clients tracker!");
        }
        
        saveState();
        render();
        
        newClientsMappingModal.classList.remove('active');
    };
}

async function openTrelloTasksMappingModal(sourceList) {
    const curBoard = boards.find(b => b.id === activeBoardId);
    if (!trelloKey || !trelloToken || !curBoard) {
        showToast("Enter Trello Key and Token in settings first!");
        return;
    }
    
    pendingSourceList = sourceList;
    const boardSelect = document.getElementById('trelloTasksMappingBoardSelect');
    const listSelect = document.getElementById('trelloTasksMappingListSelect');
    
    try {
        const boardsRes = await fetch(`https://api.trello.com/1/members/me/boards?fields=name,url&key=${trelloKey}&token=${trelloToken}`);
        if(!boardsRes.ok) throw new Error("Failed");
        const tBoards = await boardsRes.json();
        
        if (boardSelect) {
            boardSelect.innerHTML = '<option value="">-- Choose a Board --</option>';
            tBoards.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                boardSelect.appendChild(opt);
            });
            
            boardSelect.onchange = async () => {
                const selectedBoardId = boardSelect.value;
                if (!selectedBoardId) {
                    listSelect.innerHTML = '<option value="">Select a board first...</option>';
                    return;
                }
                
                listSelect.innerHTML = '<option value="">Loading lists...</option>';
                try {
                    const res = await fetch(`https://api.trello.com/1/boards/${selectedBoardId}/lists?key=${trelloKey}&token=${trelloToken}`);
                    if(!res.ok) throw new Error("Failed");
                    const tLists = await res.json();
                    
                    listSelect.innerHTML = '<option value="">-- Choose a List --</option>';
                    tLists.forEach(tl => {
                        const opt = document.createElement('option');
                        opt.value = tl.id;
                        opt.textContent = tl.name;
                        listSelect.appendChild(opt);
                    });
                } catch (err) {
                    listSelect.innerHTML = '<option value="">Failed to load lists</option>';
                    showToast("Failed to fetch Trello lists");
                }
            };
            
            if (tBoards.length > 0) {
                boardSelect.value = tBoards[0].id;
                boardSelect.dispatchEvent(new Event('change'));
            }
        }
        
        trelloTasksMappingModal.classList.add('active');
    } catch (err) {
        showToast("Failed to fetch Trello boards");
    }
}

if (generateTrelloTasksBtn) {
    if(generateTrelloTasksBtn) generateTrelloTasksBtn.onclick = () => {
        const activeBoard = boards.find(b => b.id === activeBoardId);
        const listSelect = document.getElementById('trelloTasksMappingListSelect');
        const boardSelect = document.getElementById('trelloTasksMappingBoardSelect');
        
        if (!listSelect || !listSelect.value) {
            showToast("Please select a Trello list!");
            return;
        }
        
        pendingSourceList.trelloTasksListId = listSelect.value;
        pendingSourceList.trelloTasksBoardId = boardSelect.value;
        pendingSourceList.trelloListId = null; 
        
        trelloTasksMappingModal.classList.remove('active');
        saveState();
        render();
        syncTrello(); // Trigger an immediate sync
    };
}

const pipedriveMappingModal = document.getElementById('pipedriveMappingModal');
const closePipedriveMappingModal = document.getElementById('closePipedriveMappingModal');
const pipedriveTrackerCheckboxes = document.getElementById('pipedriveTrackerCheckboxes');
const pipedriveSpawnDirection = document.getElementById('pipedriveSpawnDirection');
const generatePipedriveTrackersBtn = document.getElementById('generatePipedriveTrackersBtn');
const pipedriveSelectAllBtn = document.getElementById('pipedriveSelectAllBtn');

if (closePipedriveMappingModal) {
    if(closePipedriveMappingModal) closePipedriveMappingModal.onclick = () => pipedriveMappingModal.classList.remove('active');
}

if (pipedriveSelectAllBtn) {
    if(pipedriveSelectAllBtn) pipedriveSelectAllBtn.onclick = () => {
        const cbs = document.querySelectorAll('.pipedrive-tracker-cb');
        const allChecked = Array.from(cbs).every(cb => cb.checked);
        cbs.forEach(cb => cb.checked = !allChecked);
        pipedriveSelectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    };
}

async function openPipedriveMappingGenerator(sourceList) {
    const curBoard = boards.find(b => b.id === activeBoardId);
    if (!pipedriveDomain || !pipedriveToken || !curBoard) {
        showToast("Connect Pipedrive API in settings first!");
        return;
    }
    
    pendingSourceList = sourceList;
    if (pipedriveSelectAllBtn) pipedriveSelectAllBtn.textContent = 'Select All';
    
    const existingConnections = (curBoard.connections || []).filter(c => c.source === sourceList.id);
    const existingTrackers = existingConnections.map(c => curBoard.lists.find(l => l.id === c.target)).filter(Boolean);
    const existingTrackerPipedriveIds = existingTrackers.map(l => l.pipedriveStageId).filter(Boolean);
    
    let preSelectedPipelineId = null;
    let preSelectedSourcePort = 'top';
    let preSelectedTargetPort = 'auto';

    if (existingTrackers.length > 0) {
        if (existingTrackers[0].pipedrivePipelineId) preSelectedPipelineId = existingTrackers[0].pipedrivePipelineId;
        if (existingConnections.length > 0) {
            preSelectedSourcePort = existingConnections[0].sourcePort || 'top';
            
            const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            if (existingConnections[0].targetPort !== opp[preSelectedSourcePort]) {
                preSelectedTargetPort = existingConnections[0].targetPort || 'auto';
            }
        }
    }
    
    pipedriveSpawnDirection.value = preSelectedSourcePort;
    const targetPortSelect = document.getElementById('pipedriveTargetPort');
    if (targetPortSelect) targetPortSelect.value = preSelectedTargetPort;

    const pipelineSelect = document.getElementById('pipedriveMappingPipelineSelect');
    
    try {
        const [resPipelines, resFields] = await Promise.all([
            fetch(`https://${pipedriveDomain}.pipedrive.com/api/v1/pipelines?api_token=${pipedriveToken}`),
            fetch(`https://${pipedriveDomain}.pipedrive.com/api/v1/dealFields?api_token=${pipedriveToken}`)
        ]);
        
        if(!resPipelines.ok) throw new Error("Failed to fetch pipelines");
        const payload = await resPipelines.json();
        const pPipelines = payload.data || [];

        const whatsappSelect = document.getElementById('pipedriveWhatsappFieldSelect');
        const qualSelect = document.getElementById('pipedriveQualificationFieldSelect');
        const noteSelect = document.getElementById('pipedriveNoteFieldSelect');
        if (resFields.ok) {
            const fPayload = await resFields.json();
            const rawFields = fPayload.data || [];
            const customFields = rawFields.filter(f => f.edit_flag === true || f.field_type === 'phone' || f.field_type === 'varchar' || f.field_type === 'text' || f.field_type === 'large text');
            
            if (whatsappSelect) {
                whatsappSelect.innerHTML = '<option value="">-- None (No Icon) --</option>';
            }
            if (qualSelect) {
                qualSelect.innerHTML = '<option value="">-- None --</option>';
            }
            if (noteSelect) {
                noteSelect.innerHTML = '<option value="">-- None --</option>';
            }
            
            customFields.forEach(f => {
                if (whatsappSelect) {
                    const wOpt = document.createElement('option');
                    wOpt.value = f.key;
                    wOpt.textContent = `${f.name} (${f.field_type})`;
                    if (curBoard.pipedriveWhatsappFieldKey === f.key) wOpt.selected = true;
                    whatsappSelect.appendChild(wOpt);
                }
                
                if (qualSelect) {
                    const qOpt = document.createElement('option');
                    qOpt.value = f.key;
                    qOpt.textContent = `${f.name} (${f.field_type})`;
                    if (curBoard.pipedriveQualificationFieldKey === f.key) qOpt.selected = true;
                    qualSelect.appendChild(qOpt);
                }
                
                if (noteSelect) {
                    const nOpt = document.createElement('option');
                    nOpt.value = f.key;
                    nOpt.textContent = `${f.name} (${f.field_type})`;
                    if (curBoard.pipedriveNoteFieldKey === f.key) nOpt.selected = true;
                    noteSelect.appendChild(nOpt);
                }
            });
        }
        
        if (pipelineSelect) {
            pipelineSelect.innerHTML = '<option value="">-- Choose a Pipeline --</option>';
            pPipelines.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                
                if (preSelectedPipelineId) {
                    if (preSelectedPipelineId == p.id) opt.selected = true;
                } else if (curBoard.pipedrivePipelineId == p.id) {
                    opt.selected = true;
                }
                
                pipelineSelect.appendChild(opt);
            });
            
            const fetchStagesForPipeline = async (pipelineId) => {
                pipedriveTrackerCheckboxes.innerHTML = '<div style="padding:10px; font-size:13px; color:#5e6c84;">Loading stages...</div>';
                try {
                    const res = await fetch(`https://${pipedriveDomain}.pipedrive.com/api/v1/stages?pipeline_id=${pipelineId}&api_token=${pipedriveToken}`);
                    if(!res.ok) throw new Error("Failed parameter");
                    const payload = await res.json();
                    const pStages = payload.data || [];
                    
                    pipedriveTrackerCheckboxes.innerHTML = '';
                    pStages.forEach(ps => {
                        const row = document.createElement('label');
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.padding = '10px 12px';
                        row.style.margin = '0 0 6px 0';
                        row.style.borderRadius = '6px';
                        row.style.background = '#ffffff';
                        row.style.border = '1px solid #dfe1e6';
                        row.style.cursor = 'pointer';
                        row.style.transition = 'all 0.2s ease';
                        row.onmouseenter = () => { row.style.boxShadow = '0 2px 4px rgba(9, 30, 66, 0.08)'; row.style.borderColor = 'var(--primary-color)'; };
                        row.onmouseleave = () => { row.style.boxShadow = 'none'; row.style.borderColor = '#dfe1e6'; };

                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.value = ps.id;
                        cb.className = 'pipedrive-tracker-cb';
                        cb.dataset.name = ps.name;
                        cb.style.cursor = 'pointer';
                        cb.style.margin = '0';
                        // Keep ID typing isolated safely with string casting checks
                        cb.checked = existingTrackerPipedriveIds.some(existingId => String(existingId) === String(ps.id));

                        const span = document.createElement('span');
                        span.textContent = ps.name;
                        span.style.marginLeft = '12px';
                        span.style.fontSize = '14px';
                        span.style.color = 'var(--text-color)';
                        span.style.fontWeight = '500';

                        row.appendChild(cb);
                        row.appendChild(span);
                        pipedriveTrackerCheckboxes.appendChild(row);
                    });
                } catch (err) {
                    showToast("Failed to fetch Pipedrive stages");
                    pipedriveTrackerCheckboxes.innerHTML = '';
                }
            };

            pipelineSelect.onchange = () => {
                const selectedPipelineId = pipelineSelect.value;
                if (selectedPipelineId) {
                    fetchStagesForPipeline(selectedPipelineId);
                } else {
                    pipedriveTrackerCheckboxes.innerHTML = '';
                }
            };
            
            if (pipelineSelect.value) {
                fetchStagesForPipeline(pipelineSelect.value);
            } else if (pPipelines.length > 0) {
                pipelineSelect.value = pPipelines[0].id;
                fetchStagesForPipeline(pPipelines[0].id);
            } else {
                pipedriveTrackerCheckboxes.innerHTML = '';
            }
        }
    } catch (err) {
        showToast("Failed to load Pipedrive API data.");
    }
    
    pipedriveMappingModal.classList.add('active');
}

if(generateTrelloTrackersBtn) {
    if(generateTrelloTrackersBtn) generateTrelloTrackersBtn.onclick = () => {
        try {
            const activeBoard = boards.find(b => b.id === activeBoardId);
            const checkedList = Array.from(document.querySelectorAll('.trello-tracker-cb')).filter(cb => cb.checked);
            const checkedTrelloIds = checkedList.map(cb => cb.value);
            
            if (!activeBoard.connections) activeBoard.connections = [];
            
            const existingConnections = activeBoard.connections.filter(c => c.source === pendingSourceList.id);
            const typeMatch = window.pendingTrackerType || 'trello';
            const existingTrackers = existingConnections.map(c => activeBoard.lists.find(l => l.id === c.target)).filter(l => Boolean(l) && (l.trackerType || 'trello') === typeMatch);
            const existingTrackerTrelloIds = existingTrackers.map(l => l.trelloListId).filter(Boolean);
            
            const toAdd = checkedList.filter(cb => !existingTrackerTrelloIds.includes(cb.value));
            const toRemoveIds = existingTrackers.filter(l => l.trelloListId && !checkedTrelloIds.includes(String(l.trelloListId))).map(l => l.id);
            
            if (toRemoveIds.length > 0) {
                activeBoard.lists = activeBoard.lists.filter(l => !toRemoveIds.includes(l.id));
                activeBoard.connections = activeBoard.connections.filter(c => !toRemoveIds.includes(c.source) && !toRemoveIds.includes(c.target));
            }
            
            const direction = trelloSpawnDirection.value;
            const spacing = 340; 
            const oppositePorts = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            
            const boardSelect = document.getElementById('trelloMappingBoardSelect');
            const selectedBoardId = boardSelect ? boardSelect.value : null;

            const targetPortSelect = document.getElementById('trelloTargetPort');
            const targetPortValue = targetPortSelect && targetPortSelect.value !== 'auto' ? targetPortSelect.value : oppositePorts[direction];
            
            toAdd.forEach((inputCb) => {
                const targetTrackerType = window.pendingTrackerType || 'trello';
                const existingGlobalList = activeBoard.lists.find(l => l.trelloListId === inputCb.value && (l.trackerType || 'trello') === targetTrackerType);
                
                let targetListId;
                if (existingGlobalList) {
                    targetListId = existingGlobalList.id;
                } else {
                    targetListId = 'list_' + Date.now() + Math.random().toString(36).substr(2, 5);
                    activeBoard.lists.push({
                        id: targetListId,
                        title: inputCb.dataset.name,
                        x: 0,
                        y: 0,
                        cards: [],
                        trelloListId: inputCb.value,
                        trelloBoardId: selectedBoardId,
                        trackerType: targetTrackerType
                    });
                }
                
                activeBoard.connections.push({
                    source: pendingSourceList.id,
                    target: targetListId,
                    sourcePort: direction,
                    targetPort: targetPortValue
                });
            });
            
            const allActiveTrackers = activeBoard.lists.filter(l => 
                activeBoard.connections.some(c => c.source === pendingSourceList.id && c.target === l.id) &&
                l.trelloListId && 
                checkedTrelloIds.includes(l.trelloListId) &&
                (l.trackerType || 'trello') === typeMatch
            );
            
            if (allActiveTrackers.length > 0) {
                const preExistingCountForThisPort = activeBoard.connections.filter(c => 
                    c.source === pendingSourceList.id && 
                    c.sourcePort === direction &&
                    !allActiveTrackers.some(l => l.id === c.target)
                ).length;

                const typeRowOffset = typeMatch === 'ads' ? (pendingSourceList.adsOffsetY !== undefined ? pendingSourceList.adsOffsetY : 600) : 0;
                
                allActiveTrackers.forEach((list, index) => {
                    let nx = pendingSourceList.x;
                    let ny = pendingSourceList.y + typeRowOffset;
                    
                    const cascadeOffset = (index + preExistingCountForThisPort) * 40;
                    
                    if (direction === 'top') {
                        ny -= (400 + cascadeOffset);
                        nx += cascadeOffset;
                    } else if (direction === 'bottom') {
                        ny += (400 + cascadeOffset);
                        nx += cascadeOffset;
                    } else if (direction === 'left') {
                        nx -= (400 + cascadeOffset);
                        ny += cascadeOffset;
                    } else if (direction === 'right') {
                        nx += (400 + cascadeOffset);
                        ny += cascadeOffset;
                    }
                    
                    list.x = nx;
                    list.y = ny;
                    
                    const conn = activeBoard.connections.find(c => c.source === pendingSourceList.id && c.target === list.id);
                    if (conn) {
                        conn.sourcePort = direction;
                        conn.targetPort = targetPortValue;
                    }
                });
            }
            
            saveState();
            render();
            syncTrello();
            
            trelloMappingModal.classList.remove('active');
        } catch (e) {
            alert("JS Error: " + e.message);
        }
    };
}

if(generatePipedriveTrackersBtn) {
    if(generatePipedriveTrackersBtn) generatePipedriveTrackersBtn.onclick = () => {
        try {
            const activeBoard = boards.find(b => b.id === activeBoardId);
            const checkedList = Array.from(document.querySelectorAll('.pipedrive-tracker-cb')).filter(cb => cb.checked);
            const checkedPipedriveIds = checkedList.map(cb => cb.value);
            
            if (!activeBoard.connections) activeBoard.connections = [];
            
            const existingConnections = activeBoard.connections.filter(c => c.source === pendingSourceList.id);
            const existingTrackers = existingConnections.map(c => activeBoard.lists.find(l => l.id === c.target)).filter(Boolean);
            const existingTrackerPipedriveIds = existingTrackers.map(l => l.pipedriveStageId).filter(Boolean);
            
            const toAdd = checkedList.filter(cb => !existingTrackerPipedriveIds.some(id => String(id) === cb.value));
            const toRemoveIds = existingTrackers.filter(l => l.pipedriveStageId && !checkedPipedriveIds.includes(String(l.pipedriveStageId))).map(l => l.id);
            
            if (toRemoveIds.length > 0) {
                activeBoard.lists = activeBoard.lists.filter(l => !toRemoveIds.includes(l.id));
                activeBoard.connections = activeBoard.connections.filter(c => !toRemoveIds.includes(c.source) && !toRemoveIds.includes(c.target));
            }
            
            const direction = pipedriveSpawnDirection.value;
            const spacing = 340; 
            const oppositePorts = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
            
            const pipelineSelect = document.getElementById('pipedriveMappingPipelineSelect');
            const selectedPipelineId = pipelineSelect ? pipelineSelect.value : null;

            const whatsappSelect = document.getElementById('pipedriveWhatsappFieldSelect');
            if (whatsappSelect) {
                activeBoard.pipedriveWhatsappFieldKey = whatsappSelect.value;
            }

            const qualSelect = document.getElementById('pipedriveQualificationFieldSelect');
            if (qualSelect) {
                activeBoard.pipedriveQualificationFieldKey = qualSelect.value;
            }
            
            const noteSelect = document.getElementById('pipedriveNoteFieldSelect');
            if (noteSelect) {
                activeBoard.pipedriveNoteFieldKey = noteSelect.value;
            }
            
            if (checkedPipedriveIds.length > 0) {
                activeBoard.pipedriveFirstStageId = String(checkedPipedriveIds[0]);
            }

            const targetPortSelect = document.getElementById('pipedriveTargetPort');
            const targetPortValue = targetPortSelect && targetPortSelect.value !== 'auto' ? targetPortSelect.value : oppositePorts[direction];
            
            toAdd.forEach((inputCb) => {
                const newListId = 'list_' + Date.now() + Math.random().toString(36).substr(2, 5);
                activeBoard.lists.push({
                    id: newListId,
                    title: inputCb.dataset.name,
                    x: 0,
                    y: 0,
                    cards: [],
                    pipedriveStageId: inputCb.value,
                    pipedrivePipelineId: selectedPipelineId
                });
                
                activeBoard.connections.push({
                    source: pendingSourceList.id,
                    target: newListId,
                    sourcePort: direction,
                    targetPort: targetPortValue
                });
            });
            
            const allActiveTrackers = activeBoard.lists.filter(l => 
                activeBoard.connections.some(c => c.source === pendingSourceList.id && c.target === l.id) &&
                l.pipedriveStageId && 
                checkedPipedriveIds.includes(String(l.pipedriveStageId))
            );
            
            if (allActiveTrackers.length > 0) {
                allActiveTrackers.forEach((list, index) => {
                    let nx = pendingSourceList.x;
                    let ny = pendingSourceList.y;
                    
                    const cascadeOffset = index * 40;
                    
                    if (direction === 'top') {
                        ny -= (400 + cascadeOffset);
                        nx += cascadeOffset;
                    } else if (direction === 'bottom') {
                        ny += (400 + cascadeOffset);
                        nx += cascadeOffset;
                    } else if (direction === 'left') {
                        nx -= (400 + cascadeOffset);
                        ny += cascadeOffset;
                    } else if (direction === 'right') {
                        nx += (400 + cascadeOffset);
                        ny += cascadeOffset;
                    }
                    
                    list.x = nx;
                    list.y = ny;
                    
                    const conn = activeBoard.connections.find(c => c.source === pendingSourceList.id && c.target === list.id);
                    if (conn) {
                        conn.sourcePort = direction;
                        conn.targetPort = targetPortValue;
                    }
                });
            }
            
            saveState();
            render();
            syncPipedrive(); // We will write this shortly!
            
            pipedriveMappingModal.classList.remove('active');
        } catch (e) {
            alert("JS Error: " + e.message);
        }
    };
}

if (localStorage.getItem('nav_position') === 'right') topNavBar.classList.add('pos-right');
if(toggleNavPosBtn) toggleNavPosBtn.onclick = () => {
    topNavBar.classList.toggle('pos-right');
    localStorage.setItem('nav_position', topNavBar.classList.contains('pos-right') ? 'right' : 'center');
};

const navItems = document.querySelectorAll('.nav-item');
if (navItems.length >= 3) {
    // Planner button
    navItems[1].onclick = () => {
        const smBoard = boards.find(b => b.type === 'social_scheduler');
        if (smBoard) {
            activeBoardId = smBoard.id;
            saveState();
            render();
        } else {
            const openAddBtn = document.getElementById('openAddSocialBoardBtn');
            if (openAddBtn) openAddBtn.click();
        }
    };
    // Board button
    navItems[2].onclick = () => {
        const kBoard = boards.find(b => b.type === 'kanban' || b.type === 'timer');
        if (kBoard) {
            activeBoardId = kBoard.id;
            saveState();
            render();
        }
    };
}

const clockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const stopwatchIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><polyline points="12 9 12 13 14 15"></polyline><line x1="12" y1="2" x2="12" y2="4"></line><line x1="8" y1="2" x2="16" y2="2"></line></svg>`;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// Global functions
window.deleteBoard = function(boardId) {
    if (confirm("Are you sure you want to delete this entire workspace? All accounts and lists inside it will be lost!")) {
        boards = boards.filter(b => b.id !== boardId);
        if (boards.length > 0) activeBoardId = boards[0].id;
        else {
            boards = [{ id: 'board-' + Date.now(), title: 'Account', type: 'timer', cards: [] }];
            activeBoardId = boards[0].id;
        }
        saveState();
        render();
        showToast("Workspace deleted");
    }
};

window.switchBoard = function(boardId) {
    activeBoardId = boardId;
    localStorage.setItem('ai_active_board', activeBoardId);
    saveState();
    render();
    switchBoardModal.classList.remove('active');
};

// Switch Boards Flow
if(openSwitchBoardsBtn) openSwitchBoardsBtn.onclick = () => {
    boardListMenu.innerHTML = '';
    boards.filter(b => b.type !== 'social_scheduler').forEach(b => {
        const item = document.createElement('div');
        item.className = 'board-menu-item' + (b.id === activeBoardId ? ' active' : '');
        
        let countText = b.type === 'kanban' ? `${b.lists.length} lists` : `${b.cards.length} accounts`;
        let tagColor = b.type === 'kanban' ? '#a855f7' : '#0c66e4';
        let bgTagColor = b.type === 'kanban' ? '#f3e8ff' : '#eff6ff';
        
        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = b.title;
        titleSpan.className = 'editable-board-title';
        titleSpan.style.margin = '0 6px 0 0';
        titleSpan.style.cursor = 'text';
        titleSpan.title = 'Click to rename';
        
        if(titleSpan) titleSpan.onclick = (e) => {
            e.stopPropagation();
            titleSpan.contentEditable = 'true';
            titleSpan.classList.add('editing');
            titleSpan.focus();
            
            if (document.caretRangeFromPoint) {
                const caret = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (caret) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(caret);
                }
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) {
                    const sel = window.getSelection();
                    sel.collapse(pos.offsetNode, pos.offset);
                }
            }
        };
        
        titleSpan.onblur = () => {
            titleSpan.contentEditable = 'false';
            titleSpan.classList.remove('editing');
            const newTitle = titleSpan.textContent.trim();
            if (newTitle && newTitle !== b.title) {
                b.title = newTitle;
                saveState();
                render();
            } else {
                titleSpan.textContent = b.title;
            }
        };
        
        titleSpan.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleSpan.blur();
            }
        };

        leftWrap.appendChild(titleSpan);

        const rightWrap = document.createElement('div');
        rightWrap.className = 'menu-right-wrap';

        const countSpan = document.createElement('span');
        countSpan.className = 'board-count-text';
        countSpan.textContent = countText;

        const dupBtn = document.createElement('button');
        dupBtn.className = 'icon-btn duplicate-board-btn';
        dupBtn.title = 'Duplicate Workspace';
        dupBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        
        if(dupBtn) dupBtn.onclick = (e) => {
            e.stopPropagation();
            
            if (!confirm("Are you sure you want to duplicate this workspace?")) return;
            if (!confirm("Are you REALLY sure you want to clone the entire application structure?")) return;

            const newBoard = JSON.parse(JSON.stringify(b));
            newBoard.id = 'board-' + Date.now();
            newBoard.title = b.title + ' Copy';
            
            if (newBoard.type === 'kanban') {
                newBoard.lists.forEach(l => {
                    l.id = 'list-' + Math.random().toString(36).substr(2, 9);
                    l.cards.forEach(c => {
                        c.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    });
                });
            } else {
                newBoard.cards.forEach(c => {
                    c.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                });
            }
            
            boards.push(newBoard);
            activeBoardId = newBoard.id;
            saveState();
            render();
            switchBoardModal.classList.remove('active');
            showToast("Workspace duplicated!");
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn delete-board-btn';
        deleteBtn.title = 'Delete Workspace';
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        
        if(deleteBtn) deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.promptSecureDelete === 'function') {
                window.promptSecureDelete(b.id, b.title || 'هذه المساحة');
            }
        };

        rightWrap.appendChild(countSpan);
        rightWrap.appendChild(dupBtn);
        if (boards.length > 1) {
            rightWrap.appendChild(deleteBtn);
        }

        item.appendChild(leftWrap);
        item.appendChild(rightWrap);

        if(item) item.onclick = () => switchBoard(b.id);
        boardListMenu.appendChild(item);
    });
    
    // Append single unified Social Media App button if clients exist
    const socialBoards = boards.filter(b => b.type === 'social_scheduler');
    if (socialBoards.length > 0) {
        const item = document.createElement('div');
        const isActive = socialBoards.some(b => b.id === activeBoardId);
        item.className = 'board-menu-item' + (isActive ? ' active' : '');
        
        item.innerHTML = `
            <div style="display:flex; align-items:center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                <span style="font-weight: 700; color: #1a202c;">Social Media App</span>
            </div>
            <div class="menu-right-wrap">
                <span class="board-count-text">${socialBoards.length} clients</span>
            </div>
        `;
        
        if(item) item.onclick = () => switchBoard(socialBoards[0].id);
        item.style.borderTop = '1px dashed #e2e8f0';
        item.style.marginTop = '4px';
        
        boardListMenu.appendChild(item);
    }

    switchBoardModal.classList.add('active');
};
if(closeSwitchBoardModal) closeSwitchBoardModal.onclick = () => switchBoardModal.classList.remove('active');

const exportBackupBtn = document.getElementById('exportBackupBtn');
if (exportBackupBtn) {
    if(exportBackupBtn) exportBackupBtn.onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(boards, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "workspace_backup_" + new Date().toISOString().split('T')[0] + ".json");
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
        showToast("Backup exported successfully!");
    };
}

const importBackupFile = document.getElementById('importBackupFile');
if (importBackupFile) {
    importBackupFile.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!confirm("Are you sure you want to import this workspace? This will OVERWRITE your current data!")) {
            importBackupFile.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    boards = importedData;
                    if (boards.length > 0) activeBoardId = boards[0].id;
                    saveState();
                    render();
                    showToast("Workspace imported successfully!");
                    switchBoardModal.classList.remove('active');
                } else {
                    alert("Invalid backup file: Please provide a valid workspace backup.");
                }
            } catch (err) {
                alert("Failed to read backup file. It might be corrupted.");
            }
        };
        reader.readAsText(file);
        importBackupFile.value = ''; // Reset to allow importing the same file again
    };
}

if (openAddTimerBoardBtn) {
    if(openAddTimerBoardBtn) openAddTimerBoardBtn.onclick = () => {
        switchBoardModal.classList.remove('active');
        newBoardTitle.value = '';
        pendingNewBoardType = 'timer';
        document.querySelector('#addBoardModal h3').textContent = 'Create Timer App';
        addBoardModal.classList.add('active');
        setTimeout(() => newBoardTitle.focus(), 50);
    };
}
if (openAddKanbanBoardBtn) {
    if(openAddKanbanBoardBtn) openAddKanbanBoardBtn.onclick = () => {
        switchBoardModal.classList.remove('active');
        newBoardTitle.value = '';
        pendingNewBoardType = 'kanban';
        document.querySelector('#addBoardModal h3').textContent = 'Create Kanban App';
        addBoardModal.classList.add('active');
        setTimeout(() => newBoardTitle.focus(), 50);
    };
}
if (openAddSocialBoardBtn) {
    if(openAddSocialBoardBtn) openAddSocialBoardBtn.onclick = () => {
        switchBoardModal.classList.remove('active');
        const smCount = boards.filter(b => b.type === 'social_scheduler').length;
        newBoardTitle.value = 'Client ' + (smCount + 1);
        pendingNewBoardType = 'social_scheduler';
        document.querySelector('#addBoardModal h3').textContent = 'Create Social Media Scheduler';
        addBoardModal.classList.add('active');
        setTimeout(() => newBoardTitle.focus(), 50);
    };
}
if(closeAddBoardModal) closeAddBoardModal.onclick = () => addBoardModal.classList.remove('active');
if(confirmAddBoardBtn) confirmAddBoardBtn.onclick = () => {
    const title = newBoardTitle.value.trim();
    if (title) {
        newBoardTitle.blur();
        const newBoard = { id: 'board-' + Date.now(), title: title, type: pendingNewBoardType };
        if (pendingNewBoardType === 'kanban') newBoard.lists = [];
        else newBoard.cards = [];
        
        boards.push(newBoard);
        activeBoardId = newBoard.id;
        saveState();
        render();
        addBoardModal.classList.remove('active');
        showToast("Workspace created!");
    }
};
newBoardTitle.onkeydown = (e) => { if (e.key === 'Enter') confirmAddBoardBtn.click(); };

function render() {
    if (window.isResolvingShortLink) return;
    if (!window.agencyAuthPassed) return;
    if (isGlobalDragging) return;
    const activeEl = document.activeElement;
    if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || activeEl.isContentEditable) {
            return;
        }
    }

    const openMenus = document.querySelectorAll('.list-options-menu');
    for (let i = 0; i < openMenus.length; i++) {
        if (openMenus[i].style.display === 'block') {
            return;
        }
    }

    window.listScrolls = window.listScrolls || {};
    window.lastDOMPositions = {};
    document.querySelectorAll('.kanban-list').forEach(listEl => {
        const id = listEl.dataset.id;
        if (id) {
            const cardList = listEl.querySelector('.card-list');
            if (cardList) window.listScrolls[id] = cardList.scrollTop;
            window.lastDOMPositions[id] = { left: listEl.style.left, top: listEl.style.top };
        }
    });

    appContainer.innerHTML = '';
    let activeBoard = boards.find(b => b.id === activeBoardId);
    
    // STRICT RULE: If we are in client view (resolving a direct link) and we haven't synced with firebase yet, 
    // we must NEVER fallback to the first board (which would corrupt local state for this client).
    // The board will safely appear in the subsequent firebase sync call within ms.
    if (!activeBoard && window.isClientView) {
        appContainer.innerHTML = `
            <div style="display:flex; height:100vh; background:#f4f5f7; align-items:center; justify-content:center; color:#475569; font-weight:700; font-family:sans-serif; flex-direction:column; gap:20px;">
                <div class="sm-spinner" style="width:48px; height:48px; border:4px solid #cbd5e1; border-top-color:#ea580c; border-radius:50%; animation:spin 1s linear infinite;"></div>
                <div style="font-size: 18px;">جاري تهيئة ومزامنة مساحة العميل...</div>
                <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            </div>`;
        return;
    }

    const socialBoardsGlobal = boards.filter(b => b.type === 'social_scheduler');
    const isAgencyBoard = activeBoard && socialBoardsGlobal.length > 2 && (activeBoard.id === socialBoardsGlobal[0].id || activeBoard.id === socialBoardsGlobal[1].id);

    if (!activeBoard || isAgencyBoard) {
        if (socialBoardsGlobal.length > 2) {
            activeBoardId = socialBoardsGlobal[2].id;
            activeBoard = socialBoardsGlobal[2];
            localStorage.setItem('ai_active_board', activeBoardId);
        } else if (boards.length > 0) {
            activeBoardId = boards[0].id;
            activeBoard = boards[0];
            localStorage.setItem('ai_active_board', activeBoardId);
        } else {
            return;
        }
    }
    if (!window.isClientView) {
        document.title = `Social Media Manager`;
    }

    appContainer.classList.remove('managing-view');
    appContainer.classList.add('social-scheduler-view');
    renderSocialSchedulerApp(activeBoard);
    
    // Clear global animation flags after render sequence wraps
    window.isFilterFadingIn = false;
}

window.toggleSentimentFilter = function(listId, type, color) {
    if (typeof boards === 'undefined' || typeof activeBoardId === 'undefined') return;
    const activeBoard = boards.find(b => b.id === activeBoardId);
    if (!activeBoard) return;

    if (!activeBoard.sentimentFilters) activeBoard.sentimentFilters = {};
    const key = `${listId}_${type}`;
    if (color === null || activeBoard.sentimentFilters[key] === color) {
        delete activeBoard.sentimentFilters[key];
    } else {
        activeBoard.sentimentFilters[key] = color;
    }
    
    // Animate transition and instantly update state
    window.isFilterFadingIn = true;
    
    const targetedList = activeBoard.lists.find(l => l.id === listId);
    if (targetedList && targetedList.collapsedEdges) {
        // Automatically un-collapse any pipeline edges (the Gold Boxes) hiding downstream lists of this filter type
        targetedList.collapsedEdges = targetedList.collapsedEdges.filter(edgeStr => !edgeStr.endsWith(`:${type}`));
    }
    
    saveState();
    updateAllTrackersSummaries(activeBoard);
    render();
    
    // Ensure connecting svg leader lines flow properly over the newly hidden layout DOM objects 
    if (typeof updateConnections === 'function') {
        setTimeout(updateConnections, 50);
        setTimeout(updateConnections, 360);
    }
};

function updateAllTrackersSummaries(activeBoard) {
    if (!activeBoard || !activeBoard.lists) return;
    activeBoard.lists.forEach(list => {
        const hasOutgoing = activeBoard.connections && activeBoard.connections.some(c => c.source === list.id);
        const isAdsTracker = list.trackerType === 'ads';
        const isTrelloTracker = (list.trelloListId || list.trelloTasksListId || list.trelloBoardId) && list.trackerType !== 'ads' && !list.isClientHappiness && !list.isMoneySmelling;

        if (hasOutgoing || isAdsTracker || isTrelloTracker) {
            let allDescendants = new Set();
            const getSubs = (sId) => {
                activeBoard.connections.forEach(c => {
                    if(c.source === sId && !allDescendants.has(c.target)){
                        allDescendants.add(c.target);
                        getSubs(c.target);
                    }
                });
            };
            getSubs(list.id);

            // Always tracking its own cards if it's explicitly designated as a tracker
            if (isAdsTracker || isTrelloTracker) {
                allDescendants.add(list.id);
            }

            if (allDescendants.size > 0) {
                const summaryEl = document.querySelector(`.kanban-list[data-id="${list.id}"] .downstream-trackers-summary`);
                if (!summaryEl) return;
                
                let pdLeafNodes = Array.from(allDescendants).filter(tid => {
                    const l = activeBoard.lists.find(ll => ll.id === tid);
                    const isLeaf = !activeBoard.connections.some(c => c.source === tid);
                    const isDirectChild = activeBoard.connections.some(c => c.source === list.id && c.target === tid);
                    return l && l.pipedriveStageId && isLeaf && isDirectChild;
                });
                
                if (pdLeafNodes.length > 0) {
                    const lastPipeId = pdLeafNodes[pdLeafNodes.length - 1];
                    let greenCount = 0; let redCount = 0; let normalCount = 0;
                    
                    const l = activeBoard.lists.find(ll => ll.id === lastPipeId);
                    if (l && l.cards) {
                        l.cards.forEach(c => {
                            if (c.isPipedrive) {
                                if (c.color === 'green') greenCount++;
                                else if (c.color === 'red') redCount++;
                                else normalCount++;
                            }
                        });
                    }
                    
                    let htmlStr = '';
                    if (redCount > 0) htmlStr += `<div style="display:flex; align-items:center; background:rgba(201,55,44,0.15); color:#c9372c; padding:4px 8px; border-radius:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap:4px;">🔥 ${redCount}</div>`;
                    if (greenCount > 0) htmlStr += `<div style="display:flex; align-items:center; background:rgba(34,160,107,0.15); color:#1f845a; padding:4px 8px; border-radius:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap:4px;">✅ ${greenCount}</div>`;
                    if (normalCount > 0) htmlStr += `<div style="display:flex; align-items:center; background:rgba(9,30,66,0.06); color:#5E6C84; padding:4px 8px; border-radius:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap:4px;">⚪ ${normalCount}</div>`;
                    
                    if (!htmlStr) htmlStr = `<div style="display:flex; align-items:center; background:rgba(9,30,66,0.06); color:#5E6C84; padding:4px 8px; border-radius:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap:4px;">⚪ 0</div>`;
                    const pdLogo = `<div draggable="true" ondragstart="event.dataTransfer.setData('application/x-transfer-pd', '${list.id}'); event.dataTransfer.effectAllowed='move';" style="display:inline-flex; align-items:center; justify-content:center; background:#2a2f35; color:#fff; width:24px; height:24px; border-radius:6px; font-weight:800; font-size:14px; font-family:system-ui,-apple-system,sans-serif; margin-bottom:4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); cursor:grab;" title="Drag to transfer Pipedrive Integration">P</div>`;
                    summaryEl.innerHTML = `<div style="display:flex; flex-direction:column; gap:4px; font-size: 12px; font-weight: 600;">${pdLogo}<div style="display:flex; align-items:center; gap: 8px;">${htmlStr}</div></div>`;
                } else if (list.trackerType === 'ads' || list.trelloListId || list.trelloTasksListId) {
                    let hasTrello = false;
                    let hasAds = false;
                    let hasCH = false;
                    let hasMS = false;
                    let hasNC = false;
                    let tCards = 0; let tCol = { green: 0, yellow: 0, orange: 0, red: 0, default: 0 };
                    let aCards = 0; let aCol = { green: 0, yellow: 0, orange: 0, red: 0, default: 0 };
                    let chCol = { green: 0, yellow: 0, orange: 0, red: 0, default: 0 };
                    let msCol = { green: 0, yellow: 0, orange: 0, red: 0, default: 0 };
                    let ncCol = { green: 0, yellow: 0, orange: 0, red: 0, default: 0 };
                    
                    allDescendants.forEach(tid => {
                        const tList = activeBoard.lists.find(l => l.id === tid);
                        if (tList && tList.cards) {
                            const isAds = tList.trackerType === 'ads';
                            const isCH = tList.isClientHappiness;
                            const isMS = tList.isMoneySmelling;
                            const isNC = tList.isNewClients;
                            
                            if (isAds) hasAds = true;
                            else if (isCH) hasCH = true;
                            else if (isMS) hasMS = true;
                            else if (isNC) hasNC = true;
                            else hasTrello = true;
                            
                            tList.cards.forEach(c => {
                                if (c.id && (c.id.length === 24 || String(c.id).startsWith('pd_'))) {
                                    const col = (activeBoard.cardColors && activeBoard.cardColors[c.id]) ? activeBoard.cardColors[c.id] : 'default';
                                    if (isAds) {
                                        aCards++; aCol[col]++;
                                    } else {
                                        tCards++;
                                        if (isCH) chCol[col]++;
                                        else if (isMS) msCol[col]++;
                                        else if (isNC) ncCol[col]++;
                                        else tCol[col]++;
                                    }
                                }
                            });
                        }
                    });

                    const buildTally = (counts, pId, type) => {
                        let h = '';
                        const getStyle = (color) => {
                            const key = `${pId}_${type}`;
                            const isActive = activeBoard.sentimentFilters && activeBoard.sentimentFilters[key] === color;
                            return isActive ? 'box-shadow: 0 0 0 2px currentColor; cursor:pointer;' : 'cursor:pointer; opacity:0.85;';
                        };
                        const getClick = (color) => `data-clicker="true" data-pid="${pId}" data-ptype="${type}" data-pcolor="${color}"`;

                        const isMoneyOrNc = type === 'moneySmelling' || type === 'newClients';
                        const svgs = {
                            green: isMoneyOrNc ? '<span style="font-size:14px;line-height:1;margin-top:1px;">🔥</span>' : '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#43A047"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><path d="M8 15 Q12 19 16 15" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>',
                            yellow: isMoneyOrNc ? '<span style="font-size:14px;line-height:1;margin-top:1px;">☀️</span>' : '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FDD835"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><line x1="8" y1="15" x2="16" y2="15" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>',
                            orange: isMoneyOrNc ? '<span style="font-size:14px;line-height:1;margin-top:1px;">⛅</span>' : '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF9800"/><circle cx="8" cy="10" r="1.5" fill="#212121"/><circle cx="16" cy="10" r="1.5" fill="#212121"/><path d="M8 17 Q12 13 16 17" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>',
                            red: isMoneyOrNc ? '<span style="font-size:14px;line-height:1;margin-top:1px;">❄️</span>' : '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#E53935"/><circle cx="8" cy="11" r="1.5" fill="#212121"/><circle cx="16" cy="11" r="1.5" fill="#212121"/><line x1="6" y1="8" x2="10" y2="10" stroke="#212121" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="8" x2="14" y2="10" stroke="#212121" stroke-width="2" stroke-linecap="round"/><path d="M8 17 Q12 13 16 17" fill="none" stroke="#212121" stroke-width="2" stroke-linecap="round"/></svg>',
                            default: '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#8c9bab" stroke-width="2.5"/></svg>'
                        };

                        if (counts.green > 0) h += `<div ${getClick('green')} style="display:flex;align-items:center;background:rgba(34,160,107,0.15);color:#1f845a;padding:2px 6px;border-radius:4px;gap:4px;${getStyle('green')}"><span style="display:flex;">${svgs.green}</span>${counts.green}</div>`;
                        if (counts.yellow > 0) h += `<div ${getClick('yellow')} style="display:flex;align-items:center;background:rgba(245,205,71,0.2);color:#b38600;padding:2px 6px;border-radius:4px;gap:4px;${getStyle('yellow')}"><span style="display:flex;">${svgs.yellow}</span>${counts.yellow}</div>`;
                        if (counts.orange > 0) h += `<div ${getClick('orange')} style="display:flex;align-items:center;background:rgba(255,152,0,0.15);color:#e65100;padding:2px 6px;border-radius:4px;gap:4px;${getStyle('orange')}"><span style="display:flex;">${svgs.orange}</span>${counts.orange}</div>`;
                        if (counts.red > 0) h += `<div ${getClick('red')} style="display:flex;align-items:center;background:rgba(201,55,44,0.15);color:#c9372c;padding:2px 6px;border-radius:4px;gap:4px;${getStyle('red')}"><span style="display:flex;">${svgs.red}</span>${counts.red}</div>`;
                        if (counts.default > 0) h += `<div ${getClick('default')} style="display:flex;align-items:center;background:rgba(9,30,66,0.04);color:#6b778c;padding:2px 6px;border-radius:4px;gap:4px;${getStyle('default')}"><span style="display:flex;">${svgs.default}</span>${counts.default}</div>`;
                        return h;
                    };

                    let finalHtml = `<div style="display:flex; flex-direction:column; gap:6px;">`;
                    
                    if (hasTrello || hasCH || hasMS || hasNC || (!hasTrello && !hasAds && !hasCH && !hasMS && !hasNC)) {
                        const tText = tCards === 1 ? '1 Card' : `${tCards} Cards`;
                        finalHtml += `
                            <div style="display:flex; align-items:center; gap: 8px; font-size: 12px; font-weight: 600;">
                                <div data-clicker="true" data-pid="${list.id}" data-ptype="trello" data-pcolor="null" style="display:flex; align-items:center; gap: 4px; background: rgba(12, 102, 228, 0.08); color: #0c66e4; padding: 4px 10px; border-radius: 6px; cursor:pointer;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.8"><circle cx="10" cy="10" r="9.5"></circle><line x1="16.7" y1="16.7" x2="22.5" y2="22.5"></line></g><g transform="translate(10, 10) scale(0.65) translate(-12, -12)" stroke-width="2.77"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></g></svg>
                                    <span>${tText}</span>
                                </div>
                                ${hasCH && buildTally(chCol, list.id, 'clientHappiness') !== '' ? `<div style="display:flex; gap:6px;">${buildTally(chCol, list.id, 'clientHappiness')}</div>` : ''}
                                ${hasMS && buildTally(msCol, list.id, 'moneySmelling') !== '' ? `<div style="display:flex; gap:6px;">${buildTally(msCol, list.id, 'moneySmelling')}</div>` : ''}
                                ${hasNC && buildTally(ncCol, list.id, 'newClients') !== '' ? `<div style="display:flex; gap:6px;">${buildTally(ncCol, list.id, 'newClients')}</div>` : ''}
                                ${hasTrello && buildTally(tCol, list.id, 'trello') !== '' ? `<div style="display:flex; gap:6px;">${buildTally(tCol, list.id, 'trello')}</div>` : ''}
                            </div>
                        `;
                    }
                    
                    if (hasAds) {
                        const aText = aCards === 1 ? '1 Ad' : `${aCards} Ads`;
                        finalHtml += `
                            <div style="display:flex; align-items:center; gap: 8px; font-size: 12px; font-weight: 600;">
                                <div data-clicker="true" data-pid="${list.id}" data-ptype="ads" data-pcolor="null" style="display:flex; align-items:center; gap: 4px; background: rgba(0, 188, 212, 0.15); color: #00838F; padding: 4px 10px; border-radius: 6px; cursor:pointer;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                                    <span>${aText}</span>
                                </div>
                                ${buildTally(aCol, list.id, 'ads') !== '' ? `<div style="display:flex; gap:6px;">${buildTally(aCol, list.id, 'ads')}</div>` : ''}
                            </div>
                        `;
                    }
                    
                    finalHtml += `</div>`;

                    const summaryEl = document.querySelector(`.kanban-list[data-id="${list.id}"] .downstream-trackers-summary`);
                    if (summaryEl) {
                        summaryEl.innerHTML = finalHtml;
                        
                        summaryEl.querySelectorAll('[data-clicker="true"]').forEach(el => {
                            if(el) el.onclick = () => {
                                if (typeof window.toggleSentimentFilter === 'function') {
                                    window.toggleSentimentFilter(el.dataset.pid, el.dataset.ptype, el.dataset.pcolor === 'null' ? null : el.dataset.pcolor);
                                }
                            };
                        });
                    }
                }
            }
        }
    });
}

let animatingOutIds = new Set();
let animatingOrigins = {};
window.generatePipelineHtml = function(board) {
    if (!board.pipeline) {
        board.pipeline = {
            stages: ["المرحلة 1", "المرحلة 2", "المرحلة 3"],
            activeStageIndex: 0,
            stageEntries: {
                "0": Date.now()
            }
        };
        saveState();
    }

    const pl = board.pipeline;
    const stages = pl.stages || [];
    const activeIndex = pl.activeStageIndex || 0;
    const entries = pl.stageEntries || {};

    let html = `<div class="sm-pipeline-wrapper" style="margin: 0 32px 16px 32px; padding: 12px; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; align-items: center;">`;
    
    html += `
        <button class="sm-pipeline-edit-btn" onclick="window.openPipelineEditModal('${board.id}')" title="تعديل المراحل" style="margin-left: 12px; background: transparent; border: none; color: #64748b; cursor: pointer; padding: 8px; border-radius: 6px; outline: none; border: 1px solid #e2e8f0;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
    `;

    html += `<div class="sm-pipeline-container" style="flex: 1; display: flex; gap: 4px; overflow: hidden; border-radius: 6px;">`;

    stages.forEach((stage, index) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;
        let className = "sm-pipeline-stage";
        if (isActive) className += " active";
        else if (isPast) className += " past";

        let timeStr = "";
        if (entries[index]) {
            const entryTime = entries[index];
            const endTime = (index < activeIndex && entries[index + 1]) ? entries[index + 1] : Date.now();
            const daysSpent = Math.floor((endTime - entryTime) / (1000 * 60 * 60 * 24));
            if (daysSpent >= 0) {
                timeStr = ` <span style="font-size: 11px; opacity: 0.8; margin-right: 6px; font-weight: normal;">(${daysSpent}d)</span>`;
            }
        }

        html += `
            <div class="${className}" onclick="window.changePipelineStage('${board.id}', ${index})" title="انتقال إلى ${stage}">
                ${stage}${timeStr}
            </div>
        `;
    });

    html += `</div>`; 
    html += `</div>`;
    return html;
};

window.changePipelineStage = function(boardId, index) {
    console.log("changePipelineStage clicked!", boardId, index);
    
    let board = null;
    if (window.boards) {
        board = window.boards.find(b => String(b.id) === String(boardId)) || 
                window.boards.find(b => String(b.id) === String(window.activeBoardId));
    }
    if (!board && typeof window.activeBoard !== 'undefined') {
        board = window.activeBoard;
    }

    if (!board || !board.pipeline) return;

    board.pipeline.activeStageIndex = index;
    if (!board.pipeline.stageEntries) board.pipeline.stageEntries = {};
    board.pipeline.stageEntries[index] = Date.now();

    saveState();
    renderSocialSchedulerApp(board);
};

window.openPipelineEditModal = function(boardId) {
    console.log("openPipelineEditModal clicked! boardId:", boardId);
    
    // Attempt multiple ways to find the board
    let board = null;
    if (window.boards) {
        board = window.boards.find(b => String(b.id) === String(boardId)) || 
                window.boards.find(b => String(b.id) === String(window.activeBoardId));
    }
    
    // If we still can't find it and we have a global activeBoard
    if (!board && typeof window.activeBoard !== 'undefined') {
        board = window.activeBoard;
    }
    
    console.log("Found board:", board);

    if (!board) {
        alert("لم يتم العثور على المشروع! Error code: 1. BoardId: " + boardId);
        return;
    }
    if (!board.pipeline) {
        alert("لم يتم العثور على بيانات المراحل! Error code: 2");
        return;
    }

    let stagesHtml = board.pipeline.stages.map((stage, i) => `
        <div class="pipeline-stage-edit-row" data-index="${i}" style="display: flex; gap: 8px; margin-bottom: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; cursor: grab;">
            <div style="display: flex; align-items: center; color: #94a3b8; cursor: grab;" class="drag-handle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
            <input type="text" value="${stage}" class="pipeline-stage-input" style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;">
            <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer;">X</button>
        </div>
    `).join('');

    const modalHtml = `
        <div class="modal-overlay active" id="pipelineEditModal" style="z-index: 10000; align-items: flex-start; padding-top: 100px;">
            <div class="modal-content" style="max-width: 400px; padding: 24px; border-radius: 12px; background: white; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 18px; color: #0f172a;">تعديل مراحل المشروع</h3>
                <div id="pipelineStagesList" style="max-height: 400px; overflow-y: auto;">
                    ${stagesHtml}
                </div>
                <button onclick="window.addPipelineStageRow()" style="width: 100%; padding: 10px; background: #f1f5f9; border: 1px dashed #cbd5e1; color: #64748b; border-radius: 6px; margin-bottom: 16px; cursor: pointer; font-weight: 600; outline: none; margin-top: 8px;">+ إضافة مرحلة جديدة</button>
                
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;">
                    <button onclick="document.getElementById('pipelineEditModal').remove()" style="padding: 10px 16px; background: transparent; border: none; color: #64748b; cursor: pointer; font-weight: 600; outline: none;">إلغاء</button>
                    <button onclick="window.savePipelineStages('${boardId}')" style="padding: 10px 16px; background: #ea580c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; outline: none;">حفظ المراحل</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Initialize Sortable for drag and drop
    if (typeof Sortable !== 'undefined') {
        new Sortable(document.getElementById('pipelineStagesList'), {
            handle: '.drag-handle',
            animation: 150
        });
    }
};

window.addPipelineStageRow = function() {
    const html = `
        <div class="pipeline-stage-edit-row" style="display: flex; gap: 8px; margin-bottom: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; cursor: grab;">
            <div style="display: flex; align-items: center; color: #94a3b8; cursor: grab;" class="drag-handle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
            <input type="text" placeholder="اسم المرحلة" class="pipeline-stage-input" style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;">
            <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer;">X</button>
        </div>
    `;
    document.getElementById('pipelineStagesList').insertAdjacentHTML('beforeend', html);
};

window.savePipelineStages = function(boardId) {
    const board = (window.boards || []).find(b => String(b.id) === String(boardId)) || window.activeBoard || null;
    if (!board) return;

    const inputs = document.querySelectorAll('#pipelineEditModal .pipeline-stage-input');
    const newStages = Array.from(inputs).map(inp => inp.value.trim()).filter(v => v);

    if (newStages.length === 0) {
        alert("يجب إضافة مرحلة واحدة على الأقل.");
        return;
    }

    if (!board.pipeline) board.pipeline = {};
    board.pipeline.stages = newStages;
    
    if (board.pipeline.activeStageIndex >= newStages.length) {
        board.pipeline.activeStageIndex = newStages.length - 1;
    }

    saveState();
    document.getElementById('pipelineEditModal').remove();
    renderSocialSchedulerApp(board);
};

function renderSocialSchedulerApp(activeBoard) {
    document.body.style.background = '#f4f5f7';
    appContainer.style.padding = '0';
    appContainer.style.margin = '0';
    appContainer.style.maxWidth = 'none';

    const today = new Date();
    
    // Initialize global viewing month if it doesn't exist
    if (!window.activeSocialMonthView) {
        const urlMonth = window.shortClientMonth !== null ? window.shortClientMonth : smUrlParams.get('month');
        const urlYear = window.shortClientYear !== null ? window.shortClientYear : smUrlParams.get('year');
        if (urlMonth && urlYear) {
            window.activeSocialMonthView = { year: parseInt(urlYear, 10), month: parseInt(urlMonth, 10) };
        } else {
            window.activeSocialMonthView = { year: today.getFullYear(), month: today.getMonth() };
        }
    }
    
    const currentYear = window.activeSocialMonthView.year;
    const currentMonth = window.activeSocialMonthView.month;
    
    if (!window.activeSocialDateOptions) {
        const urlMonth = window.shortClientMonth !== null ? window.shortClientMonth : smUrlParams.get('month');
        const urlYear = window.shortClientYear !== null ? window.shortClientYear : smUrlParams.get('year');
        if (urlMonth && urlYear) {
            window.activeSocialDateOptions = { year: parseInt(urlYear, 10), month: parseInt(urlMonth, 10), date: 1 };
        } else {
            window.activeSocialDateOptions = { year: today.getFullYear(), month: today.getMonth(), date: today.getDate() };
        }
    }
    const defaultSelectedDate = new Date(window.activeSocialDateOptions.year, window.activeSocialDateOptions.month, window.activeSocialDateOptions.date);
    
    const monthNamesArabic = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const dayNamesArabic = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    if (window.isClientView && activeBoard) {
        document.title = `${monthNamesArabic[currentMonth]} ${currentYear} - ${activeBoard.title}`;
    }
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let calendarHtml = '';
    let dayCounter = 1;

    for (let i = 0; i < 6; i++) {
        let rowHtml = '<div class="sm-cal-row">';
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDay) {
                rowHtml += '<div class="sm-cal-cell empty"></div>';
            } else if (dayCounter > daysInMonth) {
                rowHtml += '<div class="sm-cal-cell empty"></div>';
            } else {
                const isToday = dayCounter === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                const isSelected = window.activeSocialDateOptions 
                    && window.activeSocialDateOptions.date === dayCounter
                    && window.activeSocialDateOptions.month === currentMonth
                    && window.activeSocialDateOptions.year === currentYear;
                
                const dayPosts = (activeBoard.cards || []).filter(c => c.dateStr === `${currentYear}-${currentMonth}-${dayCounter}` && (window.smShowClientEditsToggle !== false || !c.isClientDayNote));
                const postThumbnailsHtml = dayPosts.slice(0, 5).map((p, idx) => {
                    const safeFullText = p.fullText ? window.smEscapeHTML(p.fullText) : '';
                    const safeDesc = p.description ? window.smEscapeHTML(p.description) : '';
                    const textSnippetRaw = p.fullText ? p.fullText.substring(0, 25) + '...' : (p.description ? p.description.substring(0, 25) + '...' : 'مسودة منشور...');
                    const textSnippet = window.smEscapeHTML(textSnippetRaw);
                    const items = p.mediaItems || (p.mediaObj ? [p.mediaObj] : []);
                    
                    const defaultIcon = p.postType === 'video' ? '▶️' : '🖼️';
                    let mediaThumb = `<div style="font-size:12px; margin-left:6px; flex-shrink:0;">${defaultIcon}</div>`;
                    if (items.length > 0) {
                        const m = items[0];
                        if (m.dataUrl && (!m.type || m.type === 'image')) {
                            mediaThumb = `<img class="sm-thumb-icon" src="${m.dataUrl}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                        } else if (m.thumbnail) {
                            mediaThumb = `<img class="sm-thumb-icon" src="${m.thumbnail}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                        } else if (m.type === 'frame-io' || m.type === 'video' || (m.dataUrl && m.dataUrl.startsWith('data:video/'))) {
                            mediaThumb = `<div class="sm-thumb-icon" style="width:24px; height:24px; border-radius:4px; background:#1e293b; color:white; display:flex; align-items:center; justify-content:center; margin-left:6px; flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
                        }
                    }
                    
                    let bg = '#ffffff';
                    let border = '1px solid #e2e8f0';
                    let accentColor = '#94a3b8'; // draft gray
                    
                    if (p.status === 'فوري') { bg = '#f0fdf4'; border = '1px solid #bbf7d0'; accentColor = '#22c55e'; }
                    else if (p.status === 'جدولة') { bg = '#fffbeb'; border = '1px solid #fde68a'; accentColor = '#f59e0b'; }
                    
                    if (window.smShowClientEditsToggle !== false && p.clientModified) { bg = '#dcfce7'; border = '1px solid #bbf7d0'; accentColor = '#166534'; }
                    
                    return `
                    <div class="sm-cal-draggable-post" draggable="${!window.isClientView}" ondragstart="if(!window.isClientView) window.handleCalDragStart(event, '${p.id}')" onclick="window.openCreatePostModal('${p.id}');" title="${safeFullText || safeDesc || ''}" style="--dot-color: ${accentColor}; margin-bottom: 4px; padding: 4px 6px; border-radius: 6px; background: ${bg}; border: ${border}; border-right: 3px solid ${accentColor}; font-size: 11px; color: #1e293b; cursor: pointer; user-select: none; -webkit-user-select: none; display: flex; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: box-shadow 0.2s; direction: rtl; flex-wrap: wrap;" onmouseover="this.style.boxShadow='0 3px 6px rgba(0,0,0,0.1)';" onmouseout="this.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';">
                        <div style="display:flex; align-items:center; width: 100%; justify-content: center;">
                            ${mediaThumb}
                            <div class="sm-thumb-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; padding-bottom:1px; flex:1; font-weight:500; pointer-events:none;">${textSnippet}</div>
                        </div>
                        ${(window.smShowClientEditsToggle !== false && p.clientModified) ? `<div class="sm-thumb-edit" style="width:100%; margin-top:4px; padding:4px; background:#bbf7d0; color:#166534; border-radius:4px; font-size:10px; font-weight:700; text-align:right;">تم تعديله من العميل${p.clientEdits ? `<br><span style="font-weight:500;">${window.smEscapeHTML(p.clientEdits)}</span>` : ''}</div>` : ''}
                    </div>`;
                }).join('');
                
                const postBoxContainer = `<div class="sm-cal-dropzone" data-date="${currentYear}-${currentMonth}-${dayCounter}" style="display: flex; flex-direction: column; width: 100%; flex-grow: 1; min-height: 40px; margin-top: 4px; border-radius: 6px;" ondragenter="event.preventDefault();" ondragover="event.preventDefault(); this.style.background='rgba(59, 130, 246, 0.1)';" ondragleave="this.style.background='';" ondrop="window.handleCalDrop(event, this)">${postThumbnailsHtml}</div>`;
                
                const specialAwarenessDays = window.specialAwarenessDays;
                let specialEventHtml = '';
                let hiddenEvents = [];
                try { 
                    hiddenEvents = window.getHiddenSocialEvents(); 
                } catch(e) {}
                
                const dayEvents = specialAwarenessDays.filter(e => e.m === currentMonth && e.d === dayCounter && !hiddenEvents.includes(`${e.m}-${e.d}`));
                if (dayEvents.length > 0) {
                    specialEventHtml = dayEvents.map(eventOpt => {
                        const styleMap = window.eventCategoryMap[eventOpt.category] || { bg: '#ffdce8', text: '#880e4f', dot: '#fb2c71' };
                        return `
                        <div data-special-event="true" style="background: ${styleMap.bg}; color: ${styleMap.text}; display: flex; align-items: flex-start; padding: 5px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; width: fit-content; max-width: 100%; min-height: 26px; box-sizing: border-box; direction: rtl; cursor: help;" title="${eventOpt.name} - ${eventOpt.desc}">
                            <div style="background: ${styleMap.dot}; color: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; margin-left: 6px; flex-shrink: 0; margin-top: 1px;">
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            </div>
                            <span style="white-space: normal; flex: 1; min-width: 0; line-height: 1.35; padding-bottom: 1px;">${eventOpt.name}</span>
                            <div onclick="window.hideSpecialEvent(event, '${eventOpt.m}-${eventOpt.d}')" style="cursor: pointer; margin-right: 6px; border-radius: 50%; opacity: 0.5; display: flex; align-items: center; justify-content: center; padding: 2px; flex-shrink: 0; margin-top: 1px;" onmouseover="this.style.opacity='1'; this.style.background='rgba(0,0,0,0.05)';" onmouseout="this.style.opacity='0.5'; this.style.background='transparent';" title="إخفاء هذه المناسبة">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </div>
                        </div>`;
                    }).join('');
                }

                rowHtml += `
                    <div class="sm-cal-cell ${isSelected ? 'selected' : ''}" style="display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: flex-start; align-items: flex-start; gap: 8px; width: 100%;">
                            <div class="sm-cal-date ${isToday ? 'today' : ''}">${dayCounter}</div>
                            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; padding-top: 2px;">
                                ${specialEventHtml}
                            </div>
                        </div>
                        ${postBoxContainer}
                        ${dayPosts.length > 5 ? `<div style="font-size:10px; color:#3b82f6; font-weight: bold; text-align: center; margin-top:auto; padding-top:4px; cursor:pointer;" onclick="event.stopPropagation(); window.openCreatePostModal('${dayPosts[5].id}');">+${dayPosts.length-5} المزيد من المنشورات</div>` : ''}
                    </div>
                `;
                dayCounter++;
            }
        }
        rowHtml += '</div>';
        calendarHtml += rowHtml;
        if (dayCounter > daysInMonth) break;
    }

    const socialBoards = boards.filter(b => b.type === 'social_scheduler');

    window.openAddClientModal = function() {
        let addModal = document.getElementById('addClientModal');
        if (!addModal) {
            addModal = document.createElement('div');
            addModal.id = 'addClientModal';
            addModal.className = 'modal-overlay';
            addModal.innerHTML = `
                <div class="modal-content" style="max-width: 380px;" dir="rtl">
                    <div class="modal-header">
                        <h3>إضافة عميل جديد</h3>
                        <button class="icon-btn" onclick="document.getElementById('addClientModal').classList.remove('active')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="modal-body" style="padding-top: 12px;">
                        <input type="text" id="addClientInput" class="modal-input" placeholder="اسم العميل (مثال: Client 2)..." style="width: 100%; box-sizing: border-box; border: 1.5px solid #cbd5e0; border-radius: 6px; padding: 10px; font-size: 15px; outline: none; transition: border-color 0.2s;" dir="rtl">
                    </div>
                    <div class="modal-footer" style="padding-top: 16px; margin-top: 16px; border-top: 1px solid #edf2f7; display: flex; justify-content: flex-end; gap: 8px;">
                        <button id="addClientConfirmBtn" style="padding: 8px 16px; border-radius: 6px; border: none; background: #ea580c; color: white; cursor: pointer; font-weight: 600;">إضافة</button>
                        <button onclick="document.getElementById('addClientModal').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: none; background: #edf2f7; color: #4a5568; cursor: pointer; font-weight: 600;">إلغاء</button>
                    </div>
                </div>
            `;
            document.body.appendChild(addModal);
            
            const inputEl = document.getElementById('addClientInput');
            if(inputEl) inputEl.addEventListener('focus', () => inputEl.style.borderColor = '#ea580c');
            if(inputEl) inputEl.addEventListener('blur', () => inputEl.style.borderColor = '#cbd5e0');
            
            inputEl.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    document.getElementById('addClientConfirmBtn').click();
                }
            });
        }
        
        const input = document.getElementById('addClientInput');
        input.value = '';
        
        document.getElementById('addClientConfirmBtn').onclick = () => {
            const title = input.value.trim() || 'Client ' + (boards.filter(b => b.type === 'social_scheduler').length + 1);
            input.blur();
            addModal.classList.remove('active');
            
            const id = 'bb_' + Date.now() + Math.random().toString(36).substr(2, 5);
            boards.push({
                id: id,
                title: title,
                type: 'social_scheduler',
                lists: [],
                cards: []
            });
            activeBoardId = id;
            
            if (typeof saveState === 'function') saveState();
            if (typeof render === 'function') render();
        };
        
        addModal.classList.add('active');
        setTimeout(() => input.focus(), 50);
    };

    // Safe scoped setter for switching clients via UI
    window.switchSocialClient = function(id) {
        activeBoardId = id;
        localStorage.setItem('ai_active_board', activeBoardId);
        if (typeof saveState === 'function') saveState();
        if (typeof render === 'function') render();
    };

    window.renameSocialClient = function(e, id) {
        e.stopPropagation();
        const board = boards.find(b => b.id === id);
        if (!board) return;
        
        let rnModal = document.getElementById('renameClientModal');
        if (!rnModal) {
            rnModal = document.createElement('div');
            rnModal.id = 'renameClientModal';
            rnModal.className = 'modal-overlay';
            rnModal.innerHTML = `
                <div class="modal-content" style="max-width: 380px;" dir="rtl">
                    <div class="modal-header">
                        <h3>تعديل اسم العميل</h3>
                        <button class="icon-btn" onclick="document.getElementById('renameClientModal').classList.remove('active')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="modal-body" style="padding-top: 12px;">
                        <input type="text" id="renameClientInput" class="modal-input" placeholder="اسم العميل..." style="width: 100%; box-sizing: border-box; border: 1.5px solid #cbd5e0; border-radius: 6px; padding: 10px; font-size: 15px; outline: none; transition: border-color 0.2s;" dir="rtl">
                    </div>
                    <div class="modal-footer" style="padding-top: 16px; margin-top: 16px; border-top: 1px solid #edf2f7; display: flex; justify-content: space-between; gap: 8px;">
                        <button id="renameClientDeleteBtn" style="padding: 8px 16px; border-radius: 6px; border: none; background: #fee2e2; color: #dc2626; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px;">حذف العميل</button>
                        <div style="display: flex; gap: 8px;">
                            <button id="renameClientConfirmBtn" style="padding: 8px 16px; border-radius: 6px; border: none; background: #f97316; color: white; cursor: pointer; font-weight: 600;">حفظ</button>
                            <button onclick="document.getElementById('renameClientModal').classList.remove('active')" style="padding: 8px 16px; border-radius: 6px; border: none; background: #edf2f7; color: #4a5568; cursor: pointer; font-weight: 600;">إلغاء</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(rnModal);
            
            const inputEl = document.getElementById('renameClientInput');
            if(inputEl) inputEl.addEventListener('focus', () => inputEl.style.borderColor = '#f97316');
            if(inputEl) inputEl.addEventListener('blur', () => inputEl.style.borderColor = '#cbd5e0');
            
            inputEl.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    document.getElementById('renameClientConfirmBtn').click();
                }
            });
        }
        
        const input = document.getElementById('renameClientInput');
        input.value = board.title;
        
        document.getElementById('renameClientConfirmBtn').onclick = () => {
            const newName = input.value.trim();
            input.blur();
            rnModal.classList.remove('active');
            
            if (newName && newName !== board.title) {
                board.title = newName;
                saveState();
                render();
            }
        };
        
        document.getElementById('renameClientDeleteBtn').onclick = (e) => {
            rnModal.classList.remove('active');
            window.promptSecureDelete(board.id, board.title);
        };
        
        rnModal.classList.add('active');
        setTimeout(() => input.focus(), 50);
    };

    const clientTabsHtml = `
        <style>
            @keyframes agencyGlow {
                0% { box-shadow: 0 0 10px rgba(139, 92, 246, 0.5); }
                50% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.8), 0 0 30px rgba(236, 72, 153, 0.6); }
                100% { box-shadow: 0 0 10px rgba(139, 92, 246, 0.5); }
            }
            @keyframes gradientShift {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .agency-premium-tab {
                background: linear-gradient(135deg, #4f46e5, #9333ea, #ec4899, #f43f5e) !important;
                background-size: 300% 300% !important;
                animation: gradientShift 4s ease infinite, agencyGlow 2s infinite alternate !important;
                color: white !important;
                border: 2px solid rgba(255, 255, 255, 0.3) !important;
                backdrop-filter: blur(10px);
                transform: scale(1.05);
                z-index: 10;
            }
            .agency-premium-tab button {
                color: white !important;
            }
            .agency-premium-tab:hover {
                transform: translateY(-2px) scale(1.08);
                filter: brightness(1.15);
            }
            .agency-premium-tab-inactive {
                background: linear-gradient(135deg, #312e81, #5b21b6) !important;
                border: 2px solid rgba(139, 92, 246, 0.4) !important;
                box-shadow: 0 4px 15px rgba(76, 29, 149, 0.3) !important;
            }
            .agency-premium-tab-inactive button {
                color: #e2e8f0 !important;
            }
            .agency-premium-tab-inactive:hover {
                background: linear-gradient(135deg, #4338ca, #6d28d9) !important;
                transform: translateY(-1px);
                border-color: rgba(167, 139, 250, 0.6) !important;
            }
        </style>
        <div style="display: flex; gap: 8px; overflow-x: auto; padding: 2px 0; align-items: center; flex-wrap: nowrap;">
            <div id="socialClientTabs" style="display: flex; gap: 8px; align-items: center;">
            ${socialBoards.slice(2).map((b, idx) => {
                const isActive = activeBoard.id === b.id;
                
                let bg = isActive ? 'white' : 'transparent';
                let color = '#1a202c';
                let border = isActive ? '2px solid #f97316' : '2px solid #cbd5e0';
                let shadow = isActive ? '0 2px 4px rgba(249, 115, 22, 0.15)' : 'none';
                let btnRadius = '9999px';

                return `
                <div style="background: ${bg}; border: ${border}; box-shadow: ${shadow}; display:flex; align-items:center; border-radius: ${btnRadius}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position:relative;">
                    <button 
                        data-id="${b.id}"
                        onclick="window.switchSocialClient('${b.id}')" 
                        ondblclick="window.renameSocialClient(event, '${b.id}')"
                        title="انقر نقراً مزدوجاً لـتعديل اسم العميل"
                        style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 6px 16px; 
                        background: transparent; 
                        color: ${color}; 
                        border: none;
                        font-weight: 700; 
                        font-size: 14px; 
                        white-space: nowrap; 
                        cursor: pointer;
                        outline: none;
                    "
                    onmousedown="this.parentElement.style.cursor='grabbing'; this.style.cursor='grabbing';" onmouseup="this.parentElement.style.cursor='pointer'; this.style.cursor='pointer';" onmouseleave="this.parentElement.style.cursor='pointer'; this.style.cursor='pointer';">
                        ${b.title || 'Client '}
                    </button>
                </div>
                `;
            }).join('')}
            </div>
            <button onclick="window.openAddClientModal();" style="
                flex-shrink: 0;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 16px; 
                background: transparent; 
                color: #718096; 
                border: 2px dashed #cbd5e0; 
                border-radius: 9999px; 
                font-weight: 600; 
                font-size: 13px; 
                white-space: nowrap; 
                cursor: pointer;
                transition: all 0.2s;
            " onmouseover="this.style.background='#f7fafc'; this.style.color='#4a5568'; this.style.border='2px dashed #a0aec0';" onmouseout="this.style.background='transparent'; this.style.color='#718096'; this.style.border='2px dashed #cbd5e0';">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                إضافة عميل
            </button>
        </div>
    `;
    
    window.generateDirectShareLink = window.generateDirectShareLink || function(boardId, btn, e) {
        if (e) e.stopPropagation();
        let m = window.activeSocialMonthView ? window.activeSocialMonthView.month : new Date().getMonth();
        let y = window.activeSocialMonthView ? window.activeSocialMonthView.year : new Date().getFullYear();
        
        const targetUrl = window.location.href.split('?')[0] + '?c=' + boardId + '-' + m + '-' + y;
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(targetUrl).then(() => {
                if(btn) {
                    const oldHtml = btn.innerHTML;
                    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    setTimeout(() => { btn.innerHTML = oldHtml; }, 2000);
                } else {
                    // silent fallback
                }
            });
        }
        
        // Open the link in a new tab
        window.open(targetUrl, '_blank');
    };

    if (!window.openSocialRulesModal) {
        window.openSocialRulesModal = function() {
            let overlay = document.getElementById('socialRulesOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'socialRulesOverlay';
                overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:999999; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s;";
                
                overlay.innerHTML = `
                    <div style="background:white; width:90%; max-width:850px; border-radius:12px; padding:24px; box-shadow:0 10px 25px rgba(0,0,0,0.1); transform:translateY(20px); transition:transform 0.2s; direction:rtl; display: flex; flex-direction: column; align-items:center;">
                        <div class="sm-spinner" style="width:40px; height:40px; border:4px solid #e2e8f0; border-top-color:#ea580c; border-radius:50%; animation:spin 1s linear infinite;"></div>
                        <div style="margin-top:16px; font-weight:bold; color:#64748b;">جاري تحميل قواعد الفريق...</div>
                    </div>
                `;
                document.body.appendChild(overlay);

                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    overlay.firstElementChild.style.transform = 'translateY(0)';
                });

                db.ref('agency_settings/team_rules').once('value').then(snap => {
                    let existingRules = snap.val() || '';
                    if (!existingRules && localStorage.getItem('sm-social-rules')) {
                        existingRules = localStorage.getItem('sm-social-rules');
                        db.ref('agency_settings/team_rules').set(existingRules);
                    }
                    if (!existingRules.includes('<') && existingRules.includes('\n')) {
                        existingRules = existingRules.replace(/\n/g, '<br>');
                    }

                    overlay.innerHTML = `
                        <div style="background:white; width:90%; max-width:850px; border-radius:12px; padding:24px; box-shadow:0 10px 25px rgba(0,0,0,0.1); transform:translateY(0px); transition:transform 0.2s; direction:rtl; display: flex; flex-direction: column;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                                <div style="display:flex; align-items:center; gap:16px;">
                                    <h3 style="margin:0; font-size:22px; color:#1e293b; font-weight:700; display:flex; align-items:center; gap:8px;">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                        قواعد فريق العمل
                                    </h3>
                                    <div style="display:flex; gap:8px;">
                                        <button onclick="window.exportDashboardData()" title="تصدير نسخة احتياطية لجميع العملاء" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; cursor:pointer; color:#475569; font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='#f8fafc';">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                            تصدير البيانات
                                        </button>
                                        <label style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; cursor:pointer; color:#475569; font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='#f8fafc';">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                            استيراد البيانات
                                            <input type="file" accept=".json" style="display:none;" onchange="if(confirm('سيتم استبدال جميع بيانات العملاء الحالية. هل أنت متأكد؟')) { window.importDashboardData(event); } else { this.value = ''; }">
                                        </label>
                                    </div>
                                </div>
                                <button onclick="document.getElementById('socialRulesOverlay').style.opacity='0'; document.getElementById('socialRulesOverlay').firstElementChild.style.transform='translateY(20px)'; setTimeout(()=>document.getElementById('socialRulesOverlay').remove(), 200);" style="background:none; border:none; cursor:pointer; color:#94a3b8;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                            </div>
                            <p style="font-size:15px; color:#64748b; margin-top:0; margin-bottom:16px;">اكتب هنا القواعد والشروط المرجعية لقسم التواصل الاجتماعي. (مربوطة بقاعدة بيانات السيرفر لجميع أفراد الفريق).</p>
                        
                        <style>
                            #socialRulesInput ul { list-style-type: disc !important; padding-inline-start: 28px !important; margin: 12px 0 !important; }
                            #socialRulesInput ol { list-style-type: decimal !important; padding-inline-start: 28px !important; margin: 12px 0 !important; }
                            #socialRulesInput li { margin-bottom: 6px !important; display: list-item !important; }
                            #socialRulesInput b { font-weight: bold !important; }
                            #socialRulesInput i { font-style: italic !important; }
                            #socialRulesInput * { font-size: inherit !important; line-height: inherit !important; }
                        </style>
                        <div style="border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; transition:border-color 0.2s;" id="socialRulesContainer">
                            <div style="background:#f8fafc; border-bottom:1px solid #cbd5e1; padding:8px 12px; display:flex; gap:8px;">
                                <button onclick="document.execCommand('bold',false,null);" title="عريض (Bold)" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold; color:#1e293b;">B</button>
                                <button onclick="document.execCommand('italic',false,null);" title="مائل (Italic)" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; font-style:italic; font-family:serif; color:#1e293b;">I</button>
                                <div style="width:1px; background:#cbd5e1; margin:0 4px;"></div>
                                <button onclick="document.execCommand('insertUnorderedList',false,null);" title="قائمة نقطية (Bullets)" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; color:#1e293b;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                                <button onclick="document.execCommand('insertOrderedList',false,null);" title="قائمة رقمية (Numbered)" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; color:#1e293b;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 6h11"></path><path d="M10 12h11"></path><path d="M10 18h11"></path><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg></button>
                                <div style="width:1px; background:#cbd5e1; margin:0 4px;"></div>
                                <button onclick="let el=document.getElementById('socialRulesInput'); let sz=parseInt(window.getComputedStyle(el).fontSize); el.style.fontSize=(sz+2)+'px';" title="تكبير الخط" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; color:#1e293b; font-weight:bold; display:flex; align-items:center; font-size:14px;">A+</button>
                                <button onclick="let el=document.getElementById('socialRulesInput'); let sz=parseInt(window.getComputedStyle(el).fontSize); el.style.fontSize=Math.max(10, sz-2)+'px';" title="تصغير الخط" style="background:white; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; color:#1e293b; font-weight:bold; display:flex; align-items:center; font-size:12px;">A-</button>
                            </div>
                            <div id="socialRulesInput" contenteditable="true" style="width:100%; height:60vh; min-height:400px; overflow-y:auto; padding:16px; font-family:inherit; font-size:16px; line-height:1.6; color:#1e293b; outline:none;" onfocus="document.getElementById('socialRulesContainer').style.borderColor='#f97316'" onblur="document.getElementById('socialRulesContainer').style.borderColor='#cbd5e1'"></div>
                        </div>
                        
                        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                            <button onclick="document.getElementById('socialRulesOverlay').style.opacity='0'; document.getElementById('socialRulesOverlay').firstElementChild.style.transform='translateY(20px)'; setTimeout(()=>document.getElementById('socialRulesOverlay').remove(), 200);" style="background:#f1f5f9; color:#475569; border:none; padding:12px 24px; border-radius:8px; font-weight:700; cursor:pointer; font-size:15px; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">إلغاء</button>
                            <button id="saveRulesBtn" onclick="
                                let btn = this;
                                btn.innerText = 'جاري الحفظ...';
                                btn.style.opacity = '0.7';
                                document.getElementById('socialRulesInput').contentEditable = false;
                                db.ref('agency_settings/team_rules').set(document.getElementById('socialRulesInput').innerHTML).then(() => {
                                    localStorage.setItem('sm-social-rules', document.getElementById('socialRulesInput').innerHTML);
                                    document.getElementById('socialRulesOverlay').style.opacity='0';
                                    document.getElementById('socialRulesOverlay').firstElementChild.style.transform='translateY(20px)';
                                    setTimeout(()=>document.getElementById('socialRulesOverlay').remove(), 200);
                                }).catch(e => {
                                    btn.innerText = 'خطأ!';
                                    setTimeout(() => {
                                        btn.innerText = 'حفظ القواعد';
                                        btn.style.opacity = '1';
                                        document.getElementById('socialRulesInput').contentEditable = true;
                                    }, 2000);
                                });
                            " style="background:#ea580c; color:white; border:none; padding:12px 32px; border-radius:8px; font-weight:700; cursor:pointer; font-size:15px; transition:background 0.2s;" onmouseover="this.style.background='#c2410c'" onmouseout="this.style.background='#ea580c'">حفظ القواعد</button>
                        </div>
                    </div>
                `;
                
                document.getElementById('socialRulesInput').innerHTML = existingRules;
                });
            }
        };
    }

    const topRowHtml = `
        <div class="sm-header-banner" style="margin-bottom: 24px; display: flex; align-items: center; justify-content: flex-start; gap: 24px;">
            <!-- Title & Icon -->
            <button onclick="window.openSocialRulesModal()" title="انقر لضبط وتعديل قواعد النشر" style="display: flex; align-items: center; gap: 12px; flex-shrink: 0; background: transparent; border: none; cursor: pointer; padding: 6px; border-radius: 8px; transition: background 0.2s; outline: none; box-shadow: none;" onmouseover="this.style.background='rgba(0,0,0,0.04)'" onmouseout="this.style.background='transparent'">
                <div class="sm-title-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                </div>
                <div class="sm-title-text" style="display: flex; align-items: center; gap: 8px;">
                    <h2 style="font-size: 20px; font-weight: 800; color: #1a202c; margin: 0;">النشر على وسائل التواصل</h2>
                </div>
            </button>

            <!-- Client Tabs injected directly to the left of the title -->
            ${clientTabsHtml}
        </div>
    `;
    window.activeSocialTab = window.activeSocialTab || 'calendar';

    const tabData = [
        { id: 'calendar', title: 'الجدولة والنشر', svg: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
        { id: 'stats', title: 'الإحصائيات', svg: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>' },
        { id: 'accounts', title: 'ربط الحسابات', svg: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>' },
        { id: 'history', title: 'سجل النشر', svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>' }
    ];

    let tabsHtml = '<div class="sm-tabs-container" style="max-width: fit-content;">';
    tabData.forEach(t => {
        tabsHtml += `
            <div class="sm-tab ${window.activeSocialTab === t.id ? 'active' : ''}" data-tab="${t.id}" style="padding: 10px 16px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.svg}</svg>
                ${t.title}
            </div>
        `;
    });
    tabsHtml += '</div>';

    window.smShowClientEditsToggle = typeof window.smShowClientEditsToggle === 'boolean' ? window.smShowClientEditsToggle : true;
    window.toggleClientEditsVisibility = function() {
        window.smShowClientEditsToggle = !window.smShowClientEditsToggle;
        if (typeof render === 'function') {
            render();
        }
    };
    window.getDiffHtml = function(oldText, newText) {
        if (!oldText) oldText = '';
        if (!newText) newText = '';
        const esc = str => str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const oldW = oldText.match(/\\S+|\\s+/g) || [];
        const newW = newText.match(/\\S+|\\s+/g) || [];
        if (oldW.length > 500 || newW.length > 500) {
            if (oldText !== newText) return `<span style="color:#166534;">${esc(newText)}</span>`;
            return esc(newText);
        }
        const dp = Array(oldW.length + 1).fill(null).map(() => Array(newW.length + 1).fill(0));
        for (let i = 1; i <= oldW.length; i++) {
            for (let j = 1; j <= newW.length; j++) {
                if (oldW[i-1] === newW[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
                else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
        let i = oldW.length, j = newW.length;
        const path = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldW[i-1] === newW[j-1]) { path.push({t: 'eq', v: oldW[i-1]}); i--; j--; }
            else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { path.push({t: 'add', v: newW[j-1]}); j--; }
            else { path.push({t: 'del', v: oldW[i-1]}); i--; }
        }
        path.reverse();
        let res = '';
        path.forEach(p => {
            if (p.t === 'eq') res += esc(p.v);
            else if (p.t === 'add') res += `<span style="color:#dc2626; font-weight:bold;">${esc(p.v)}</span>`;
            else if (p.t === 'del' && p.v.trim().length > 0) res += `<del style="color:#ef4444; opacity:0.6; padding:0 2px;">${esc(p.v)}</del>`;
        });
        return res.replace(/\\n/g, '<br>');
    };
    
    window.updateLiveDiff = function() {
        if (!window.currentEditingSocialPostId || !window.boards || !window.activeBoardId) return;
        const activeBoard = window.boards.find(b => b.id === window.activeBoardId);
        if (!activeBoard || !activeBoard.cards) return;
        const post = activeBoard.cards.find(c => c.id === window.currentEditingSocialPostId);
        if (!post) return;
        
        const agencyEditsDiff = document.getElementById('agencyClientEditsDiff');
        if (!agencyEditsDiff) return;
        
        const textArea = document.querySelector('.sm-textarea');
        const postTypeInput = document.querySelector('input[name="smPostType"]:checked');
        const clientEditsInput = document.getElementById('clientEditsInput');
        
        const currentText = textArea ? textArea.value : (post.fullText || '');
        const currentType = postTypeInput ? postTypeInput.value : (post.postType || 'image');
        const currentClientEdits = clientEditsInput ? clientEditsInput.value : (post.clientEdits || '');
        
        let diffHtml = '';
        
        const formatTime = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            return `<div style="font-size: 10px; color: #94a3b8; font-weight: normal; margin-bottom: 4px;">🕒 ${d.toLocaleDateString('ar-EG')} ${d.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</div>`;
        };
        const tsHtml = post.clientModifiedAt ? formatTime(post.clientModifiedAt) : formatTime(Date.now());

        if (post.isClientDayNote) {
            // It's a completely brand new note generated by the calendar double click.
            diffHtml += `<div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                ${tsHtml}
                <div style="font-weight: 700; margin-bottom: 4px; color: #0ea5e9;">ملاحظة يومية جديدة</div>
                <div style="line-height: 1.6; color: #334155; font-size: 13px;">${currentText ? window.smEscapeHTML(currentText).replace(/\\n/g, '<br>') : ''}</div>
            </div>`;
        } else if (post.originalState || (currentClientEdits && currentClientEdits.trim() !== '')) {
            let changes = '';
            if (post.originalState && post.originalState.postType !== currentType) {
                changes += `<div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
                    ${tsHtml}
                    <div style="font-weight: 700; margin-bottom: 4px; color: #eab308;">تعديل نوع المنشور</div>
                    <div style="color: #334155;">من <strong>${post.originalState.postType === 'video' ? 'فيديو' : 'صورة'}</strong> <span style="margin: 0 4px;">&larr;</span> إلى <strong style="color: #ef4444">${currentType === 'video' ? 'فيديو' : 'صورة'}</strong></div>
                </div>`;
            }
            if (post.originalState && post.originalState.fullText !== currentText) {
                changes += `<div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
                    ${tsHtml}
                    <div style="font-weight: 700; margin-bottom: 4px; color: #0ea5e9;">تعديل المحتوى</div>
                    <div style="line-height: 1.6; font-size: 13px; color: #334155;">${window.getDiffHtml(post.originalState.fullText, currentText)}</div>
                </div>`;
            }
            if (currentClientEdits && currentClientEdits.trim() !== '') {
                changes += `<div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    ${tsHtml}
                    <div style="font-weight: 700; margin-bottom: 4px; color: #16a34a;">ملاحظات وتعديلات مقترحة</div>
                    <div style="line-height: 1.6; font-size: 13px; color: #334155;">${window.smEscapeHTML(currentClientEdits).replace(/\\n/g, '<br>')}</div>
                </div>`;
            }
            if (changes) diffHtml += changes;
        }
        
        if (diffHtml) {
            agencyEditsDiff.innerHTML = diffHtml;
            agencyEditsDiff.style.display = 'block';
            agencyEditsDiff.style.background = 'transparent';
            agencyEditsDiff.style.border = 'none';
            agencyEditsDiff.style.padding = '0';
            
            // CRITICAL: Force the parent container to show if there's actual diff content
            const agencyEditsContainer = document.getElementById('agencyClientEditsContainer');
            if (agencyEditsContainer) agencyEditsContainer.style.setProperty('display', 'block', 'important');
        } else {
            agencyEditsDiff.style.display = 'none';
        }
    };
    
    window.clearClientModifications = function() {
        if (window.currentEditingSocialPostId && window.boards && window.activeBoardId) {
            const board = window.boards.find(b => b.id === window.activeBoardId);
            if (board && board.cards) {
                const post = board.cards.find(c => c.id === window.currentEditingSocialPostId);
                if (post) {
                    post.clientModified = false;
                    post.clientEdits = '';
                    delete post.originalState;
                    if (window.saveState) window.saveState();
                    
                    const agencyEditsContainer = document.getElementById('agencyClientEditsContainer');
                    if (agencyEditsContainer) agencyEditsContainer.style.display = 'none';
                    if (typeof render === 'function') render();
                }
            }
        }
    };

    window.generateAndOpenShareLink = window.generateAndOpenShareLink || function(boardId, month, year, btn) {
        if(btn) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
        const shortCode = Math.random().toString(36).substr(2,4).toUpperCase();
        const shareData = `${boardId}|${month}|${year}`;
        
        // Open the tab synchronously to bypass popup blockers
        const newTab = window.open('about:blank', '_blank');
        if (newTab) {
            newTab.document.write('<div style="font-family:sans-serif; text-align:center; padding:50px; color:#64748b; font-weight:bold; font-size:18px;">جاري تأمين الرابط ومشاركة العميل...</div>');
        }
        
        firebase.database().ref('sm_short_links/' + shortCode).set(shareData).then(() => {
            if(btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
            const targetUrl = window.location.href.split('?')[0] + '?id=' + shortCode;
            if (newTab) newTab.location.href = targetUrl;
            else window.location.href = targetUrl; // Fallback if popup blocked
        }).catch(e => {
            console.error(e);
            if(btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                alert('حدث خطأ أثناء إنشاء الرابط. يرجى المحاولة مرة أخرى.');
            }
            if(newTab) newTab.close();
        });
    };

    window.toggleSocialAccount = window.toggleSocialAccount || function(platformId) {
        const boardId = typeof window.activeBoardId !== 'undefined' ? window.activeBoardId : (typeof activeBoardId !== 'undefined' ? activeBoardId : null);
        const boardList = typeof window.boards !== 'undefined' ? window.boards : (typeof boards !== 'undefined' ? boards : []);
        const board = boardList.find(b => b.id === boardId);
        
        if (!board) return;

        if (!board.connectedAccounts) {
            board.connectedAccounts = {};
        }
        
        const isCurrentlyConnected = board.connectedAccounts[platformId];
        
        if (isCurrentlyConnected) {
            if (confirm('هل أنت متأكد من رغبتك في إلغاء ربط الحساب؟')) {
                board.connectedAccounts[platformId] = false;
                if (typeof window.saveState === 'function') { window.saveState(); } else if (typeof saveState === 'function') { saveState(); }
                if (typeof window.render === 'function') { window.render(); } else if (typeof render === 'function') { render(); }
            }
        } else {
            if (typeof window.connectZernioPlatform === 'function') {
                window.connectZernioPlatform(platformId);
                
                // For UX presentation prototype: Let the UI think it connected after 5 seconds
                setTimeout(() => {
                    board.connectedAccounts[platformId] = true;
                    if (typeof window.saveState === 'function') { window.saveState(); } else if (typeof saveState === 'function') { saveState(); }
                    if (typeof window.render === 'function') { window.render(); } else if (typeof render === 'function') { render(); }
                }, 5000);
            } else {
                alert('Connection API not initialized!');
            }
        }
    };

    const headerPadding = (window.activeSocialTab === 'calendar' && !window.isClientView) ? '0 0 24px 0' : '24px 32px 24px 32px';
    const universalHeaderHtml = `
        <div style="padding: ${headerPadding}; flex-shrink: 0;">
            <!-- Top Row: Title + Clients -->
            <div style="margin-bottom: 24px;">
                ${topRowHtml}
            </div>
            
            <!-- Bottom Row: New Post Button + Tabs -->
            <div style="display: flex; justify-content: flex-start; gap: 24px; align-items: center;">
                <button class="sm-primary-btn" style="padding: 10px 20px;" onclick="window.openCreatePostModal()">+ منشور جديد</button>
                <div style="display: flex; gap: 8px;">
                    <button class="sm-action-btn" title="فتح مساحة العميل في صفحة جديدة" style="display:flex; align-items:center; gap:8px; padding: 10px 16px; font-weight: 700; color: #475569; background: white; border: 1px solid #e2e8f0; border-radius: 9px; white-space: nowrap; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-family: inherit; font-size: 14px;" onmouseover="this.style.background='#f8fafc'; this.style.color='#0f172a'; this.style.borderColor='#cbd5e1';" onmouseout="this.style.background='white'; this.style.color='#475569'; this.style.borderColor='#e2e8f0';" onclick="window.generateDirectShareLink('${activeBoard.id}', this, event)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        مشاركة العميل
                    </button>
                </div>
                ${tabsHtml}
            </div>
        </div>
    `;

    let mainContentHtml = '';

    // Inject safe window global if not already present
    window.navigateSocialMonth = window.navigateSocialMonth || function(direction) {
        if (!window.activeSocialMonthView) return;
        window.activeSocialMonthView.month += direction;
        if (window.activeSocialMonthView.month > 11) {
            window.activeSocialMonthView.month = 0;
            window.activeSocialMonthView.year += 1;
        } else if (window.activeSocialMonthView.month < 0) {
            window.activeSocialMonthView.month = 11;
            window.activeSocialMonthView.year -= 1;
        }
        render(); // trigger a full re-render
    };

    window.resetSocialMonthToToday = window.resetSocialMonthToToday || function() {
        const t = new Date();
        window.activeSocialMonthView = { year: t.getFullYear(), month: t.getMonth() };
        window.activeSocialDateOptions = { year: t.getFullYear(), month: t.getMonth(), date: t.getDate() };
        render();
    };

    window.toggleLiveMode = window.toggleLiveMode || function() {
        window.isLiveModeActive = !window.isLiveModeActive;
        if (typeof render === 'function') render();
    };

    window.exportDashboardData = window.exportDashboardData || function() {
        const dataToExport = {
            boards: typeof boards !== 'undefined' ? boards : [],
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "smma_dashboard_backup_" + new Date().toISOString().slice(0,10) + ".json");
        document.body.appendChild(downloadAnchorNode); 
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    window.importDashboardData = window.importDashboardData || function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData && importedData.boards && Array.isArray(importedData.boards)) {
                    boards = importedData.boards;
                    let cloudBoards = boards.filter(b => b.type === 'social_scheduler');
                    if (typeof db !== 'undefined' && db.ref) {
                        db.ref('ai_social_lists').set(cloudBoards).then(() => {
                            alert("تم استيراد البيانات وتزامنها مع السحابة بنجاح!");
                            location.reload();
                        }).catch(err => {
                            alert("حدث خطأ في مزامنة البيانات: " + err.message);
                        });
                    } else {
                        alert("تم استيراد البيانات محلياً بنجاح!");
                        location.reload();
                    }
                } else {
                    alert("تنسيق الملف غير صحيح. يرجى التأكد من اختيار ملف تصدير صحيح.");
                }
            } catch(error) {
                alert("حدث خطأ أثناء استيراد البيانات: " + error.message);
            }
        };
        reader.readAsText(file);
    };

    if (window.activeSocialTab === 'calendar') {
        const hiddenEventsGlobal = window.getHiddenSocialEvents();
        const currentMonthEvents = window.specialAwarenessDays.filter(e => e.m === currentMonth && !hiddenEventsGlobal.includes(`${e.m}-${e.d}`));
        
        let monthEventsHtml = '';
        if (currentMonthEvents.length > 0) {
            monthEventsHtml = currentMonthEvents.map(ev => {
                const styleMap = window.eventCategoryMap[ev.category] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
                return `
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: right; direction: rtl;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <span style="font-size: 13px; font-weight: 700; color: #1e293b;">${ev.d} ${monthNamesArabic[currentMonth]}</span>
                        <span style="background: ${styleMap.bg}; color: ${styleMap.text}; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">${ev.category}</span>
                    </div>
                    <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${ev.name}</div>
                    <div style="font-size: 12px; color: #64748b; line-height: 1.5;">${ev.desc}</div>
                </div>`;
            }).join('');
        }
        
        const sidebarEventsSection = '';

        const legendHtml = currentMonthEvents.length > 0 ? `
            <div class="sm-cal-legend" style="margin-top: 24px; background: #fffcf8; border-radius: 16px; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap: 16px; direction: rtl;">
                <div style="font-weight: 700; color: #d97706; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                    ✨ ${currentMonthEvents.length} أحداث عالمية هذا الشهر
                </div>
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    ${Object.keys(window.eventCategoryMap).map(cat => {
                        const map = window.eventCategoryMap[cat];
                        return `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${map.dot}; flex-shrink: 0;"></div>
                            ${cat}
                        </div>`;
                    }).join('')}
                </div>
            </div>
        ` : '';

        let currentMonthPosts = 0;
        let currentMonthImages = 0;
        let currentMonthVideos = 0;
        
        if (activeBoard.cards) {
            activeBoard.cards.forEach(c => {
                if (c.dateStr && c.dateStr.startsWith(`${currentYear}-${currentMonth}-`)) {
                    currentMonthPosts++;
                    if (c.postType === 'video') currentMonthVideos++;
                    else currentMonthImages++;
                }
            });
        }
        
        const monthStatsHtml = `<span style="font-size: 13px; font-weight: 600; color: #64748b; margin-right: 12px; display: inline-flex; align-items: center; gap: 8px; background: #fffcf8; padding: 4px 12px; border-radius: 20px; border: 1px solid #fed7aa;"><span>المنشورات: <strong style="color: #ea580c;">${currentMonthPosts}</strong></span><span style="color: #fed7aa;">|</span><span>🖼️ صور: <strong style="color: #ea580c;">${currentMonthImages}</strong></span><span style="color: #fed7aa;">|</span><span>▶️ فيديو: <strong style="color: #ea580c;">${currentMonthVideos}</strong></span></span>`;

        mainContentHtml = `
            <div class="sm-main-content" style="padding: 24px 32px 16px 32px;">
                <div style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
                    ${window.isClientView ? '' : universalHeaderHtml}
                    ${window.isClientView ? '' : window.generatePipelineHtml(activeBoard)}
                    <div class="sm-calendar-wrap ${window.isLiveModeActive ? 'sm-calendar-live-active' : ''}" style="flex: 1; overflow: auto; margin-bottom: 0;">
                        <div class="sm-calendar-header" style="flex-wrap: wrap; gap: 12px;">
                            <h3 class="sm-cal-month-title" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">${monthNamesArabic[currentMonth]} ${currentYear} - ${activeBoard.title} ${monthStatsHtml}</h3>
                            <div class="sm-cal-nav">
                                <button class="sm-mobile-toggle-sidebar" onclick="document.querySelector('.sm-sidebar').classList.add('active')" style="background: #ea580c; color: white; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; align-items: center; gap: 6px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                                    معلومات وتفاصيل اليوم
                                </button>
                                ${window.isClientView ? '' : `
                                ${(currentMonth !== today.getMonth() || currentYear !== today.getFullYear()) ? `<button class="sm-icon-btn" onclick="window.resetSocialMonthToToday()" style="width:auto; padding: 0 12px; font-weight: 600; font-family: inherit; font-size: 13px;">اليوم</button>` : ''}
                                
                                <button class="sm-icon-btn" onclick="window.toggleClientEditsVisibility()" title="${window.smShowClientEditsToggle !== false ? 'إخفاء تعديلات العميل' : 'إظهار تعديلات العميل'}" style="margin-left: 4px; border: none; color:${window.smShowClientEditsToggle !== false ? '#16a34a' : '#64748b'};" onmouseover="this.style.background='${window.smShowClientEditsToggle !== false ? '#f0fdf4' : '#f1f5f9'}';" onmouseout="this.style.background='transparent';">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${window.smShowClientEditsToggle !== false ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"></path>' : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line>'}</svg>
                                </button>
                                
                                <style>@keyframes smLivePulse { 0% { transform: scale(0.9); opacity: 1; } 100% { transform: scale(1.4); opacity: 0.6; box-shadow: 0 0 8px #ef4444; } }</style>
                                <button class="sm-icon-btn" onclick="window.toggleLiveMode()" title="البث المباشر (Live)" style="margin-left: 4px; border: 1px solid ${window.isLiveModeActive ? '#ef4444' : 'transparent'}; background: ${window.isLiveModeActive ? '#fef2f2' : 'transparent'}; color:${window.isLiveModeActive ? '#ef4444' : '#64748b'}; font-weight:700; width: auto; padding: 0 10px; gap: 6px; font-size:13px; transition: all 0.2s;" onmouseover="this.style.background='${window.isLiveModeActive ? '#fee2e2' : '#f1f5f9'}';" onmouseout="this.style.background='${window.isLiveModeActive ? '#fef2f2' : 'transparent'}';">
                                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${window.isLiveModeActive ? '#ef4444' : 'transparent'}; border: ${window.isLiveModeActive ? 'none' : '2px solid #94a3b8'}; ${window.isLiveModeActive ? 'animation: smLivePulse 0.8s infinite alternate;' : ''}"></div>
                                    Live
                                </button>

                                
                                <button class="sm-icon-btn" onclick="window.hideAllMonthEvents(${currentMonth})" title="إخفاء جميع المناسبات في هذا الشهر" style="margin-left: 4px; border: none; color:#ef4444;" onmouseover="this.style.background='#fef2f2';" onmouseout="this.style.background='transparent';">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                </button>
                                <button class="sm-icon-btn" onclick="window.restoreMonthEvents(${currentMonth})" title="إظهار جميع المناسبات في هذا الشهر" style="margin-left: 8px; border: none; color:#10b981;" onmouseover="this.style.background='#f0fdf4';" onmouseout="this.style.background='transparent';">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </button>
                                <button class="sm-icon-btn" onclick="window.navigateSocialMonth(-1)" style="margin-left: 4px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
                                <button class="sm-icon-btn" onclick="window.navigateSocialMonth(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                                `}
                            </div>
                        </div>
                        
                        <div class="sm-cal-days-header">
                            ${dayNamesArabic.map(d => `<span>${d}</span>`).join('')}
                        </div>
                        
                        <div class="sm-cal-grid">
                            ${calendarHtml}
                        </div>
                        ${legendHtml}
                    </div>
                </div>
                <div class="sm-mobile-overlay" onclick="document.querySelector('.sm-sidebar').classList.remove('active')"></div>

                <div class="sm-sidebar" style="height: 100%;">
                    <div class="sm-sidebar-header" style="display:flex; align-items:flex-start; justify-content:space-between; border-bottom:2px solid #f1f5f9; padding-bottom:20px; margin-bottom:20px;">
                        <button class="sm-close-sidebar" onclick="document.querySelector('.sm-sidebar').classList.remove('active')" style="background: none; border: none; color: #475569; font-size: 24px; cursor: pointer; padding: 0 0 12px 12px; margin-left: auto;">&times;</button>
                        <div class="sm-selected-date-text" style="display:flex; flex-direction:column; gap:4px; align-items:flex-start; text-align:right;">
                            <h3 style="margin:0; font-size:22px; font-weight:800; color:#0f172a;">${dayNamesArabic[defaultSelectedDate.getDay()]}</h3>
                            <p style="margin:0; font-size:15px; font-weight:600; color:#64748b;">${defaultSelectedDate.getDate()} ${monthNamesArabic[currentMonth]}</p>
                            <div style="display:flex; gap:8px; margin-top:6px;">
                                <div onclick="window.handleSocialIconClick('facebook', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'facebook')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#e0f2fe; border:2px solid ${window.activePreviewPlatform === 'facebook' ? '#0ea5e9' : 'transparent'}; border-radius:50%; color:#0ea5e9; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                </div>
                                <div onclick="window.handleSocialIconClick('instagram', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'instagram')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#fce7f3; border:2px solid ${window.activePreviewPlatform === 'instagram' ? '#ec4899' : 'transparent'}; border-radius:50%; color:#ec4899; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm3.98-10.181a1.44 1.44 0 11-2.88 0 1.44 1.44 0 012.88 0z"/></svg>
                                </div>
                                <div onclick="window.handleSocialIconClick('twitter', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'twitter')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#f1f5f9; border:2px solid ${window.activePreviewPlatform === 'twitter' ? '#0f172a' : 'transparent'}; border-radius:50%; color:#0f172a; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                </div>
                                <div onclick="window.handleSocialIconClick('linkedin', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'linkedin')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#dbeafe; border:2px solid ${window.activePreviewPlatform === 'linkedin' ? '#2563eb' : 'transparent'}; border-radius:50%; color:#2563eb; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                </div>
                                <div onclick="window.handleSocialIconClick('tiktok', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'tiktok')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#f4f4f5; border:2px solid ${window.activePreviewPlatform === 'tiktok' ? '#18181b' : 'transparent'}; border-radius:50%; color:#18181b; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                                </div>
                                <div onclick="window.handleSocialIconClick('snapchat', this)" oncontextmenu="window.handleSocialIconContextMenu(event, 'snapchat')" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:#fef9c3; border:2px solid ${window.activePreviewPlatform === 'snapchat' ? '#ca8a04' : 'transparent'}; border-radius:50%; color:#ca8a04; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                                    <svg width="15" height="15" viewBox="147.353 39.286 514.631 514.631" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path style="fill:#FFFC00;" d="M147.553,423.021v0.023c0.308,11.424,0.403,22.914,2.33,34.268 c2.042,12.012,4.961,23.725,10.53,34.627c7.529,14.756,17.869,27.217,30.921,37.396c9.371,7.309,19.608,13.111,30.94,16.771 c16.524,5.33,33.571,7.373,50.867,7.473c10.791,0.068,21.575,0.338,32.37,0.293c78.395-0.33,156.792,0.566,235.189-0.484 c10.403-0.141,20.636-1.41,30.846-3.277c19.569-3.582,36.864-11.932,51.661-25.133c17.245-15.381,28.88-34.205,34.132-56.924 c3.437-14.85,4.297-29.916,4.444-45.035v-3.016c0-1.17-0.445-256.892-0.486-260.272c-0.115-9.285-0.799-18.5-2.54-27.636 c-2.117-11.133-5.108-21.981-10.439-32.053c-5.629-10.641-12.68-20.209-21.401-28.57c-13.359-12.81-28.775-21.869-46.722-26.661 c-16.21-4.327-32.747-5.285-49.405-5.27c-0.027-0.004-0.09-0.173-0.094-0.255H278.56c-0.005,0.086-0.008,0.172-0.014,0.255 c-9.454,0.173-18.922,0.102-28.328,1.268c-10.304,1.281-20.509,3.21-30.262,6.812c-15.362,5.682-28.709,14.532-40.11,26.347 c-12.917,13.386-22.022,28.867-26.853,46.894c-4.31,16.084-5.248,32.488-5.271,49.008"></path><path style="fill:#FFFFFF;" d="M407.001,473.488c-1.068,0-2.087-0.039-2.862-0.076c-0.615,0.053-1.25,0.076-1.886,0.076 c-22.437,0-37.439-10.607-50.678-19.973c-9.489-6.703-18.438-13.031-28.922-14.775c-5.149-0.854-10.271-1.287-15.22-1.287 c-8.917,0-15.964,1.383-21.109,2.389c-3.166,0.617-5.896,1.148-8.006,1.148c-2.21,0-4.895-0.49-6.014-4.311 c-0.887-3.014-1.523-5.934-2.137-8.746c-1.536-7.027-2.65-11.316-5.281-11.723c-28.141-4.342-44.768-10.738-48.08-18.484 c-0.347-0.814-0.541-1.633-0.584-2.443c-0.129-2.309,1.501-4.334,3.777-4.711c22.348-3.68,42.219-15.492,59.064-35.119 c13.049-15.195,19.457-29.713,20.145-31.316c0.03-0.072,0.065-0.148,0.101-0.217c3.247-6.588,3.893-12.281,1.926-16.916 c-3.626-8.551-15.635-12.361-23.58-14.882c-1.976-0.625-3.845-1.217-5.334-1.808c-7.043-2.782-18.626-8.66-17.083-16.773 c1.124-5.916,8.949-10.036,15.273-10.036c1.756,0,3.312,0.308,4.622,0.923c7.146,3.348,13.575,5.045,19.104,5.045 c6.876,0,10.197-2.618,11-3.362c-0.198-3.668-0.44-7.546-0.674-11.214c0-0.004-0.005-0.048-0.005-0.048 c-1.614-25.675-3.627-57.627,4.546-75.95c24.462-54.847,76.339-59.112,91.651-59.112c0.408,0,6.674-0.062,6.674-0.062 c0.283-0.005,0.59-0.009,0.908-0.009c15.354,0,67.339,4.27,91.816,59.15c8.173,18.335,6.158,50.314,4.539,76.016l-0.076,1.23 c-0.222,3.49-0.427,6.793-0.6,9.995c0.756,0.696,3.795,3.096,9.978,3.339c5.271-0.202,11.328-1.891,17.998-5.014 c2.062-0.968,4.345-1.169,5.895-1.169c2.343,0,4.727,0.456,6.714,1.285l0.106,0.041c5.66,2.009,9.367,6.024,9.447,10.242 c0.071,3.932-2.851,9.809-17.223,15.485c-1.472,0.583-3.35,1.179-5.334,1.808c-7.952,2.524-19.951,6.332-23.577,14.878 c-1.97,4.635-1.322,10.326,1.926,16.912c0.036,0.072,0.067,0.145,0.102,0.221c1,2.344,25.205,57.535,79.209,66.432 c2.275,0.379,3.908,2.406,3.778,4.711c-0.048,0.828-0.248,1.656-0.598,2.465c-3.289,7.703-19.915,14.09-48.064,18.438 c-2.642,0.408-3.755,4.678-5.277,11.668c-0.63,2.887-1.271,5.717-2.146,8.691c-0.819,2.797-2.641,4.164-5.567,4.164h-0.441 c-1.905,0-4.604-0.346-8.008-1.012c-5.95-1.158-12.623-2.236-21.109-2.236c-4.948,0-10.069,0.434-15.224,1.287 c-10.473,1.744-19.421,8.062-28.893,14.758C444.443,462.88,429.436,473.488,407.001,473.488"></path><path style="fill:#020202;" d="M408.336,124.235c14.455,0,64.231,3.883,87.688,56.472c7.724,17.317,5.744,48.686,4.156,73.885 c-0.248,3.999-0.494,7.875-0.694,11.576l-0.084,1.591l1.062,1.185c0.429,0.476,4.444,4.672,13.374,5.017l0.144,0.008l0.15-0.003 c5.904-0.225,12.554-2.059,19.776-5.442c1.064-0.498,2.48-0.741,3.978-0.741c1.707,0,3.521,0.321,5.017,0.951l0.226,0.09 c3.787,1.327,6.464,3.829,6.505,6.093c0.022,1.28-0.935,5.891-14.359,11.194c-1.312,0.518-3.039,1.069-5.041,1.7 c-8.736,2.774-21.934,6.96-26.376,17.427c-2.501,5.896-1.816,12.854,2.034,20.678c1.584,3.697,26.52,59.865,82.631,69.111 c-0.011,0.266-0.079,0.557-0.229,0.9c-0.951,2.24-6.996,9.979-44.612,15.783c-5.886,0.902-7.328,7.5-9,15.17 c-0.604,2.746-1.218,5.518-2.062,8.381c-0.258,0.865-0.306,0.914-1.233,0.914c-0.128,0-0.278,0-0.442,0 c-1.668,0-4.2-0.346-7.135-0.922c-5.345-1.041-12.647-2.318-21.982-2.318c-5.21,0-10.577,0.453-15.962,1.352 c-11.511,1.914-20.872,8.535-30.786,15.543c-13.314,9.408-27.075,19.143-48.071,19.143c-0.917,0-1.812-0.031-2.709-0.076 l-0.236-0.01l-0.237,0.018c-0.515,0.045-1.034,0.068-1.564,0.068c-20.993,0-34.76-9.732-48.068-19.143 c-9.916-7.008-19.282-13.629-30.791-15.543c-5.38-0.896-10.752-1.352-15.959-1.352c-9.333,0-16.644,1.428-21.978,2.471 c-2.935,0.574-5.476,1.066-7.139,1.066c-1.362,0-1.388-0.08-1.676-1.064c-0.844-2.865-1.461-5.703-2.062-8.445 c-1.676-7.678-3.119-14.312-9.002-15.215c-37.613-5.809-43.659-13.561-44.613-15.795c-0.149-0.352-0.216-0.652-0.231-0.918 c56.11-9.238,81.041-65.408,82.63-69.119c3.857-7.818,4.541-14.775,2.032-20.678c-4.442-10.461-17.638-14.653-26.368-17.422 c-2.007-0.635-3.735-1.187-5.048-1.705c-11.336-4.479-14.823-8.991-14.305-11.725c0.601-3.153,6.067-6.359,10.837-6.359 c1.072,0,2.012,0.173,2.707,0.498c7.747,3.631,14.819,5.472,21.022,5.472c9.751,0,14.091-4.537,14.557-5.055l1.057-1.182 l-0.085-1.583c-0.197-3.699-0.44-7.574-0.696-11.565c-1.583-25.205-3.563-56.553,4.158-73.871 c23.37-52.396,72.903-56.435,87.525-56.435c0.36,0,6.717-0.065,6.717-0.065C407.744,124.239,408.033,124.235,408.336,124.235 M408.336,115.197h-0.017c-0.333,0-0.646,0-0.944,0.004c-2.376,0.024-6.282,0.062-6.633,0.066c-8.566,0-25.705,1.21-44.115,9.336 c-10.526,4.643-19.994,10.921-28.14,18.66c-9.712,9.221-17.624,20.59-23.512,33.796c-8.623,19.336-6.576,51.905-4.932,78.078 l0.006,0.041c0.176,2.803,0.361,5.73,0.53,8.582c-1.265,0.581-3.316,1.194-6.339,1.194c-4.864,0-10.648-1.555-17.187-4.619 c-1.924-0.896-4.12-1.349-6.543-1.349c-3.893,0-7.997,1.146-11.557,3.239c-4.479,2.63-7.373,6.347-8.159,10.468 c-0.518,2.726-0.493,8.114,5.492,13.578c3.292,3.008,8.128,5.782,14.37,8.249c1.638,0.645,3.582,1.261,5.641,1.914 c7.145,2.271,17.959,5.702,20.779,12.339c1.429,3.365,0.814,7.793-1.823,13.145c-0.069,0.146-0.138,0.289-0.201,0.439 c-0.659,1.539-6.807,15.465-19.418,30.152c-7.166,8.352-15.059,15.332-23.447,20.752c-10.238,6.617-21.316,10.943-32.923,12.855 c-4.558,0.748-7.813,4.809-7.559,9.424c0.078,1.33,0.39,2.656,0.931,3.939c0.004,0.008,0.009,0.016,0.013,0.023 c1.843,4.311,6.116,7.973,13.063,11.203c8.489,3.943,21.185,7.26,37.732,9.855c0.836,1.59,1.704,5.586,2.305,8.322 c0.629,2.908,1.285,5.898,2.22,9.074c1.009,3.441,3.626,7.553,10.349,7.553c2.548,0,5.478-0.574,8.871-1.232 c4.969-0.975,11.764-2.305,20.245-2.305c4.702,0,9.575,0.414,14.48,1.229c9.455,1.574,17.606,7.332,27.037,14 c13.804,9.758,29.429,20.803,53.302,20.803c0.651,0,1.304-0.021,1.949-0.066c0.789,0.037,1.767,0.066,2.799,0.066 c23.88,0,39.501-11.049,53.29-20.799l0.022-0.02c9.433-6.66,17.575-12.41,27.027-13.984c4.903-0.814,9.775-1.229,14.479-1.229 c8.102,0,14.517,1.033,20.245,2.15c3.738,0.736,6.643,1.09,8.872,1.09l0.218,0.004h0.226c4.917,0,8.53-2.699,9.909-7.422 c0.916-3.109,1.57-6.029,2.215-8.986c0.562-2.564,1.46-6.674,2.296-8.281c16.558-2.6,29.249-5.91,37.739-9.852 c6.931-3.215,11.199-6.873,13.053-11.166c0.556-1.287,0.881-2.621,0.954-3.979c0.261-4.607-2.999-8.676-7.56-9.424 c-51.585-8.502-74.824-61.506-75.785-63.758c-0.062-0.148-0.132-0.295-0.205-0.438c-2.637-5.354-3.246-9.777-1.816-13.148 c2.814-6.631,13.621-10.062,20.771-12.332c2.07-0.652,4.021-1.272,5.646-1.914c7.039-2.78,12.07-5.796,15.389-9.221 c3.964-4.083,4.736-7.995,4.688-10.555c-0.121-6.194-4.856-11.698-12.388-14.393c-2.544-1.052-5.445-1.607-8.399-1.607 c-2.011,0-4.989,0.276-7.808,1.592c-6.035,2.824-11.441,4.368-16.082,4.588c-2.468-0.125-4.199-0.66-5.32-1.171 c0.141-2.416,0.297-4.898,0.458-7.486l0.067-1.108c1.653-26.19,3.707-58.784-4.92-78.134c-5.913-13.253-13.853-24.651-23.604-33.892 c-8.178-7.744-17.678-14.021-28.242-18.661C434.052,116.402,416.914,115.197,408.336,115.197"></path><rect x="147.553" y="39.443" style="fill:none;" width="514.231" height="514.23"></rect></g></svg>
                                </div>
                            </div>
                            <div id="sm-sidebar-link-btn-container" style="margin-top:12px; width:100%; display:none;"></div>

                        </div>
                    </div>
                    ${sidebarEventsSection}
                    <div class="sm-sidebar-body">
                    </div>
                </div>
            </div>
        `;
    } else if (window.activeSocialTab === 'stats') {
        mainContentHtml = `
            <div class="sm-full-view" style="padding-top: 0; min-height: 0;">
                <div class="sm-stats-top-bar">
                    <button class="sm-btn-primary-outline" style="margin-left: 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.45l5.08 5.08"/></svg> تحديث</button>
                    <button class="sm-btn-primary-outline" onclick="window.exportDashboardData()" style="margin-left: 8px; background: #fff7ed; color: #ea580c; border-color: #fdba74;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> تصدير النظام
                    </button>
                    <label class="sm-btn-primary-outline" style="margin-left: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; background: #fffaf5; color: #10b981; border-color: #6ee7b7; margin-bottom: 0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> استيراد النظام
                        <input type="file" accept=".json" style="display:none;" onchange="window.importDashboardData(event)">
                    </label>
                    <div class="sm-filter-group" style="margin-right:auto;">
                        <label class="sm-checkbox-lbl"><input type="checkbox" /> مقارنة بالفترة السابقة</label>
                        <select class="sm-select"><option>كل المنصات</option></select>
                        <div class="sm-date-range">
                            <label>من <input type="date" value="2026-04-01" class="sm-date-input-inline"/></label>
                            <label>إلى <input type="date" value="2026-03-31" class="sm-date-input-inline"/></label>
                        </div>
                    </div>
                </div>
                <div class="sm-stats-main-grid">
                    <div class="sm-stats-right-col">
                        <div class="sm-stat-box">
                            <div class="sm-stat-box-hdr"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect></svg> نشاط النشر</div>
                            <div class="sm-stat-box-empty" style="height:80px;">لا توجد بيانات نشر</div>
                        </div>
                        <div class="sm-stats-4grid">
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot red"></span> الإعجابات</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot blue"></span> التعليقات</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot green"></span> المشاركات</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot purple"></span> المشاهدات</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot cyan"></span> مرات الظهور</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot orange"></span> الوصول</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot pink"></span> النقرات</div><div class="sm-stat-mini-val">0</div></div>
                            <div class="sm-stat-mini"><div class="sm-stat-mini-hdr"><span class="sm-dot teal"></span> معدل التفاعل</div><div class="sm-stat-mini-val">0.00%</div></div>
                        </div>
                        <div class="sm-stat-box" style="flex:1;">
                            <div class="sm-stat-box-hdr" style="justify-content:space-between;">
                                <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg> الرسم البياني للأداء</span>
                                <select class="sm-select-small"><option>يومي</option></select>
                            </div>
                            <div class="sm-stat-box-empty" style="flex:1; min-height: 140px;"></div>
                        </div>
                    </div>
                    <div class="sm-stats-left-col">
                        <div class="sm-stat-box">
                            <div class="sm-stat-box-hdr"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> إجمالي المتابعين</div>
                            <div class="sm-stat-box-val">—</div>
                            <div class="sm-stat-box-sub">لا تتوفر بيانات نمو المتابعين للفترة المحددة</div>
                        </div>
                        <div class="sm-stat-box" style="flex:1;">
                            <div class="sm-stat-box-hdr"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> تحليل المنصات</div>
                            <div class="sm-stat-box-empty" style="flex:1;">لا توجد بيانات للمنصات</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (window.activeSocialTab === 'accounts') {
        const platforms = [
            { id: 'twitter', name: 'تويتر', icon: '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>', color: '#1da1f2' },
            { id: 'instagram', name: 'إنستغرام', icon: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>', color: '#E1306C' },
            { id: 'facebook', name: 'فيسبوك', icon: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>', color: '#1877F2' },
            { id: 'snapchat', name: 'سناب شات', icon: '<svg width="24" height="24" viewBox="147.353 39.286 514.631 514.631" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path style="fill:#FFFC00;" d="M147.553,423.021v0.023c0.308,11.424,0.403,22.914,2.33,34.268 c2.042,12.012,4.961,23.725,10.53,34.627c7.529,14.756,17.869,27.217,30.921,37.396c9.371,7.309,19.608,13.111,30.94,16.771 c16.524,5.33,33.571,7.373,50.867,7.473c10.791,0.068,21.575,0.338,32.37,0.293c78.395-0.33,156.792,0.566,235.189-0.484 c10.403-0.141,20.636-1.41,30.846-3.277c19.569-3.582,36.864-11.932,51.661-25.133c17.245-15.381,28.88-34.205,34.132-56.924 c3.437-14.85,4.297-29.916,4.444-45.035v-3.016c0-1.17-0.445-256.892-0.486-260.272c-0.115-9.285-0.799-18.5-2.54-27.636 c-2.117-11.133-5.108-21.981-10.439-32.053c-5.629-10.641-12.68-20.209-21.401-28.57c-13.359-12.81-28.775-21.869-46.722-26.661 c-16.21-4.327-32.747-5.285-49.405-5.27c-0.027-0.004-0.09-0.173-0.094-0.255H278.56c-0.005,0.086-0.008,0.172-0.014,0.255 c-9.454,0.173-18.922,0.102-28.328,1.268c-10.304,1.281-20.509,3.21-30.262,6.812c-15.362,5.682-28.709,14.532-40.11,26.347 c-12.917,13.386-22.022,28.867-26.853,46.894c-4.31,16.084-5.248,32.488-5.271,49.008"></path><path style="fill:#FFFFFF;" d="M407.001,473.488c-1.068,0-2.087-0.039-2.862-0.076c-0.615,0.053-1.25,0.076-1.886,0.076 c-22.437,0-37.439-10.607-50.678-19.973c-9.489-6.703-18.438-13.031-28.922-14.775c-5.149-0.854-10.271-1.287-15.22-1.287 c-8.917,0-15.964,1.383-21.109,2.389c-3.166,0.617-5.896,1.148-8.006,1.148c-2.21,0-4.895-0.49-6.014-4.311 c-0.887-3.014-1.523-5.934-2.137-8.746c-1.536-7.027-2.65-11.316-5.281-11.723c-28.141-4.342-44.768-10.738-48.08-18.484 c-0.347-0.814-0.541-1.633-0.584-2.443c-0.129-2.309,1.501-4.334,3.777-4.711c22.348-3.68,42.219-15.492,59.064-35.119 c13.049-15.195,19.457-29.713,20.145-31.316c0.03-0.072,0.065-0.148,0.101-0.217c3.247-6.588,3.893-12.281,1.926-16.916 c-3.626-8.551-15.635-12.361-23.58-14.882c-1.976-0.625-3.845-1.217-5.334-1.808c-7.043-2.782-18.626-8.66-17.083-16.773 c1.124-5.916,8.949-10.036,15.273-10.036c1.756,0,3.312,0.308,4.622,0.923c7.146,3.348,13.575,5.045,19.104,5.045 c6.876,0,10.197-2.618,11-3.362c-0.198-3.668-0.44-7.546-0.674-11.214c0-0.004-0.005-0.048-0.005-0.048 c-1.614-25.675-3.627-57.627,4.546-75.95c24.462-54.847,76.339-59.112,91.651-59.112c0.408,0,6.674-0.062,6.674-0.062 c0.283-0.005,0.59-0.009,0.908-0.009c15.354,0,67.339,4.27,91.816,59.15c8.173,18.335,6.158,50.314,4.539,76.016l-0.076,1.23 c-0.222,3.49-0.427,6.793-0.6,9.995c0.756,0.696,3.795,3.096,9.978,3.339c5.271-0.202,11.328-1.891,17.998-5.014 c2.062-0.968,4.345-1.169,5.895-1.169c2.343,0,4.727,0.456,6.714,1.285l0.106,0.041c5.66,2.009,9.367,6.024,9.447,10.242 c0.071,3.932-2.851,9.809-17.223,15.485c-1.472,0.583-3.35,1.179-5.334,1.808c-7.952,2.524-19.951,6.332-23.577,14.878 c-1.97,4.635-1.322,10.326,1.926,16.912c0.036,0.072,0.067,0.145,0.102,0.221c1,2.344,25.205,57.535,79.209,66.432 c2.275,0.379,3.908,2.406,3.778,4.711c-0.048,0.828-0.248,1.656-0.598,2.465c-3.289,7.703-19.915,14.09-48.064,18.438 c-2.642,0.408-3.755,4.678-5.277,11.668c-0.63,2.887-1.271,5.717-2.146,8.691c-0.819,2.797-2.641,4.164-5.567,4.164h-0.441 c-1.905,0-4.604-0.346-8.008-1.012c-5.95-1.158-12.623-2.236-21.109-2.236c-4.948,0-10.069,0.434-15.224,1.287 c-10.473,1.744-19.421,8.062-28.893,14.758C444.443,462.88,429.436,473.488,407.001,473.488"></path><path style="fill:#020202;" d="M408.336,124.235c14.455,0,64.231,3.883,87.688,56.472c7.724,17.317,5.744,48.686,4.156,73.885 c-0.248,3.999-0.494,7.875-0.694,11.576l-0.084,1.591l1.062,1.185c0.429,0.476,4.444,4.672,13.374,5.017l0.144,0.008l0.15-0.003 c5.904-0.225,12.554-2.059,19.776-5.442c1.064-0.498,2.48-0.741,3.978-0.741c1.707,0,3.521,0.321,5.017,0.951l0.226,0.09 c3.787,1.327,6.464,3.829,6.505,6.093c0.022,1.28-0.935,5.891-14.359,11.194c-1.312,0.518-3.039,1.069-5.041,1.7 c-8.736,2.774-21.934,6.96-26.376,17.427c-2.501,5.896-1.816,12.854,2.034,20.678c1.584,3.697,26.52,59.865,82.631,69.111 c-0.011,0.266-0.079,0.557-0.229,0.9c-0.951,2.24-6.996,9.979-44.612,15.783c-5.886,0.902-7.328,7.5-9,15.17 c-0.604,2.746-1.218,5.518-2.062,8.381c-0.258,0.865-0.306,0.914-1.233,0.914c-0.128,0-0.278,0-0.442,0 c-1.668,0-4.2-0.346-7.135-0.922c-5.345-1.041-12.647-2.318-21.982-2.318c-5.21,0-10.577,0.453-15.962,1.352 c-11.511,1.914-20.872,8.535-30.786,15.543c-13.314,9.408-27.075,19.143-48.071,19.143c-0.917,0-1.812-0.031-2.709-0.076 l-0.236-0.01l-0.237,0.018c-0.515,0.045-1.034,0.068-1.564,0.068c-20.993,0-34.76-9.732-48.068-19.143 c-9.916-7.008-19.282-13.629-30.791-15.543c-5.38-0.896-10.752-1.352-15.959-1.352c-9.333,0-16.644,1.428-21.978,2.471 c-2.935,0.574-5.476,1.066-7.139,1.066c-1.362,0-1.388-0.08-1.676-1.064c-0.844-2.865-1.461-5.703-2.062-8.445 c-1.676-7.678-3.119-14.312-9.002-15.215c-37.613-5.809-43.659-13.561-44.613-15.795c-0.149-0.352-0.216-0.652-0.231-0.918 c56.11-9.238,81.041-65.408,82.63-69.119c3.857-7.818,4.541-14.775,2.032-20.678c-4.442-10.461-17.638-14.653-26.368-17.422 c-2.007-0.635-3.735-1.187-5.048-1.705c-11.336-4.479-14.823-8.991-14.305-11.725c0.601-3.153,6.067-6.359,10.837-6.359 c1.072,0,2.012,0.173,2.707,0.498c7.747,3.631,14.819,5.472,21.022,5.472c9.751,0,14.091-4.537,14.557-5.055l1.057-1.182 l-0.085-1.583c-0.197-3.699-0.44-7.574-0.696-11.565c-1.583-25.205-3.563-56.553,4.158-73.871 c23.37-52.396,72.903-56.435,87.525-56.435c0.36,0,6.717-0.065,6.717-0.065C407.744,124.239,408.033,124.235,408.336,124.235 M408.336,115.197h-0.017c-0.333,0-0.646,0-0.944,0.004c-2.376,0.024-6.282,0.062-6.633,0.066c-8.566,0-25.705,1.21-44.115,9.336 c-10.526,4.643-19.994,10.921-28.14,18.66c-9.712,9.221-17.624,20.59-23.512,33.796c-8.623,19.336-6.576,51.905-4.932,78.078 l0.006,0.041c0.176,2.803,0.361,5.73,0.53,8.582c-1.265,0.581-3.316,1.194-6.339,1.194c-4.864,0-10.648-1.555-17.187-4.619 c-1.924-0.896-4.12-1.349-6.543-1.349c-3.893,0-7.997,1.146-11.557,3.239c-4.479,2.63-7.373,6.347-8.159,10.468 c-0.518,2.726-0.493,8.114,5.492,13.578c3.292,3.008,8.128,5.782,14.37,8.249c1.638,0.645,3.582,1.261,5.641,1.914 c7.145,2.271,17.959,5.702,20.779,12.339c1.429,3.365,0.814,7.793-1.823,13.145c-0.069,0.146-0.138,0.289-0.201,0.439 c-0.659,1.539-6.807,15.465-19.418,30.152c-7.166,8.352-15.059,15.332-23.447,20.752c-10.238,6.617-21.316,10.943-32.923,12.855 c-4.558,0.748-7.813,4.809-7.559,9.424c0.078,1.33,0.39,2.656,0.931,3.939c0.004,0.008,0.009,0.016,0.013,0.023 c1.843,4.311,6.116,7.973,13.063,11.203c8.489,3.943,21.185,7.26,37.732,9.855c0.836,1.59,1.704,5.586,2.305,8.322 c0.629,2.908,1.285,5.898,2.22,9.074c1.009,3.441,3.626,7.553,10.349,7.553c2.548,0,5.478-0.574,8.871-1.232 c4.969-0.975,11.764-2.305,20.245-2.305c4.702,0,9.575,0.414,14.48,1.229c9.455,1.574,17.606,7.332,27.037,14 c13.804,9.758,29.429,20.803,53.302,20.803c0.651,0,1.304-0.021,1.949-0.066c0.789,0.037,1.767,0.066,2.799,0.066 c23.88,0,39.501-11.049,53.29-20.799l0.022-0.02c9.433-6.66,17.575-12.41,27.027-13.984c4.903-0.814,9.775-1.229,14.479-1.229 c8.102,0,14.517,1.033,20.245,2.15c3.738,0.736,6.643,1.09,8.872,1.09l0.218,0.004h0.226c4.917,0,8.53-2.699,9.909-7.422 c0.916-3.109,1.57-6.029,2.215-8.986c0.562-2.564,1.46-6.674,2.296-8.281c16.558-2.6,29.249-5.91,37.739-9.852 c6.931-3.215,11.199-6.873,13.053-11.166c0.556-1.287,0.881-2.621,0.954-3.979c0.261-4.607-2.999-8.676-7.56-9.424 c-51.585-8.502-74.824-61.506-75.785-63.758c-0.062-0.148-0.132-0.295-0.205-0.438c-2.637-5.354-3.246-9.777-1.816-13.148 c2.814-6.631,13.621-10.062,20.771-12.332c2.07-0.652,4.021-1.272,5.646-1.914c7.039-2.78,12.07-5.796,15.389-9.221 c3.964-4.083,4.736-7.995,4.688-10.555c-0.121-6.194-4.856-11.698-12.388-14.393c-2.544-1.052-5.445-1.607-8.399-1.607 c-2.011,0-4.989,0.276-7.808,1.592c-6.035,2.824-11.441,4.368-16.082,4.588c-2.468-0.125-4.199-0.66-5.32-1.171 c0.141-2.416,0.297-4.898,0.458-7.486l0.067-1.108c1.653-26.19,3.707-58.784-4.92-78.134c-5.913-13.253-13.853-24.651-23.604-33.892 c-8.178-7.744-17.678-14.021-28.242-18.661C434.052,116.402,416.914,115.197,408.336,115.197"></path><rect x="147.553" y="39.443" style="fill:none;" width="514.231" height="514.23"></rect></g></svg>', color: '#eab308' },
            { id: 'youtube', name: 'يوتيوب', icon: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>', color: '#FF0000' },
            { id: 'tiktok', name: 'تيك توك', icon: '<path d="M9 12a4 4 0 1 0 4 4V0h5v5a6 6 0 0 1-6 6v5a2 2 0 1 1-2-2z"></path>', color: '#000000' },
            { id: 'linkedin', name: 'لينكد إن', icon: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>', color: '#0A66C2' }
        ];

        let accCards = platforms.map(p => {
            const currentBoard = typeof activeBoard !== 'undefined' ? activeBoard : (window.activeBoard || null);
            const isConnected = currentBoard && currentBoard.connectedAccounts && currentBoard.connectedAccounts[p.id];
            
            const statusHtml = isConnected 
                ? '<span class="sm-status connected" style="color: #16a34a; background: #dcfce7; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">متصل</span>'
                : '<span class="sm-status disconnected">غير متصل</span>';
            
            const btnHtml = isConnected
                ? `<button class="sm-btn-outline" style="color: #dc2626; border: 1px solid #fecaca; background: #fef2f2; width: 100%; padding: 8px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;" onclick="window.toggleSocialAccount('${p.id}')">إلغاء الربط</button>`
                : `<button class="sm-btn-primary" onclick="window.toggleSocialAccount('${p.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> ربط الحساب</button>`;
                
            return `
            <div class="sm-account-card">
                <div class="sm-platform-info">
                    <div class="sm-platform-logo" style="background:${p.color};">
                        ${p.icon.startsWith('<svg') ? p.icon : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.icon}</svg>`}
                    </div>
                    <div>
                        <h4>${p.name}</h4>
                        ${statusHtml}
                    </div>
                </div>
                <p class="sm-acc-desc">${isConnected ? 'هذا الحساب متصل وجاهز للنشر' : 'اربط حسابك للنشر التلقائي'}</p>
                ${btnHtml}
            </div>
            `;
        }).join('');

        mainContentHtml = `
            <div class="sm-full-view" style="padding-top: 0; min-height: 0;">
                <div class="sm-accounts-banner">
                    <div class="sm-acc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>
                    <div class="sm-acc-text">
                        <h3>ربط الحسابات</h3>
                        <p>قم بربط حساباتك لتمكين النشر التلقائي، يمكنك اختيار منصات متعددة للنشر في وقت واحد.</p>
                    </div>
                </div>
                <div class="sm-accounts-grid">
                    ${accCards}
                </div>
            </div>
        `;
    } else if (window.activeSocialTab === 'history') {
        mainContentHtml = `
            <div class="sm-full-view" style="padding-top: 0; min-height: 0;">
                <div class="sm-history-top-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <div class="sm-filter-group" style="display:flex; gap:12px;">
                        <select class="sm-select"><option>كل الأحداث</option></select>
                        <select class="sm-select"><option>كل المنصات</option></select>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <button class="sm-link-btn" style="color:#0c66e4; font-size:13px; font-weight:600; text-decoration:none;">تحديث <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.45l5.08 5.08"/></svg></button>
                    </div>
                </div>
                <div class="sm-history-banner blue-banner">
                    <div style="display:flex; gap: 16px; align-items:center;">
                        <div class="sm-hb-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0c66e4" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>
                        <div class="sm-hb-text">
                            <h4>سجل النشر المباشر</h4>
                            <p>تابع حالة منشوراتك لحظة بلحظة — نُشر، فشل، مجدول، أو يحتاج لتدخل.</p>
                        </div>
                    </div>
                    <button class="sm-link-btn" style="color:#0c66e4; font-size:13px; font-weight:600; text-decoration:none;">تعيين الكل كمقروء</button>
                </div>
                <div class="sm-history-empty" style="text-align:center; padding: 60px 20px;">
                    <div class="sm-he-icon" style="background:#f4f5f7; width:64px; height:64px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                    <p style="font-size:15px; font-weight:600; color:#4a5568; margin:0 0 8px;">لا توجد أحداث نشر بعد</p>
                    <span style="font-size:13px; color:#a0aec0;">ستظهر هنا تحديثات منشوراتك فور حدوثها</span>
                </div>
            </div>
        `;
    }
    window.activePreviewPlatform = window.activePreviewPlatform || null;
    window.openSocialLinkModal = function(title, defaultValue, onSave) {
        const existing = document.getElementById('social-link-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'social-link-modal-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '100001',
            backdropFilter: 'blur(4px)',
            opacity: '0',
            transition: 'opacity 0.2s ease',
            direction: 'rtl',
            fontFamily: 'inherit'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: '#fff',
            borderRadius: '16px',
            padding: '24px',
            width: '90%',
            maxWidth: '380px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            transform: 'scale(0.95)',
            transition: 'transform 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        });

        const header = document.createElement('h3');
        header.textContent = title;
        Object.assign(header.style, {
            margin: '0',
            fontSize: '18px',
            fontWeight: '700',
            color: '#0f172a'
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue || '';
        input.placeholder = 'https://...';
        input.dir = 'ltr';
        Object.assign(input.style, {
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '2px solid #e2e8f0',
            fontSize: '15px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s'
        });
        input.onfocus = () => input.style.borderColor = '#ea580c';
        input.onblur = () => input.style.borderColor = '#e2e8f0';
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                onSave(input.value);
                close();
            } else if (e.key === 'Escape') {
                close();
            }
        };

        const btnWrapper = document.createElement('div');
        Object.assign(btnWrapper.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '4px'
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'إلغاء';
        Object.assign(cancelBtn.style, {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#f1f5f9',
            color: '#475569',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s'
        });
        cancelBtn.onmouseover = () => cancelBtn.style.background = '#e2e8f0';
        cancelBtn.onmouseout = () => cancelBtn.style.background = '#f1f5f9';
        cancelBtn.onclick = () => close();

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'حفظ';
        Object.assign(saveBtn.style, {
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#ea580c',
            color: '#fff',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.2)'
        });
        saveBtn.onmouseover = () => {
            saveBtn.style.background = '#c2410c';
            saveBtn.style.transform = 'translateY(-1px)';
        };
        saveBtn.onmouseout = () => {
            saveBtn.style.background = '#ea580c';
            saveBtn.style.transform = 'none';
        };
        saveBtn.onclick = () => {
            onSave(input.value);
            close();
        };

        function close() {
            overlay.style.opacity = '0';
            modal.style.transform = 'scale(0.95)';
            setTimeout(() => overlay.remove(), 200);
        }

        btnWrapper.appendChild(cancelBtn);
        btnWrapper.appendChild(saveBtn);
        modal.appendChild(header);
        modal.appendChild(input);
        modal.appendChild(btnWrapper);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'scale(1)';
            input.focus();
            if (input.value) {
                input.setSelectionRange(0, input.value.length);
            }
        });
    };

    window.handleSocialIconContextMenu = function(event, platform) {
        event.preventDefault();
        
        // Remove existing menu if any
        const existingMenu = document.getElementById('custom-social-context-menu');
        if (existingMenu) existingMenu.remove();

        // Clear previous generic event listeners if any
        if (window.__socialContextMenuCleanups) {
            window.__socialContextMenuCleanups.forEach(fn => fn());
        }
        window.__socialContextMenuCleanups = [];

        // Get saved link per board
        const boardPrefix = typeof activeBoardId !== 'undefined' ? activeBoardId : 'default';
        const storageKey = `social_link_${boardPrefix}_${platform}`;
        const savedLink = localStorage.getItem(storageKey);
        
        // Platform Arabic names
        const platformNames = {
            facebook: 'فيسبوك',
            instagram: 'إنستغرام',
            twitter: 'تويتر',
            linkedin: 'لينكد إن',
            tiktok: 'تيك توك',
            snapchat: 'سناب شات'
        };
        const pName = platformNames[platform] || platform;

        // Create menu container
        const menu = document.createElement('div');
        menu.id = 'custom-social-context-menu';
        menu.style.position = 'absolute';
        menu.style.left = `${event.pageX}px`;
        menu.style.top = `${event.pageY}px`;
        menu.style.background = '#fff';
        menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        menu.style.borderRadius = '8px';
        menu.style.padding = '8px 0';
        menu.style.zIndex = '100000';
        menu.style.minWidth = '150px';
        menu.style.fontFamily = 'inherit';

        function createMenuItem(text, onClick) {
            const item = document.createElement('div');
            item.textContent = text;
            item.style.padding = '8px 16px';
            item.style.cursor = 'pointer';
            item.style.fontSize = '14px';
            item.style.color = '#333';
            item.style.transition = 'background 0.2s';
            item.onmouseover = () => item.style.background = '#f1f5f9';
            item.onmouseout = () => item.style.background = 'transparent';
            item.onclick = (e) => {
                e.stopPropagation();
                menu.remove();
                onClick();
            };
            return item;
        }

        if (savedLink) {
            menu.appendChild(createMenuItem(`عرض ${pName}`, () => {
                let url = savedLink;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                window.open(url, '_blank');
            }));
            menu.appendChild(createMenuItem('تعديل الرابط', () => {
                window.openSocialLinkModal(`تعديل رابط ${pName}`, savedLink, (newLink) => {
                    if (newLink !== null) {
                        localStorage.setItem(storageKey, newLink.trim());
                    }
                });
            }));
        } else {
            menu.appendChild(createMenuItem('إضافة رابط', () => {
                window.openSocialLinkModal(`إضافة رابط لـ ${pName}`, '', (newLink) => {
                    if (newLink && newLink.trim() !== '') {
                        localStorage.setItem(storageKey, newLink.trim());
                    }
                });
            }));
        }

        document.body.appendChild(menu);

        // Dismiss menu on outside or right click
        const closeMenu = (e) => {
            const m = document.getElementById('custom-social-context-menu');
            if (m && !m.contains(e.target)) {
                m.remove();
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('contextmenu', closeMenu);
            window.__socialContextMenuCleanups.push(() => {
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('contextmenu', closeMenu);
            });
        }, 10);
    };

    window.handleSocialIconClick = function(platform, element) {
        const linkBtnContainer = document.getElementById('sm-sidebar-link-btn-container');
        
        if (window.activePreviewPlatform === platform) {
            window.activePreviewPlatform = null;
            element.parentElement.querySelectorAll('div').forEach(el=>el.style.border='2px solid transparent');
            if (linkBtnContainer) {
                linkBtnContainer.style.display = 'none';
                linkBtnContainer.innerHTML = '';
            }
        } else {
            window.activePreviewPlatform = platform;
            element.parentElement.querySelectorAll('div').forEach(el=>el.style.border='2px solid transparent');
            const colors = {facebook: '#0ea5e9', instagram: '#ec4899', twitter: '#0f172a', linkedin: '#2563eb', tiktok: '#18181b', snapchat: '#ca8a04'};
            element.style.border = '2px solid ' + colors[platform];
            
            if (linkBtnContainer) {
                const boardPrefix = typeof activeBoardId !== 'undefined' ? activeBoardId : 'default';
                const storageKey = `social_link_${boardPrefix}_${platform}`;
                const savedLink = localStorage.getItem(storageKey);
                
                const platformNames = {
                    facebook: 'فيسبوك',
                    instagram: 'إنستغرام',
                    twitter: 'تويتر',
                    linkedin: 'لينكد إن',
                    tiktok: 'تيك توك',
                    snapchat: 'سناب شات'
                };
                const pName = platformNames[platform] || platform;

                linkBtnContainer.style.display = 'block';
                if (savedLink) {
                    linkBtnContainer.innerHTML = `<button onclick="let url = '${savedLink}'; if (!url.startsWith('http://') && !url.startsWith('https://')) { url = 'https://' + url; } window.open(url, '_blank');" style="width:100%; background:white; color:${colors[platform]}; border:1px solid ${colors[platform]}; padding:6px 10px; border-radius:6px; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px; margin-top:12px;" onmouseover="this.style.background='${colors[platform]}'; this.style.color='white';" onmouseout="this.style.background='white'; this.style.color='${colors[platform]}';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        عرض منصة ${pName}
                    </button>`;
                } else {
                    linkBtnContainer.innerHTML = `<button onclick="window.openSocialLinkModal('إضافة رابط لـ ${pName}', '', (newLink) => { if(newLink && newLink.trim() !== '') { localStorage.setItem('${storageKey}', newLink.trim()); window.activePreviewPlatform = null; window.handleSocialIconClick('${platform}', document.querySelector('.sm-selected-date-text div[onclick*=\\'${platform}\\']')); } });" style="width:100%; background:white; color:#64748b; border:1px dashed #cbd5e0; padding:6px 10px; border-radius:6px; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px; margin-top:12px;" onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#94a3b8'; this.style.color='#334155';" onmouseout="this.style.background='white'; this.style.borderColor='#cbd5e0'; this.style.color='#64748b';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        إضافة رابط ${pName}
                    </button>`;
                }
            }
        }
        const selectedCell = document.querySelector('.sm-cal-cell.selected');
        if (selectedCell) selectedCell.click();
    };

    const html = `
        <div class="sm-app-wrapper" style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#f4f5f7; direction:rtl;">
            ${(window.isClientView || window.activeSocialTab === 'calendar') ? '' : universalHeaderHtml}
            ${mainContentHtml}
        </div>
    `;

    appContainer.innerHTML = html;

    const socialClientTabsEl = document.getElementById('socialClientTabs');
    if (socialClientTabsEl && window.Sortable && !window.isClientView) {
        // Add ghost styles dynamically if they don't exist
        if (!document.getElementById('sortableGhostStyles')) {
            const style = document.createElement('style');
            style.id = 'sortableGhostStyles';
            style.innerHTML = `
                .sortable-ghost { opacity: 0.4; }
                .sortable-fallback { cursor: grabbing !important; z-index: 99999 !important; }
            `;
            document.head.appendChild(style);
        }

        new window.Sortable(socialClientTabsEl, {
            animation: 150,
            direction: 'horizontal',
            forceFallback: true, // Fixes HTML5 drag issues with RTL horizontal flex containers
            fallbackClass: "sortable-fallback",
            ghostClass: "sortable-ghost",
            fallbackTolerance: 5, // Prevent accidental drags when just clicking
            filter: ".sm-non-draggable",
            onMove: function (evt) {
                if (evt.related.classList.contains('sm-non-draggable')) {
                    return false;
                }
            },
            onEnd: function(evt) {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex === newIndex) return;

                const draggedBoardId = evt.item.getAttribute('data-id');
                
                const allSocials = boards.filter(b => b.type === 'social_scheduler');
                const agencySocials = allSocials.slice(0, 2);
                let clientSocials = allSocials.slice(2);
                
                const draggedBoard = clientSocials.find(b => b.id === draggedBoardId);
                if (!draggedBoard) return;
                clientSocials = clientSocials.filter(b => b.id !== draggedBoardId);
                clientSocials.splice(newIndex, 0, draggedBoard);
                
                const otherBoards = boards.filter(b => b.type !== 'social_scheduler');
                boards = [...otherBoards, ...agencySocials, ...clientSocials];
                
                if (typeof saveState === 'function') saveState();
            }
        });
    }

    const tabs = appContainer.querySelectorAll('.sm-tab');
    tabs.forEach(tab => {
        if(tab) tab.onclick = () => {
            window.activeSocialTab = tab.dataset.tab;
            renderSocialSchedulerApp(activeBoard);
        };
    });

    if (window.activeSocialTab === 'calendar') {
        const cells = appContainer.querySelectorAll('.sm-cal-cell:not(.empty)');
        const sidebarDayName = appContainer.querySelector('.sm-selected-date-text h3');
        const sidebarDateFull = appContainer.querySelector('.sm-selected-date-text p');
        
        cells.forEach(cell => {
            if(cell) cell.onclick = () => {
                cells.forEach(c => c.classList.remove('selected'));
                cell.classList.add('selected');
                
                const dateNum = parseInt(cell.querySelector('.sm-cal-date').textContent, 10);
                const clickedDate = new Date(currentYear, currentMonth, dateNum);
                const dayOfWeekArabic = dayNamesArabic[clickedDate.getDay()];
                
                window.activeSocialDateOptions = { year: currentYear, month: currentMonth, date: dateNum };
                
                sidebarDayName.textContent = dayOfWeekArabic;
                sidebarDateFull.textContent = `${dateNum} ${monthNamesArabic[currentMonth]}`;
                
                // Render the day's posts into the sidebar
                const todayPosts = (activeBoard.cards || []).filter(c => c.dateStr === `${currentYear}-${currentMonth}-${dateNum}` && (window.smShowClientEditsToggle !== false || !c.isClientDayNote));
                const postCountEl = appContainer.querySelector('.sm-post-count');
                const sidebarBody = appContainer.querySelector('.sm-sidebar-body');
                
                if (postCountEl) postCountEl.textContent = todayPosts.length;
                
                if (window.activePreviewPlatform === 'instagram') {
                    let allBoardPosts = [];
                    if (activeBoard && activeBoard.cards) {
                        allBoardPosts = activeBoard.cards.filter(p => {
                            let hasMedia = (p.mediaItems && p.mediaItems.length > 0 && p.mediaItems[0].dataUrl && p.mediaItems[0].dataUrl !== 'undefined') || 
                                           (p.mediaItems && p.mediaItems.length > 0 && p.mediaItems[0].type === 'frame-io') ||
                                           (p.mediaObj && p.mediaObj.dataUrl && p.mediaObj.dataUrl !== 'undefined') ||
                                           (p.cover && (p.cover.scaled || typeof p.cover === 'string'));
                            if (window.smShowClientEditsToggle === false && p.isClientDayNote) return false;
                            return hasMedia || p.title;
                        });
                        allBoardPosts.sort((a, b) => {
                            if (!a.dateStr) return 1;
                            if (!b.dateStr) return -1;
                            const d1 = new Date(a.dateStr).getTime();
                            const d2 = new Date(b.dateStr).getTime();
                            return d2 - d1;
                        });
                    }

                    // Also dynamically update the grid post count
                    const igPostsCountDisplay = document.querySelector('.ig-mockup span.posts-count');
                    if (igPostsCountDisplay) igPostsCountDisplay.textContent = allBoardPosts.length > 0 ? allBoardPosts.length : 0;
                    
                    let gridItemsHtml = '';
                    if (allBoardPosts.length === 0) {
                        for (let i = 0; i < 9; i++) {
                            gridItemsHtml += `<div style="aspect-ratio:1/1; position:relative; background:#f0f4f8;"></div>`;
                        }
                    } else {
                        for (let i = 0; i < allBoardPosts.length; i++) {
                            const p = allBoardPosts[i];
                            let itemMedia = null;
                            if (p.mediaItems && p.mediaItems.length > 0 && p.mediaItems[0].dataUrl && p.mediaItems[0].dataUrl !== 'undefined') {
                                itemMedia = p.mediaItems[0].dataUrl;
                            } else if (p.mediaItems && p.mediaItems.length > 0 && p.mediaItems[0].type === 'frame-io') {
                                itemMedia = p.mediaItems[0].thumbnail || 'FRAME_IO';
                            } else if (p.mediaObj && p.mediaObj.dataUrl && p.mediaObj.dataUrl !== 'undefined') {
                                itemMedia = p.mediaObj.dataUrl;
                            } else if (p.cover && p.cover.scaled && p.cover.scaled.length > 0) {
                                itemMedia = p.cover.scaled[p.cover.scaled.length - 1].url;
                            } else if (p.cover && typeof p.cover === 'string' && p.cover.startsWith('http')) {
                                itemMedia = p.cover;
                            }
                            
                            if (itemMedia === 'FRAME_IO') {
                                gridItemsHtml += `<div style="aspect-ratio:1/1; position:relative; background:#1e293b; color:#e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;" onclick="window.openCreatePostModal('${p.id}')">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                                    <span style="font-size:10px; margin-top:8px; font-weight:bold;">Frame.io</span>
                                </div>`;
                            } else if (itemMedia) {
                                gridItemsHtml += `<div style="aspect-ratio:1/1; position:relative; background:#f0f0f0; cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'" onclick="window.openCreatePostModal('${p.id}')">
                                    <img src="${itemMedia}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'display:flex; align-items:center; justify-content:center; height:100%; padding:8px; text-align:center; font-size:10px; color:#ef4444; background:#fee2e2;\\'>تعذر تحميل الصورة</div>'">
                                </div>`;

                            } else {
                                gridItemsHtml += `<div style="aspect-ratio:1/1; background:#f0f4f8; display:flex; align-items:center; justify-content:center; padding:8px; text-align:center; font-size:12px; color:#334155; font-weight:700; overflow:hidden; cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'" onclick="window.openCreatePostModal('${p.id}')">${p.title || 'منشور'}</div>`;
                            }
                        }
                    }

                    let currentPlatformStr = 'عامة';
                    let editBg = '#f0fdf4';
                    let editBorder = '#bbf7d0';
                    let editText = '#16a34a';
                    let editFocus = 'rgba(34,197,94,0.2)';
                    
                    if (window.activePreviewPlatform === 'instagram') {
                        currentPlatformStr = 'على الانستغرام';
                        editBg = '#fcf5f8'; 
                        editBorder = '#fbcfe8'; 
                        editText = '#db2777'; 
                        editFocus = 'rgba(219,39,119,0.2)';
                    } else if (window.activePreviewPlatform === 'tiktok') {
                        currentPlatformStr = 'على التيك توك';
                        editBg = '#f8fafc';
                        editBorder = '#e2e8f0';
                        editText = '#334155';
                        editFocus = 'rgba(51,65,85,0.2)';
                    } else if (window.activePreviewPlatform === 'facebook') {
                        currentPlatformStr = 'على الفيسبوك';
                        editBg = '#eff6ff';
                        editBorder = '#bfdbfe';
                        editText = '#1d4ed8';
                        editFocus = 'rgba(29,78,216,0.2)';
                    } else if (window.activePreviewPlatform === 'linkedin') {
                        currentPlatformStr = 'على لينكد إن';
                        editBg = '#eff6ff';
                        editBorder = '#bae6fd';
                        editText = '#0284c7';
                        editFocus = 'rgba(2,132,199,0.2)';
                    } else if (window.activePreviewPlatform === 'twitter') {
                        currentPlatformStr = 'على منصة X';
                        editBg = '#f8fafc';
                        editBorder = '#cbd5e1';
                        editText = '#0f172a';
                        editFocus = 'rgba(15,23,42,0.2)';
                    }

                    const boardEditsHtml = window.isClientView 
                        ? `
                        <div style="width: 100%; max-width: 315px; margin: -40px auto 16px auto; text-align: right;" dir="rtl">
                            <label style="display:block; color: ${editText}; font-size: 15px; font-weight: 700; margin-bottom: 8px;">هل هناك تعديلات ${currentPlatformStr}؟</label>
                            <textarea dir="rtl" onblur="this.style.boxShadow='none'; if(typeof activeBoard !== 'undefined'){ activeBoard.clientBoardEdits = this.value; if(typeof saveState === 'function') saveState(); }" onfocus="this.style.boxShadow='0 0 0 3px ${editFocus}'" placeholder="اكتب ملاحظاتك هنا..." style="width:100%; min-height: 85px; border: 1px solid ${editBorder}; background: ${editBg}; border-radius: 12px; padding: 12px; font-size: 13px; outline:none; resize: vertical; box-sizing: border-box; transition: all 0.2s; color: ${editText};">${activeBoard.clientBoardEdits || ''}</textarea>
                        </div>
                        ` 
                        : (activeBoard.clientBoardEdits ? `
                        <div style="width: 100%; max-width: 315px; margin: -40px auto 16px auto; background:${editBg}; border:1px solid ${editBorder}; border-radius:12px; padding:12px; text-align: right;" dir="rtl">
                            <label style="display:block; color: ${editText}; font-size: 13px; font-weight: 700; margin-bottom: 6px;">تعديلات ${currentPlatformStr} من العميل:</label>
                            <div style="font-size: 13px; color: ${editText}; white-space: pre-wrap; line-height: 1.5;">${window.smEscapeHTML ? window.smEscapeHTML(activeBoard.clientBoardEdits) : activeBoard.clientBoardEdits}</div>
                        </div>
                        ` : '');

                    sidebarBody.innerHTML = `
                        ${boardEditsHtml}
                        <div style="display:flex; justify-content:center; padding:0; transform: scale(0.92); transform-origin: top center; margin-top: -15px;">
                            <div style="width:340px; height:700px; border:14px solid #111; border-radius:36px; overflow:hidden; position:relative; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); background:#fff; flex-shrink:0;">
                                <!-- Front Camera -->
                                <div style="position:absolute; top:12px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:#000; border-radius:50%; z-index:10; box-shadow: 0 0 0 1px rgba(255,255,255,0.05);"></div>
                                
                                <div class="ig-mockup" style="height:100%; overflow-y:auto; overflow-x:hidden; background:#fff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; direction:ltr;">
                                    ${(() => {
                                        const currentStorageKey = 'sm_ig_mockup_' + activeBoard.id;
                                        window.updateIgMockup = window.updateIgMockup || function(key, value, boardId) {
                                            const storageKey = 'sm_ig_mockup_' + boardId;
                                            const settings = JSON.parse(localStorage.getItem(storageKey)) || {
                                                username: 'm7.omar1', profilePic: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&h=150&fit=crop',
                                                name: 'محمد عمر | كيو 🛒', bioCategory: 'Shopping & retail', bioText: 'التطبيق متاح للجميع 🤯🚀🚀🔥🔥🔥🔥🔥', link: 'qeu.app'
                                            };
                                            settings[key] = value.trim();
                                            localStorage.setItem(storageKey, JSON.stringify(settings));
                                        };
                                        window.changeIgProfilePic = window.changeIgProfilePic || function(el, boardId) {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = 'image/*';
                                            input.onchange = e => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onload = event => {
                                                    const img = new Image();
                                                    img.onload = () => {
                                                        const canvas = document.createElement('canvas');
                                                        const ctx = canvas.getContext('2d');
                                                        let width = img.width;
                                                        let height = img.height;
                                                        // Cap the image to smaller dimensions for local storage
                                                        if (width > height) {
                                                            if (width > 300) { height *= 300 / width; width = 300; }
                                                        } else {
                                                            if (height > 300) { width *= 300 / height; height = 300; }
                                                        }
                                                        canvas.width = width;
                                                        canvas.height = height;
                                                        ctx.drawImage(img, 0, 0, width, height);
                                                        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                                                        
                                                        el.style.backgroundImage = "url('" + dataUrl + "')";
                                                        window.updateIgMockup('profilePic', dataUrl, boardId);
                                                    };
                                                    img.src = event.target.result;
                                                };
                                                reader.readAsDataURL(file);
                                            };
                                            input.click();
                                        };
                                        const igSettings = JSON.parse(localStorage.getItem(currentStorageKey)) || {
                                            username: 'm7.omar1', profilePic: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&h=150&fit=crop',
                                            name: 'محمد عمر | كيو 🛒', bioCategory: 'Shopping & retail', bioText: 'التطبيق متاح للجميع 🤯🚀🚀🔥🔥🔥🔥🔥', link: 'qeu.app'
                                        };
                                        return `
                                            <div style="display:flex; align-items:center; padding:18px 16px 12px; border-bottom:1px solid #efefef;">
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                                <h3 style="margin:0; font-size:16px; font-weight:700; flex-grow:1; text-align:center;">
                                                    <span contenteditable="true" spellcheck="false" onblur="window.updateIgMockup('username', this.innerText, '${activeBoard.id}')" style="outline:none; padding:2px 4px; border-radius:4px;" onfocus="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">${igSettings.username}</span> 
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#38bdf8" stroke="none" style="vertical-align:middle; margin-left:4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                                                </h3>
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                            </div>
                                            <div style="display:flex; padding:0 16px; margin-top:16px; align-items:center;">
                                                <div style="width:76px; height:76px; border-radius:50%; background:linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); padding:2px; flex-shrink:0;">
                                                    <div onclick="window.changeIgProfilePic(this, '${activeBoard.id}')" title="انقر لتغيير الصورة" style="cursor:pointer; width:100%; height:100%; border-radius:50%; border:2px solid #fff; background:url('${igSettings.profilePic}') center/cover;"></div>
                                                </div>
                                                <div style="display:flex; flex-grow:1; justify-content:space-evenly; margin-left:16px;">
                                                    <div style="display:flex; flex-direction:column; align-items:center;"><span style="font-weight:700; font-size:16px;">707</span><span style="font-size:13px; color:#262626;">posts</span></div>
                                                    <div style="display:flex; flex-direction:column; align-items:center;"><span style="font-weight:700; font-size:16px;">471K</span><span style="font-size:13px; color:#262626;">followers</span></div>
                                                    <div style="display:flex; flex-direction:column; align-items:center;"><span style="font-weight:700; font-size:16px;">1</span><span style="font-size:13px; color:#262626;">following</span></div>
                                                </div>
                                            </div>
                                            <div style="padding:12px 16px;">
                                                <div contenteditable="true" spellcheck="false" onblur="window.updateIgMockup('name', this.innerText, '${activeBoard.id}')" style="font-weight:700; font-size:14px; margin-bottom:2px; text-align:right; outline:none; padding:2px; border-radius:4px;" onfocus="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'" dir="rtl">${igSettings.name}</div>
                                                <div contenteditable="true" spellcheck="false" onblur="window.updateIgMockup('bioCategory', this.innerText, '${activeBoard.id}')" style="font-size:14px; color:#737373; margin-bottom:2px; text-align:right; outline:none; padding:2px; border-radius:4px;" onfocus="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'" dir="rtl">${igSettings.bioCategory}</div>
                                                <div contenteditable="true" spellcheck="false" onblur="window.updateIgMockup('bioText', this.innerText, '${activeBoard.id}')" style="font-size:14px; margin-bottom:4px; text-align:right; outline:none; padding:2px; border-radius:4px;" onfocus="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'" dir="rtl">${igSettings.bioText}</div>
                                                <div style="font-size:14px; font-weight:600; margin-bottom:2px; text-align:right;" dir="rtl">See translation</div>
                                                <div style="font-size:14px; color:#00376b; font-weight:600; text-align:right;" dir="rtl"><qeu contenteditable="true" spellcheck="false" onblur="window.updateIgMockup('link', this.innerText, '${activeBoard.id}')" class="app" style="outline:none; padding:2px; border-radius:4px;" onfocus="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">${igSettings.link}</qeu> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>
                                            </div>
                                        `;
                                    })()}
                                    <div style="display:flex; gap:8px; padding:0 16px 12px;">
                                        <button style="flex:1; background:#0095f6; color:#fff; border:none; border-radius:8px; padding:7px 0; font-weight:600; font-size:14px; cursor:pointer;">Follow</button>
                                        <button style="flex:1; background:#efefef; color:#000; border:none; border-radius:8px; padding:7px 0; font-weight:600; font-size:14px; cursor:pointer;">Message</button>
                                        <button style="width:34px; background:#efefef; border:none; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg></button>
                                    </div>
                                    <div style="display:flex; border-top:1px solid #efefef;">
                                        <div style="flex:1; display:flex; justify-content:center; padding:10px 0; border-top:1px solid #000;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg></div>
                                        <div style="flex:1; display:flex; justify-content:center; padding:10px 0; color:#a8a8a8;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>
                                        <div style="flex:1; display:flex; justify-content:center; padding:10px 0; color:#a8a8a8;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                                    </div>
                                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:2px; padding-bottom:12px;">
                                        ${gridItemsHtml}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (window.activePreviewPlatform) {
                    sidebarBody.innerHTML = `<div style="padding:40px 20px; text-align:center; color:#64748b; background:white; border-radius:12px; border:1px solid #e2e8f0; font-weight:600;">معاينة ${window.activePreviewPlatform} قيد التطوير...</div>`;
                } else {
                    if (todayPosts.length > 0) {
                        sidebarBody.innerHTML = todayPosts.map(p => {
                            const items = p.mediaItems || (p.mediaObj ? [p.mediaObj] : []);
                            let mediaHtmlStr = '';
                            if (items.length > 0) {
                                mediaHtmlStr = `<div style="display:flex; gap:4px; max-width:80px; flex-wrap:wrap; flex-shrink:0;">`;
                                items.slice(0,4).forEach((it, idx) => {
                                    let contentHtml = '';
                                    if (it.dataUrl && (!it.type || it.type === 'image')) {
                                        contentHtml = `<img src="${it.dataUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                                    } else if (it.thumbnail) {
                                        contentHtml = `<img src="${it.thumbnail}" style="width:100%; height:100%; object-fit:cover;">`;
                                    } else if (it.type === 'frame-io' || it.type === 'video' || (it.dataUrl && it.dataUrl.startsWith('data:video/'))) {
                                        contentHtml = `<div style="width:100%; height:100%; background:#1e293b; color:white; display:flex; align-items:center; justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
                                    } else {
                                        contentHtml = `<div style="width:100%; height:100%; background:#f8fafc; display:flex; align-items:center; justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;
                                    }
                                    mediaHtmlStr += `<div style="position:relative; width:${items.length === 1 ? '56px' : '26px'}; height:${items.length === 1 ? '56px' : '26px'}; border-radius:8px; overflow:hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                                        ${contentHtml}
                                        ${idx === 3 && items.length > 4 ? `<div style="position:absolute; top:0; right:0; width:100%; height:100%; background:rgba(0,0,0,0.6); color:white; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center;">+${items.length-4}</div>` : ''}
                                    </div>`;
                                });
                                mediaHtmlStr += `</div>`;
                            } else {
                                if (p.postType === 'video') {
                                    mediaHtmlStr = `<div style="width:56px; height:56px; border-radius:8px; background:#1e293b; color:white; border: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
                                } else {
                                    mediaHtmlStr = `<div style="width:56px; height:56px; border-radius:8px; background:#f8fafc; border: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;
                                }
                            }

                            return `
                            <div onclick="${window.isClientView ? '' : `window.openCreatePostModal('${p.id}')`}" style="${window.isClientView ? '' : 'cursor:pointer;'} background:white; border-radius:12px; padding:14px; margin-bottom:14px; border:1px solid #f1f5f9; box-shadow:0 3px 6px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.04); display:flex; gap:14px; align-items:center; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); transform: translateY(0);" onmouseover="${window.isClientView ? '' : `this.style.boxShadow='0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)'; this.style.transform='translateY(-2px)';`}" onmouseout="${window.isClientView ? '' : `this.style.boxShadow='0 3px 6px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.04)'; this.style.transform='translateY(0)';`}">
                                ${mediaHtmlStr}
                                <div style="flex-grow:1; overflow:hidden; display:flex; flex-direction:column; gap:6px;">
                                    <p style="font-size:15px; font-weight:700; color:#0f172a; margin:0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${p.title || 'منشور بدون نص'}</p>
                                    <span style="font-size:12px; background:#f3e8ff; color:#7e22ce; padding:4px 10px; border-radius:6px; font-weight:600; align-self:flex-start;">${p.status || 'مسودة'}</span>
                                </div>
                            </div>`;
                        }).join('') + (window.isClientView ? '' : `
                        <button onclick="window.openCreatePostModal()" style="width:100%; background:transparent; color:#ea580c; border:2px dashed #fdba74; padding:12px; border-radius:10px; font-weight:700; font-size:14px; cursor:pointer; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:8px;" onmouseover="this.style.background='#fff7ed'; this.style.borderColor='#ea580c';" onmouseout="this.style.background='transparent'; this.style.borderColor='#fdba74';">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            إضافة منشور آخر
                        </button>`);
                    } else {
                        sidebarBody.innerHTML = ``;
                    }
                }
            };
            
            cell.ondblclick = () => {
                if (!cell.classList.contains('selected')) {
                    cell.click();
                }
                if (window.isClientView) {
                    if (window.activeSocialDateOptions) {
                        if (!window.openClientDayNoteModal) {
                            window.openClientDayNoteModal = function(year, month, date) {
                                let overlay = document.getElementById('clientDayNoteOverlay');
                                if (!overlay) {
                                    overlay = document.createElement('div');
                                    overlay.id = 'clientDayNoteOverlay';
                                    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:99999; backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s;";
                                    
                                    overlay.innerHTML = `
                                        <div style="background:white; width:90%; max-width:400px; border-radius:12px; padding:24px; box-shadow:0 10px 25px rgba(0,0,0,0.1); transform:translateY(20px); transition:transform 0.2s; direction:rtl;">
                                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                                                <h3 style="margin:0; font-size:18px; color:#1e293b; font-weight:700;">هل هناك ملاحظات في هذا اليوم؟</h3>
                                                <button onclick="document.getElementById('clientDayNoteOverlay').style.opacity='0'; document.getElementById('clientDayNoteOverlay').firstElementChild.style.transform='translateY(20px)'; setTimeout(()=>document.getElementById('clientDayNoteOverlay').remove(), 200);" style="background:none; border:none; cursor:pointer; color:#94a3b8;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                            </div>
                                            <textarea id="clientDayNoteText" placeholder="اكتب ملاحظاتك أو طلباتك هنا..." style="width:100%; min-height:100px; border:1px solid #cbd5e1; border-radius:8px; padding:12px; font-family:inherit; font-size:14px; outline:none; resize:vertical; box-sizing:border-box; margin-bottom:16px;"></textarea>
                                            <div style="display:flex; justify-content:flex-end; gap:8px;">
                                                <button onclick="document.getElementById('clientDayNoteOverlay').style.opacity='0'; document.getElementById('clientDayNoteOverlay').firstElementChild.style.transform='translateY(20px)'; setTimeout(()=>document.getElementById('clientDayNoteOverlay').remove(), 200);" style="padding:8px 16px; border:1px solid #cbd5e1; background:white; color:#64748b; font-weight:600; border-radius:6px; cursor:pointer;">إلغاء</button>
                                                <button id="btnSaveClientNote" style="padding:8px 16px; border:none; background:#ea580c; color:white; font-weight:600; border-radius:6px; cursor:pointer;">إرسال الملاحظة</button>
                                            </div>
                                        </div>
                                    `;
                                    document.body.appendChild(overlay);
                                    
                                    document.getElementById('btnSaveClientNote').onclick = function() {
                                        const noteText = document.getElementById('clientDayNoteText').value.trim();
                                        if(!noteText) return;
                                        
                                        const board = typeof boards !== 'undefined' && typeof activeBoardId !== 'undefined' ? boards.find(b=>b.id===activeBoardId) : null;
                                        if(board) {
                                            if(!board.cards) board.cards = [];
                                            board.cards.push({
                                                id: 'post-' + Date.now(),
                                                title: noteText.substring(0, 50) + (noteText.length > 50 ? '...' : ''),
                                                fullText: noteText,
                                                dateStr: `${year}-${month}-${date}`,
                                                status: 'مسودة',
                                                clientModified: true,
                                                isClientDayNote: true
                                            });
                                            if(typeof saveState === 'function') saveState();
                                            if(typeof renderSocialSchedulerApp === 'function') renderSocialSchedulerApp(board);
                                        }
                                        
                                        document.getElementById('clientDayNoteOverlay').style.opacity='0'; 
                                        document.getElementById('clientDayNoteOverlay').firstElementChild.style.transform='translateY(20px)'; 
                                        setTimeout(()=>document.getElementById('clientDayNoteOverlay').remove(), 200);
                                    };
                                }
                                
                                requestAnimationFrame(() => {
                                    overlay.style.opacity = '1';
                                    overlay.firstElementChild.style.transform = 'translateY(0)';
                                    document.getElementById('clientDayNoteText').focus();
                                });
                            };
                        }
                        window.openClientDayNoteModal(window.activeSocialDateOptions.year, window.activeSocialDateOptions.month, window.activeSocialDateOptions.date);
                    }
                    return;
                }
                
                if (typeof window.openCreatePostModal === 'function') {
                    window.openCreatePostModal();
                }
            };
        });
        
        // Trigger click on explicitly selected day to initialize sidebar!
        const selectedCell = Array.from(cells).find(c => c.classList.contains('selected'));
        if (selectedCell) selectedCell.click();
    }

    const createBtn = appContainer.querySelector('.sm-primary-btn');
    const addEmptyBtn = appContainer.querySelector('.sm-link-btn');
    
    const openModal = () => {
        if (typeof window.openCreatePostModal === 'function') window.openCreatePostModal();
    };
    
    if (createBtn) if(createBtn) createBtn.onclick = openModal;
    if (addEmptyBtn) if(addEmptyBtn) addEmptyBtn.onclick = openModal;
}

window.showConfirmModal = function(callback, titleText, descText) {
    const modal = document.getElementById('globalConfirmModal');
    if (!modal) {
        if(callback) callback();
        return;
    }
    
    const titleEl = modal.querySelector('h3');
    const descEl = modal.querySelector('p');
    
    if (titleEl && descEl) {
        if (!titleEl.hasAttribute('data-orig')) titleEl.setAttribute('data-orig', titleEl.innerText);
        if (!descEl.hasAttribute('data-orig')) descEl.setAttribute('data-orig', descEl.innerText);
        
        titleEl.innerText = titleText || titleEl.getAttribute('data-orig');
        descEl.innerText = descText || descEl.getAttribute('data-orig');
    }
    
    const btnYes = document.getElementById('globalConfirmYesBtn');
    const btnCancel = document.getElementById('globalConfirmCancelBtn');
    
    // Clear old listeners by cloning
    const newBtnYes = btnYes.cloneNode(true);
    const newBtnCancel = btnCancel.cloneNode(true);
    btnYes.parentNode.replaceChild(newBtnYes, btnYes);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    
    modal.classList.add('active');
    
    if(newBtnYes) newBtnYes.onclick = function() {
        modal.classList.remove('active');
        if(callback) callback();
    };
    
    if(newBtnCancel) newBtnCancel.onclick = function() {
        modal.classList.remove('active');
    };
};

window.handleCalDragStart = function(event, postId) {
    if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', postId);
        event.dataTransfer.effectAllowed = 'move';
        const target = event.target;
        setTimeout(() => { if (target) target.style.opacity = '0.4'; }, 0);
    }
};

window.handleCalDrop = function(event, dropzone) {
    event.preventDefault();
    dropzone.style.background = '';
    
    if (event.dataTransfer) {
        const postId = event.dataTransfer.getData('text/plain');
        const newDateStrRaw = dropzone.getAttribute('data-date');
        
        let targetBoard = null;
        try { targetBoard = boards.find(b => b.id === activeBoardId); } catch(e) {}
        
        if (postId && newDateStrRaw && targetBoard && targetBoard.cards) {
            const cardIndex = targetBoard.cards.findIndex(c => c.id === postId);
            if (cardIndex === -1) return;
            
            // Remove the card from its current position
            const [draggedCard] = targetBoard.cards.splice(cardIndex, 1);
            draggedCard.dateStr = newDateStrRaw;
            
            // Determine visual drop index based on mouse Y coordinate
            const postsInZone = Array.from(dropzone.querySelectorAll('.sm-cal-draggable-post')).filter(el => el.getAttribute('data-post-id') !== postId);
            let dropRelativeIndex = postsInZone.length; // Default to end of day
            
            for (let i = 0; i < postsInZone.length; i++) {
                const rect = postsInZone[i].getBoundingClientRect();
                if (event.clientY < rect.top + (rect.height / 2)) {
                    dropRelativeIndex = i;
                    break;
                }
            }
            
            const dayCards = targetBoard.cards.filter(c => c.dateStr === newDateStrRaw && (window.smShowClientEditsToggle !== false || !c.isClientDayNote));
            if (dayCards.length === 0 || dropRelativeIndex >= dayCards.length) {
                // Add to the very end of the global list (which renders at the end of the day)
                targetBoard.cards.push(draggedCard);
            } else {
                // Find the global index of the card we want to insert 'before'
                const targetCardToInsertBefore = dayCards[dropRelativeIndex];
                const actualGlobalDropIndex = targetBoard.cards.findIndex(c => c.id === targetCardToInsertBefore.id);
                targetBoard.cards.splice(actualGlobalDropIndex !== -1 ? actualGlobalDropIndex : targetBoard.cards.length, 0, draggedCard);
            }
            
            if (typeof saveState === 'function') saveState();
            if (typeof render === 'function') render();
        } else {
            if (typeof render === 'function') render();
        }
    }
};

window.handleMediaUpload = function(input) {
    if (input.files && input.files.length > 0) {
        const previewContainer = document.getElementById('smMediaPreviewContainer');
        const gallery = document.getElementById('smMediaGallery');
        
        previewContainer.style.display = 'block';
        
        Array.from(input.files).forEach((file) => {
            const fileUrl = URL.createObjectURL(file);
            const wrap = document.createElement('div');
            wrap.className = 'sm-media-item-container';
            wrap.style.cssText = 'position: relative; width: 100%; max-width: 160px; border-radius: 8px; overflow: hidden; border: 1px solid #edf2f7; background: #fff; display: flex; flex-direction: column; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);';
            
            const delBtn = window.isClientView ? '' : `<button style="position: absolute; top: 6px; right: 6px; z-index: 10; background: rgba(255,255,255,0.95); color: #e53e3e; border-radius: 50%; width: 22px; height: 22px; border: none; font-size: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; line-height: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" onclick="event.stopPropagation(); window.removeMediaItem(this)">×</button>`;
            const badge = `<div class="sm-gallery-badge" style="position: absolute; top: 6px; left: 6px; z-index: 10; background: #f97316; color: white; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>`;
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const sizeBadge = `<div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 10; background: rgba(0,0,0,0.65); color: white; border-radius: 4px; padding: 3px 6px; font-size: 10px; font-weight: 500; white-space: nowrap;">MB ${sizeMB}</div>`;
            
            const isVideo = file.type.startsWith('video/');
            const mediaTypeLabel = isVideo ? 'فيديو' : 'صورة';
            const mediaElem = isVideo 
                ? `<video class="sm-gallery-vid" src="${fileUrl}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0; z-index: 1;" muted></video>`
                : `<img class="sm-gallery-img" src="${fileUrl}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0; z-index: 1;">`;
            const clickHandler = `window.viewMediaFull(this.closest('.sm-media-item-container').querySelector('.sm-gallery-vid, .sm-gallery-img').src, '${isVideo ? 'video' : 'image'}', event)`;
            
            wrap.innerHTML = `
                <div style="width: 100%; aspect-ratio: 9/16; background: #1e293b; position: relative; overflow: hidden; cursor:pointer;" onclick="${clickHandler}">
                    ${mediaElem}
                    ${delBtn}
                    ${badge}
                    ${sizeBadge}
                </div>
                <div style="padding: 10px; background: #ffffff; display: flex; justify-content: center; border-top: 1px solid #edf2f7;">
                    <button onclick="${clickHandler}" style="width: 100%; background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 8px 0; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                        عرض ال${mediaTypeLabel}
                    </button>
                </div>
            `;
            gallery.appendChild(wrap);
        });
        
        window.reindexMediaBadges();
        
        // Reset file input so picking the identical file again still triggers change event
        input.value = '';
    }
};

window.reindexMediaBadges = function() {
    const gallery = document.getElementById('smMediaGallery');
    if (!gallery) return;
    const badges = gallery.querySelectorAll('.sm-gallery-badge');
    badges.forEach((badge, index) => {
        badge.textContent = index + 1;
    });
};

window.showFrameIoVideo = window.showFrameIoVideo || function(btn, videoUrl, pId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.95); z-index: 999999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;";
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = "×";
    closeBtn.style.cssText = "position: absolute; top: 24px; right: 32px; color: white; font-size: 40px; cursor: pointer; z-index: 1000000; font-weight: 300;";
    closeBtn.onclick = function() { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 300); };
    
    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.style.cssText = "width: 90%; height: 90%; border: none; opacity: 0; transform: scale(0.98); transition: opacity 0.4s ease, transform 0.4s ease;";
    iframe.onload = () => { iframe.style.opacity = '1'; iframe.style.transform = 'scale(1)'; };
    iframe.setAttribute('allowfullscreen', 'true');
    
    overlay.appendChild(closeBtn);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    
    setTimeout(() => overlay.style.opacity = '1', 10);
};

window.removeMediaItem = function(elem) {
    try {
        if (!elem) return;
        
        // Also support if elem is already the wrapper, or inside it
        let wrap = elem.closest ? (elem.closest('.frame-io-media') || elem.closest('.sm-media-item')) : null;
        
        if (!wrap && elem.parentElement && elem.parentElement.parentElement) {
            wrap = elem.parentElement.parentElement;
        }
        
        // Final fallback: if elem is a wrapper itself
        if (!wrap && (elem.classList && (elem.classList.contains('frame-io-media') || elem.classList.contains('sm-media-item')))) {
            wrap = elem;
        }
        
        if (wrap) {
            wrap.remove();
            if (typeof window.reindexMediaBadges === 'function') window.reindexMediaBadges();
            
            const gallery = document.getElementById('smMediaGallery');
            if (gallery && gallery.children.length === 0) {
                const previewContainer = document.getElementById('smMediaPreviewContainer');
                if (previewContainer) previewContainer.style.display = 'none';
            }
            
            if (typeof window.saveSocialDraft === 'function') {
                window.saveSocialDraft(true);
            }
        } else {
            console.warn("Could not find wrap element to remove", elem);
            elem.remove(); // Just blindly remove the clicked element as a desperate fallback
        }
    } catch (e) {
        console.error("Error removing media item:", e);
    }
};

window.clearMediaUpload = function(event) {
    if (event) event.stopPropagation();
    const input = document.getElementById('smMediaInput');
    if (input) input.value = '';
    
    const previewContainer = document.getElementById('smMediaPreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';
    const uploadPrompt = document.getElementById('smUploadPrompt');
    if (uploadPrompt) uploadPrompt.style.display = 'flex';
    
    const gallery = document.getElementById('smMediaGallery');
    if (gallery) {
        // Pause all videos before clearing to kill audio
        const vids = gallery.querySelectorAll('video');
        vids.forEach(v => { v.pause(); v.src = ''; });
        gallery.innerHTML = '';
    }
};

// Intelligently compresses media into a tiny base64 thumbnail to save localStorage space!
window.saveSocialDraft = async function(isAutoSave = false) {
    try {
        const activeBoard = boards.find(b => b.id === activeBoardId);
        
        if (!activeBoard || activeBoard.type !== 'social_scheduler') {
            if (!isAutoSave) console.error('No active board or wrong type', activeBoard);
            return;
        }
        
        const textArea = document.querySelector('.sm-textarea');
        const textContent = textArea ? textArea.value.trim() : '';
        const input = document.getElementById('smMediaInput');
        
        let mediaItems = [];
        
        // Safety check - we extract a thumbnail immediately so it doesn't break localStorage limits
        const gallery = document.getElementById('smMediaGallery');
        const hasInputFiles = input && input.files && input.files.length > 0;
        const nodes = gallery ? gallery.querySelectorAll('.sm-gallery-img, .sm-gallery-vid') : [];
        const frameIoNodes = gallery ? gallery.querySelectorAll('.frame-io-media') : [];
        
        if (hasInputFiles || nodes.length > 0 || frameIoNodes.length > 0) {
            if (gallery) {
                if (nodes.length > 0) {
                    const MAX_THUMB_SIZE = 1200;
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        const isVid = node.classList.contains('sm-gallery-vid');
                        let compressedDataUrl = null;
                        
                        try {
                            if (!isVid && node.src && node.src !== window.location.href) {
                                if (!node.complete) {
                                    await new Promise(res => { node.onload = res; node.onerror = res; });
                                }
                                if (node.naturalWidth > 0) {
                                    const scale = Math.min(MAX_THUMB_SIZE / node.naturalWidth, MAX_THUMB_SIZE / node.naturalHeight, 1);
                                    canvas.width = node.naturalWidth * scale;
                                    canvas.height = node.naturalHeight * scale;
                                    ctx.drawImage(node, 0, 0, canvas.width, canvas.height);
                                    compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                }
                            } else if (isVid && node.src && node.src !== window.location.href) {
                                if (node.readyState >= 2 && node.videoWidth > 0) {
                                    const scale = Math.min(MAX_THUMB_SIZE / node.videoWidth, MAX_THUMB_SIZE / node.videoHeight, 1);
                                    canvas.width = node.videoWidth * scale;
                                    canvas.height = node.videoHeight * scale;
                                    ctx.drawImage(node, 0, 0, canvas.width, canvas.height);
                                    compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                }
                            }
                        } catch (err) {
                            console.error('Failed to compress thumbnail index ' + i, err);
                        }
                        
                        if (compressedDataUrl) {
                            mediaItems.push({ type: isVid ? 'video' : 'image', dataUrl: compressedDataUrl });
                        }
                    }
                }
                
                if (frameIoNodes.length > 0) {
                    for (let i = 0; i < frameIoNodes.length; i++) {
                        const urlAttr = frameIoNodes[i].getAttribute('data-url');
                        const urlThumb = frameIoNodes[i].getAttribute('data-thumbnail');
                        const mediaType = frameIoNodes[i].getAttribute('data-media-type');
                        const duration = frameIoNodes[i].getAttribute('data-duration');
                        if (urlAttr) {
                            mediaItems.push({ 
                                type: 'frame-io', 
                                url: urlAttr,
                                thumbnail: urlThumb || null,
                                mediaType: mediaType || null,
                                duration: duration || null
                            });
                        }
                    }
                }
            }
        }
        
        if (!textContent && mediaItems.length === 0) {
            if (!isAutoSave) {
                const textareaWrap = document.querySelector('.sm-textarea-wrap');
                if (textareaWrap) {
                    textareaWrap.style.boxShadow = '0 0 0 2px #ef4444, 0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                    setTimeout(() => { if (textareaWrap) textareaWrap.style.boxShadow = ''; }, 2000);
                }
                if (typeof showToast === 'function') {
                    showToast('⚠️ يرجى إضافة نص أو وسائط قبل الحفظ');
                } else {
                    alert('يرجى إضافة نص أو وسائط');
                }
                
                // Ensure we get the status here so we can safely check it
                let currentStatus = 'مسودة';
                const statusBtnSnapshot = document.querySelector('.sm-toggle-btn.active');
                if (statusBtnSnapshot) currentStatus = statusBtnSnapshot.textContent.trim();
                
                // CRITICAL FIX: Allow the user to force-save it as a draft even if empty or missing UI
                if (currentStatus === 'مسودة') {
                    console.log("Allowed empty draft save.");
                } else {
                    return;
                }
            } else {
                // If the post is auto-saving but has become completely empty, we brutally delete it
                // ONLY DO THIS IF THE MODAL IS ACTUALLY OPEN! If it's closed, the DOM is empty and we shouldn't kill the post.
                const createPostModal = document.getElementById('createPostModal');
                const isModalOpen = createPostModal && createPostModal.classList.contains('active');
                
                if (!isModalOpen) return;

                if (window.currentEditingSocialPostId) {
                    const idx = activeBoard.cards.findIndex(c => c.id === window.currentEditingSocialPostId);
                    if (idx > -1) {
                        activeBoard.cards.splice(idx, 1);
                        saveState();
                        render();
                        
                        const listEl = document.getElementById('smModalPostsList');
                        if (listEl) {
                            const activeSidebarItem = listEl.querySelector(`div[data-id="${window.currentEditingSocialPostId}"]`);
                            if (activeSidebarItem) activeSidebarItem.remove();
                        }
                        
                        // Since it's totally empty and deleted, clear the current editing id
                        // so any further typing spawns a fresh new post
                        window.currentEditingSocialPostId = null;
                        
                        // highlight the "+ new post" area intuitively
                        setTimeout(() => window.openCreatePostModal(null), 50);
                    }
                }
                return;
            }
        }
        
        let opts = window.activeSocialDateOptions || { year: new Date().getFullYear(), month: new Date().getMonth(), date: new Date().getDate() };
        let dateStr = `${opts.year}-${opts.month}-${opts.date}`;
        let timeStr = null;
        
        // Use custom user-provided date from the datepicker if available and valid
        const dateInputEl = document.querySelector('.sm-date-input');
        if (dateInputEl && dateInputEl.value) {
            const parts = dateInputEl.value.split('-'); // format from input type="date" is YYYY-MM-DD
            if (parts.length === 3) {
                opts = { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1, date: parseInt(parts[2], 10) };
                dateStr = `${opts.year}-${opts.month}-${opts.date}`;
            }
        }
        
        // Also grab custom time
        const timeInputEl = document.querySelector('.sm-time-input');
        if (timeInputEl && timeInputEl.value) {
            timeStr = timeInputEl.value; // typical format is HH:MM
        }
        
        let status = 'مسودة';
        
        const statusBtn = document.querySelector('.sm-toggle-btn.active');
        if (statusBtn) status = statusBtn.textContent.trim();
        
        if (!isAutoSave && (status === 'فوري' || status === 'جدولة')) {
            const activePlatforms = document.querySelectorAll('.sm-platform-empty > div > div[data-active="true"], .sm-live-platform-icon[data-active="true"]');
            if (activePlatforms.length === 0) {
                if (typeof showToast === 'function') {
                    showToast('⚠️ يرجى اختيار منصة واحدة على الأقل قبل النشر.');
                } else {
                    alert('يرجى اختيار منصة واحدة على الأقل قبل النشر.');
                }
                return;
            }
            
            if (status === 'جدولة') {
                if (!timeStr) {
                    if (typeof showToast === 'function') showToast('⚠️ يرجى تحديد وقت الجدولة.');
                    return;
                }
                
                const scheduledDate = new Date(opts.year, opts.month, opts.date);
                const timeParts = timeStr.split(':');
                if (timeParts.length >= 2) {
                    scheduledDate.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);
                }
                
                const now = new Date();
                
                if (scheduledDate.getTime() < now.getTime()) {
                    if (typeof showToast === 'function') {
                        showToast('⚠️ لا يمكن جدولة منشور في تاريخ أو وقت مضى.');
                    } else {
                        alert('لا يمكن جدولة منشور في تاريخ أو وقت مضى.');
                    }
                    return;
                }
            }
        }
        
        let postType = 'image';
        const postTypeInput = document.querySelector('input[name="smPostType"]:checked');
        if (postTypeInput) postType = postTypeInput.value;
        
        const existingPost = window.currentEditingSocialPostId ? activeBoard.cards.find(c => c.id === window.currentEditingSocialPostId) : null;
        let originalState = existingPost ? existingPost.originalState : undefined;
        let clientEdits = existingPost ? (existingPost.clientEdits || '') : '';
        const agencyEditsInput = document.getElementById('agencyClientEditsInput');
        const agencyEditsContainer = document.getElementById('agencyClientEditsContainer');
        const clientEditsInput = document.getElementById('clientEditsInput');
        
        if (window.isClientView && clientEditsInput) {
            clientEdits = clientEditsInput.value.trim();
        } else if (!window.isClientView && agencyEditsInput && agencyEditsContainer && agencyEditsContainer.style.display !== 'none') {
            clientEdits = agencyEditsInput.value.trim();
        }
        
        const isClientModified = window.isClientView 
            ? (clientEdits !== '' || (existingPost && existingPost.fullText !== textContent) || (existingPost && existingPost.postType !== postType) || (existingPost && typeof existingPost.clientModified !== 'undefined' ? existingPost.clientModified : false))
            : (existingPost ? !!existingPost.clientModified : false);

        if (window.isClientView && isClientModified && existingPost && !originalState) {
            originalState = {
                fullText: existingPost.fullText,
                postType: existingPost.postType
            };
        }
        
        const activePlatformsTokens = document.querySelectorAll('.sm-platform-empty > div > div[data-active="true"], .sm-live-platform-icon[data-active="true"]');
        let platformsArray = [];
        if (activePlatformsTokens.length > 0) {
            platformsArray = Array.from(activePlatformsTokens).map(p => {
                if (p.hasAttribute('data-platform')) return p.getAttribute('data-platform');
                const onclickAttr = p.getAttribute('onclick') || '';
                if (onclickAttr.includes('#e1306c')) return 'instagram';
                if (onclickAttr.includes('#1877f2')) return 'facebook';
                if (onclickAttr.includes('#ca8a04')) return 'snapchat';
                if (onclickAttr.includes('#0f1419')) return 'twitter';
                if (onclickAttr.includes('#0a66c2')) return 'linkedin';
                if (onclickAttr.includes('#000000')) return 'tiktok';
                return null;
            }).filter(Boolean);
        }

        platformsArray = Array.from(new Set(platformsArray));

        let platformsConfig = {};
        if (platformsArray.length > 0) {
            platformsArray.forEach(plat => {
                platformsConfig[plat] = {};
                if (plat === 'instagram') {
                    const activeTab = document.querySelector('.ig-live-tab.active');
                    if (activeTab) {
                        const t = activeTab.textContent.trim();
                        if (t === 'منشور') platformsConfig[plat].type = 'Feed';
                        else if (t === 'قصة') platformsConfig[plat].type = 'Story';
                        else if (t === 'ريلز') platformsConfig[plat].type = 'Reel';
                        else if (t === 'كاروسيل') platformsConfig[plat].type = 'Carousel';
                    }
                    const collabNode = document.querySelector('#igLiveCollaborators input');
                    if (collabNode) platformsConfig[plat].collaborators = collabNode.value.trim();
                    const cmtNode = document.querySelector('#igLiveFirstComment textarea');
                    if (cmtNode) platformsConfig[plat].firstComment = cmtNode.value.trim();
                    const txtNode = document.querySelector('#igLiveCustomText textarea');
                    if (txtNode) platformsConfig[plat].customText = txtNode.value.trim();
                } else if (plat === 'facebook') {
                    const activeTab = document.querySelector('.fb-live-tab.active');
                    if (activeTab) {
                        const t = activeTab.textContent.trim();
                        if (t === 'منشور') platformsConfig[plat].type = 'Feed';
                        else if (t === 'قصة') platformsConfig[plat].type = 'Story';
                        else if (t === 'ريلز') platformsConfig[plat].type = 'Reel';
                    }
                    const cmtNode = document.querySelector('#fbLiveFirstComment textarea');
                    if (cmtNode) platformsConfig[plat].firstComment = cmtNode.value.trim();
                    const txtNode = document.querySelector('#fbLiveCustomText textarea');
                    if (txtNode) platformsConfig[plat].customText = txtNode.value.trim();
                } else if (plat === 'tiktok') {
                    const activeTab = document.querySelector('.tiktok-live-tab.active');
                    if (activeTab) {
                        const t = activeTab.textContent.trim();
                        if (t === 'فيديو') platformsConfig[plat].type = 'Video';
                        else if (t === 'صور') platformsConfig[plat].type = 'Photos';
                        else if (t === 'قصة') platformsConfig[plat].type = 'Story';
                    }
                    const txtNode = document.querySelector('#tiktokLiveCustomText textarea');
                    if (txtNode) platformsConfig[plat].customText = txtNode.value.trim();
                }
            });
        }

        const newDraft = {
            id: window.currentEditingSocialPostId || ('post-' + Date.now()),
            title: textContent.substring(0, 50) + (textContent.length > 50 ? '...' : ''),
            fullText: textContent,
            dateStr: dateStr,
            timeStr: timeStr,
            status: status,
            postType: postType,
            mediaItems: mediaItems.length > 0 ? mediaItems : null,
            clientEdits: clientEdits,
            clientModified: isClientModified,
            platforms: platformsArray,
            platformsConfig: platformsConfig
        };
        
        if (existingPost && existingPost.isClientDayNote) newDraft.isClientDayNote = true;
        if (isClientModified) {
            newDraft.clientModifiedAt = window.isClientView ? Date.now() : (existingPost ? existingPost.clientModifiedAt : Date.now());
        }
        
        if (originalState) newDraft.originalState = originalState;
        
        // Anchor the UI explicitly to this new post ID so further auto-saves 
        // properly update this exact post record and it's visible upon reload
        window.currentEditingSocialPostId = newDraft.id;
        
        activeBoard.cards = activeBoard.cards || [];
        
        if (window.currentEditingSocialPostId) {
            const idx = activeBoard.cards.findIndex(c => c.id === window.currentEditingSocialPostId);
            if (idx > -1) {
                activeBoard.cards[idx] = newDraft;
            } else {
                activeBoard.cards.push(newDraft);
            }
        } else {
            activeBoard.cards.push(newDraft);
        }
        
        saveState();
        
        if (!isAutoSave) {
            const modal = document.getElementById('createPostModal');
            
            if (status === 'فوري') {
                const primaryActionBtn = document.getElementById('sm-primary-action-btn');
                let originalBtnText = '';
                
                if (primaryActionBtn) {
                    originalBtnText = primaryActionBtn.innerHTML;
                    primaryActionBtn.innerHTML = `<svg style="animation: smSpin 1s linear infinite; height: 16px; width: 16px; margin-left: 8px; vertical-align: middle;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري النشر...`;
                    primaryActionBtn.disabled = true;
                    primaryActionBtn.style.opacity = '0.7';
                    primaryActionBtn.style.cursor = 'not-allowed';
                }
                
                let blockingOverlay = document.getElementById('sm-blocking-overlay');
                if (!blockingOverlay) {
                    blockingOverlay = document.createElement('div');
                    blockingOverlay.id = 'sm-blocking-overlay';
                    blockingOverlay.style.position = 'absolute';
                    blockingOverlay.style.top = '0';
                    blockingOverlay.style.left = '0';
                    blockingOverlay.style.right = '0';
                    blockingOverlay.style.bottom = '0';
                    blockingOverlay.style.background = 'rgba(255,255,255,0.4)';
                    blockingOverlay.style.zIndex = '9999';
                    blockingOverlay.style.cursor = 'wait';
                    if (modal) {
                        const modalBody = modal.querySelector('.sm-modal-body');
                        if (modalBody) modalBody.appendChild(blockingOverlay);
                    }
                }

                if (typeof showToast === 'function') showToast('⏳ جاري إرسال المنشور إلى منصات التواصل...');
                
                fetch('https://abdalla1.app.n8n.cloud/webhook/publish-post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: activeBoardId,
                        post: newDraft
                    })
                }).then(async res => {
                    const txt = await res.text();
                    console.log("Publish response:", txt);
                    
                    let parsedData = null;
                    try { parsedData = JSON.parse(txt); } catch(e) {}

                    const removeLoadingState = () => {
                        if (primaryActionBtn) {
                            primaryActionBtn.innerHTML = originalBtnText;
                            primaryActionBtn.disabled = false;
                            primaryActionBtn.style.opacity = '1';
                            primaryActionBtn.style.cursor = 'pointer';
                        }
                        if (blockingOverlay) blockingOverlay.remove();
                    };

                    if (res.ok) {
                        let isError = false;
                        let errorMsg = "حدث خطأ أثناء النشر";

                        if (parsedData) {
                            if (parsedData.error) {
                                isError = true;
                                if (typeof parsedData.error === 'object') {
                                    errorMsg = parsedData.error.description || parsedData.error.message || JSON.stringify(parsedData.error);
                                } else {
                                    errorMsg = parsedData.error;
                                }
                            } else if (parsedData.status === 'error' || parsedData.status === 'failed') {
                                isError = true;
                                errorMsg = parsedData.message || parsedData.description || errorMsg;
                            }
                        }

                        if (isError) {
                            removeLoadingState();
                            if (typeof showToast === 'function') setTimeout(() => showToast('⚠️ خطأ من المنصة: ' + errorMsg), 1000);
                        } else {
                            if (typeof showToast === 'function') setTimeout(() => showToast('✅ تم نشر المنشور بنجاح على منصات التواصل!'), 1000);
                            removeLoadingState();
                            if (modal) modal.classList.remove('active');
                            if (textArea) textArea.value = '';
                            if (window.clearMediaUpload) window.clearMediaUpload();
                        }
                    } else {
                        removeLoadingState();
                        let errorMsg = `خطأ (${res.status})`;
                        if (parsedData) {
                            if (parsedData.error) {
                                errorMsg = typeof parsedData.error === 'object' ? (parsedData.error.description || parsedData.error.message || JSON.stringify(parsedData.error)) : parsedData.error;
                            } else if (parsedData.message) {
                                errorMsg = parsedData.message;
                            }
                        }
                        if (typeof showToast === 'function') setTimeout(() => showToast('⚠️ فشل النشر: ' + errorMsg), 1000);
                    }
                }).catch(err => {
                    if (primaryActionBtn) {
                        primaryActionBtn.innerHTML = originalBtnText;
                        primaryActionBtn.disabled = false;
                        primaryActionBtn.style.opacity = '1';
                        primaryActionBtn.style.cursor = 'pointer';
                    }
                    if (blockingOverlay) blockingOverlay.remove();
                    
                    console.error("Publishing webhook failed", err);
                    if (typeof showToast === 'function') setTimeout(() => showToast('🔴 فشل الاتصال بالخادم. يرجى المحاولة لاحقاً.'), 1500);
                });
            } else {
                if (modal) modal.classList.remove('active');
                if (textArea) textArea.value = '';
                if (window.clearMediaUpload) window.clearMediaUpload();
                if (typeof showToast === 'function') showToast('تم الحفظ بنجاح');
            }
        }
        
        render();
        
        if (isAutoSave) {
            const listEl = document.getElementById('smModalPostsList');
            if (listEl) {
                const activeSidebarItem = listEl.querySelector(`div[data-id="${newDraft.id}"]`);
                if (activeSidebarItem && activeSidebarItem.children.length >= 3) {
                    const defaultIcon = newDraft.postType === 'video' ? '▶️' : '🖼️';
                    let mediaThumbHtml = `<div style="font-size:12px; margin-left:6px; flex-shrink:0;">${defaultIcon}</div>`;
                    if (newDraft.mediaItems && newDraft.mediaItems.length > 0) {
                        const m = newDraft.mediaItems[0];
                        if (m.dataUrl && (!m.type || m.type === 'image')) {
                            mediaThumbHtml = `<img src="${m.dataUrl}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                        } else if (m.thumbnail) {
                            mediaThumbHtml = `<img src="${m.thumbnail}" style="width:24px; height:24px; border-radius:4px; object-fit:cover; margin-left:6px; flex-shrink:0;">`;
                        } else if (m.type === 'frame-io' || m.type === 'video' || (m.dataUrl && m.dataUrl.startsWith('data:video/'))) {
                            mediaThumbHtml = `<div style="width:24px; height:24px; border-radius:4px; background:#1e293b; color:white; display:flex; align-items:center; justify-content:center; margin-left:6px; flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
                        }
                    }
                    activeSidebarItem.children[1].outerHTML = mediaThumbHtml;
                }
            }
        }
        
        // Auto select sidebar
        setTimeout(() => {
            const cells = document.querySelectorAll('.sm-cal-cell.selected');
            if (cells.length > 0) cells[0].click();
        }, 50);

    } catch (e) {
        console.error("Critical error in saveSocialDraft:", e);
        alert("حدث خطأ أثناء حفظ المنشور: " + e.message);
    }
};

window.viewMediaFull = function(src, type) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:999999; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transition:opacity 0.2s;';
    
    let content = '';
    if (type === 'video') {
        content = `<video src="${src}" controls autoplay style="height:90vh; width:auto; max-width:90vw; border-radius:8px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); cursor:default; object-fit:contain;" onclick="event.stopPropagation()"></video>`;
    } else {
        content = `<img src="${src}" style="height:90vh; width:auto; max-width:90vw; border-radius:8px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); cursor:default; object-fit:contain;" onclick="event.stopPropagation()">`;
    }
    
    overlay.innerHTML = `
        <button style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.1); border:none; color:white; width:40px; height:40px; border-radius:50%; font-size:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">×</button>
        ${content}
    `;
    
    document.body.appendChild(overlay);
    
    // trigger reflow for opacity transition
    void overlay.offsetWidth;
    overlay.style.opacity = '1';
    
    const closeOverlay = () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 200);
    };
    
    // allow clicking on backdrop or X to close
    if(overlay) overlay.onclick = closeOverlay;
    const closeBtn = overlay.querySelector('button');
    if (closeBtn) if(closeBtn) closeBtn.onclick = closeOverlay;
};

window.deleteSocialPost = function(postId) {
    window.showConfirmModal(() => {
        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;
        
        const idx = board.cards.findIndex(c => c.id === postId);
        if (idx > -1) {
            board.cards.splice(idx, 1);
            saveState();
            render();
            
            if (window.currentEditingSocialPostId === postId) {
                // If we deleted the post we were currently viewing, empty the modal
                window.openCreatePostModal(null);
            } else {
                // If we deleted another post from the sidebar, refresh the sidebar
                window.openCreatePostModal(window.currentEditingSocialPostId);
            }
        }
    }, "حذف المنشور", "هل أنت متأكد من رغبتك في حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.");
};

if(document) document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('smMediaGallery');
    if (gallery && typeof Sortable !== 'undefined') {
        new Sortable(gallery, {
            animation: 150,
            onEnd: function() {
                if (typeof window.reindexMediaBadges === 'function') {
                    window.reindexMediaBadges();
                }
                
                // Immediately auto-save if editing so order is preserved
                if (typeof window.saveSocialDraft === 'function' && window.currentEditingSocialPostId) {
                    window.saveSocialDraft(true);
                }
            }
        });
    }
});

// Multi-select platform toggling logic for Live Mode
window.toggleLivePlatform = function(element, color, platformId) {
    const isActive = element.getAttribute('data-active') === 'true';
    if (isActive) {
        element.style.boxShadow = 'none';
        element.removeAttribute('data-active');
    } else {
        element.style.boxShadow = '0 0 0 2px #fff, 0 0 0 3px ' + color;
        element.setAttribute('data-active', 'true');
    }
    
    // Toggle the configuration box for that specific platform
    if (platformId === 'instagram') {
        const box = document.getElementById('igLiveConfigBox');
        if (box) box.style.display = isActive ? 'none' : 'block';
    } else if (platformId === 'facebook') {
        const fbBox = document.getElementById('fbLiveConfigBox');
        if (fbBox) fbBox.style.display = isActive ? 'none' : 'block';
    } else if (platformId === 'tiktok') {
        const tiktokBox = document.getElementById('tiktokLiveConfigBox');
        if (tiktokBox) tiktokBox.style.display = isActive ? 'none' : 'block';
    }
};

window.connectZernioPlatform = function(platformId) {
    if (!activeBoardId) {
        if (typeof showToast === 'function') showToast("يرجى تحديد العميل أولاً");
        return;
    }
    
    if (typeof showToast === 'function') showToast(`جاري إنشاء رابط ${platformId}...`);
    
    // Call the n8n webhook backend
    fetch(`https://abdalla1.app.n8n.cloud/webhook/zernio-auth?platform=${platformId}&profileId=${activeBoardId}`, {
        method: 'GET'
    })
    .then(res => res.json())
    .then(data => {
        // Since n8n HTTP node returns the API response, it should contain authUrl
        if (data && data.authUrl) {
            // Open securely
            window.open(data.authUrl, '_blank', 'width=600,height=750,status=yes,scrollbars=yes');
        } else {
            if (typeof showToast === 'function') showToast("خطأ في إنشاء الرابط. تأكد من إعداد n8n.");
            console.error("Zernio Auth Error: Missing authUrl in response", data);
        }
    })
    .catch(err => {
        console.error("Zernio Connect Error:", err);
        if (typeof showToast === 'function') showToast("خطأ في الاتصال بالخادم.");
    });
};

window.updatePublishTogglesVisibility = function(isInitialOpen = false) {
    const createPostModal = document.getElementById('createPostModal');
    if (!createPostModal) return;
    
    const publishToggles = createPostModal.querySelectorAll('.sm-toggle-btn');
    const dateInput = createPostModal.querySelector('.sm-date-input');
    
    let isToday = false;
    if (dateInput && dateInput.value) {
        const todayLocal = new Date();
        const y = todayLocal.getFullYear();
        const m = String(todayLocal.getMonth() + 1).padStart(2, '0');
        const d = String(todayLocal.getDate()).padStart(2, '0');
        if (dateInput.value === `${y}-${m}-${d}`) {
            isToday = true;
        }
    } else if (window.activeSocialDateOptions) {
        const todayLocal = new Date();
        if (window.activeSocialDateOptions.year === todayLocal.getFullYear() &&
            window.activeSocialDateOptions.month === todayLocal.getMonth() &&
            window.activeSocialDateOptions.date === todayLocal.getDate()) {
            isToday = true;
        }
    }
    
    publishToggles.forEach(b => {
        const txt = b.textContent.trim();
        if (!window.isLiveModeActive) { // Draft Mode
            b.style.display = (txt === 'مسودة') ? '' : 'none';
        } else { // Live Mode
            if (txt === 'مسودة') b.style.display = 'none';
            else if (txt === 'فوري') b.style.display = isToday ? '' : 'none';
            else if (txt === 'جدولة') b.style.display = '';
        }
    });

    if (isInitialOpen) {
        publishToggles.forEach(b => b.classList.remove('active'));
        const draftBtn = Array.from(publishToggles).find(b => b.textContent.trim() === 'مسودة');
        const schedBtn = Array.from(publishToggles).find(b => b.textContent.trim() === 'جدولة');
        
        if (!window.isLiveModeActive && draftBtn) draftBtn.click();
        else if (window.isLiveModeActive && schedBtn) schedBtn.click();
    } else {
        const activeBtn = Array.from(publishToggles).find(b => b.classList.contains('active') && b.style.display !== 'none');
        if (!activeBtn) {
            publishToggles.forEach(b => b.classList.remove('active'));
            if (!window.isLiveModeActive) {
                const draftBtn = Array.from(publishToggles).find(b => b.textContent.trim() === 'مسودة');
                if (draftBtn) draftBtn.click();
            } else {
                const schedBtn = Array.from(publishToggles).find(b => b.textContent.trim() === 'جدولة');
                if (schedBtn) schedBtn.click();
            }
        }
    }
};
