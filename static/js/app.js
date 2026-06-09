/* ============================================================
   RepReady — Chat Application
   localStorage conversations · SSE streaming · RAG attribution
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // DOM Refs
  // ============================================================

  const chatArea              = document.getElementById('chatArea');
  const noChatState           = document.getElementById('noChatState');
  const welcomeState          = document.getElementById('welcomeState');
  const messagesEl            = document.getElementById('messages');
  const questionInput         = document.getElementById('questionInput');
  const sendBtn               = document.getElementById('sendBtn');
  const inputArea             = document.getElementById('inputArea');
  const noChatNewBtn          = document.getElementById('noChatNewBtn');
  const topbarNewChatBtn      = document.getElementById('topbarNewChatBtn');
  const convList              = document.getElementById('convList');
  const productPillBar        = document.getElementById('productPillBar');
  const sessionPhaseToggle    = document.getElementById('sessionPhaseToggle');
  const phasePrepBtn          = document.getElementById('phasePrepBtn');
  const phaseLiveBtn          = document.getElementById('phaseLiveBtn');
  const mainPanel             = document.getElementById('mainPanel');
  const sidebarPhaseIndicator = document.getElementById('sidebarPhaseIndicator');
  const sidebarPhaseLabel     = document.getElementById('sidebarPhaseLabel');
  const sidebarPhaseSub       = document.getElementById('sidebarPhaseSub');
  const sidebarEmpty          = document.getElementById('sidebarEmpty');
  const topbarContext         = document.getElementById('topbarContext');
  const topbarProspectName    = document.getElementById('topbarProspectName');
  const topbarProspectSep     = document.getElementById('topbarProspectSep');
  const topbarProspectCompany = document.getElementById('topbarProspectCompany');

  // Product pill
  const activeProductPill  = document.getElementById('activeProductPill');
  const activeProductLabel = document.getElementById('activeProductLabel');

  const INPUT_PLACEHOLDER_LIVE = "What's happening on the call right now?";
  const INPUT_PLACEHOLDER_PREP = 'Ask about this prospect, objections, or what to expect…';
  const INPUT_PLACEHOLDER_IDLE = 'Select or create a chat first';

  // View routing
  const landingEl         = document.getElementById('landing');
  const appEl             = document.getElementById('app');
  const gapsEl            = document.getElementById('gaps');
  const backBtn           = document.getElementById('backBtn');
  const logoLink          = document.getElementById('logoLink');
  const newConvModal      = document.getElementById('newConvModal');
  const newConvModalClose = document.getElementById('newConvModalClose');
  const newConvCancelBtn  = document.getElementById('newConvCancelBtn');
  const newConvStartBtn   = document.getElementById('newConvStartBtn');
  const convProspectInput = document.getElementById('convProspectName');
  const convCompanyInput  = document.getElementById('convCompanyName');
  const kbStatusMsg       = document.getElementById('kbStatusMsg');
  const prospectCardRow   = document.getElementById('prospectCardRow');

  const editConvModal      = document.getElementById('editConvModal');
  const editConvModalClose = document.getElementById('editConvModalClose');
  const editConvCancelBtn  = document.getElementById('editConvCancelBtn');
  const editConvSaveBtn    = document.getElementById('editConvSaveBtn');
  const editProspectInput  = document.getElementById('editProspectName');
  const editCompanyInput   = document.getElementById('editCompanyName');

  // ============================================================
  // State
  // ============================================================

  const LEGACY_ASSISTANT_ID = '__assistant__';
  const STORAGE_KEY  = 'repready_conversations';
  let conversations  = [];
  let activeConvId   = null;
  let editingConvId  = null;
  let isStreaming    = false;
  let hasStarted     = false;
  let openDropdownEl = null;

  const PRODUCTS = [
    { id: 'general',      label: 'All products',  desc: 'Cross-product comparisons',             dot: '#8b8fa8' },
    { id: 'repready_pro', label: 'RepReady Pro',   desc: 'AI knowledge assistant · battle cards', dot: '#6366f1' },
    { id: 'coachai',      label: 'CoachAI',        desc: 'Real-time call coaching',               dot: '#22c55e' },
    { id: 'salestrain',   label: 'SalesTrain',     desc: 'AI sales training & simulation',        dot: '#f59e0b' },
    { id: 'signalhq',     label: 'SignalHQ',       desc: 'Prospect intelligence & signals',       dot: '#ef4444' },
    { id: 'dealdesk',     label: 'DealDesk',       desc: 'CPQ & proposal automation',             dot: '#a78bfa' },
  ];

  const KB_PROSPECTS = ['alex rivera', 'marcus johnson', 'priya patel'];

  // ============================================================
  // Mode
  // ============================================================

  function newSessionId() {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
  }

  function getChatMode() {
    const conv = getActiveConv();
    return conv?.sessionPhase === 'live' ? 'live' : 'prep';
  }

  function setSessionPhase(phase) {
    const conv = getActiveConv();
    if (!conv) return;
    const next = phase === 'live' ? 'live' : 'prep';
    if (next === 'live' && conv.sessionPhase !== 'live') {
      conv.sessionId = newSessionId();
      conv.liveHintsHidden = false;
    }
    conv.sessionPhase = next;
    saveConversations();
    updateSessionPhaseUI();
    updateInputAvailability();
    renderSidebar();
  }

  function getConvPhase(conv) {
    return conv?.sessionPhase === 'live' ? 'live' : 'prep';
  }

  function applyPhaseAtmosphere() {
    const conv = getActiveConv();
    const phase = getConvPhase(conv);
    const hasConv = !!activeConvId;

    if (mainPanel) {
      mainPanel.classList.remove('main-panel--prep', 'main-panel--live');
      if (hasConv) mainPanel.classList.add(`main-panel--${phase}`);
    }
    if (inputArea) {
      inputArea.classList.remove('input-area--prep', 'input-area--live');
      if (hasConv) inputArea.classList.add(`input-area--${phase}`);
    }
    if (chatArea) {
      chatArea.classList.remove('chat-area--prep', 'chat-area--live');
      if (hasConv) chatArea.classList.add(`chat-area--${phase}`);
    }
  }

  function updateSessionPhaseUI() {
    if (sessionPhaseToggle) sessionPhaseToggle.hidden = !activeConvId;

    const phase = getConvPhase(getActiveConv());

    if (phasePrepBtn) {
      phasePrepBtn.classList.toggle('active', phase === 'prep');
      phasePrepBtn.setAttribute('aria-pressed', String(phase === 'prep'));
    }
    if (phaseLiveBtn) {
      phaseLiveBtn.classList.toggle('active', phase === 'live');
      phaseLiveBtn.setAttribute('aria-pressed', String(phase === 'live'));
    }

    const liveSection = document.getElementById('liveExamplesSection');
    const conv = getActiveConv();
    if (liveSection) {
      const showLive = !!activeConvId && phase === 'live' && !conv?.liveHintsHidden;
      liveSection.classList.toggle('hidden', !showLive);
    }

    const prepSection = document.getElementById('prospectPrepSection');
    if (prepSection) {
      const hasChips = Boolean(document.getElementById('prospectChipsContainer')?.children.length);
      prepSection.classList.toggle('hidden', phase !== 'prep' || !hasChips);
    }

    const welcomeTagline = document.getElementById('welcomeTagline');
    if (welcomeTagline) {
      if (phase === 'live') {
        welcomeTagline.className = 'empty-tagline empty-tagline--live';
        welcomeTagline.innerHTML = '<strong>On the call now</strong> — type what just happened and get your next move in seconds.';
      } else {
        welcomeTagline.className = 'empty-tagline empty-tagline--prep';
        welcomeTagline.innerHTML = '<strong>Before the call</strong> — ask about their notes, expected objections, or company background.';
      }
    }

    applyPhaseAtmosphere();
    updateSidebarPhaseIndicator();
    updateTopbarContext();
  }

  function updateTopbarContext() {
    if (!topbarContext) return;

    const conv = getActiveConv();
    if (!conv || !activeConvId) {
      topbarContext.classList.add('hidden');
      return;
    }

    topbarContext.classList.remove('hidden');
    if (topbarProspectName) topbarProspectName.textContent = conv.name;

    const hasCompany = !!(conv.company && conv.company.trim());
    if (topbarProspectCompany) {
      topbarProspectCompany.textContent = hasCompany ? conv.company : '';
      topbarProspectCompany.classList.toggle('hidden', !hasCompany);
    }
    if (topbarProspectSep) topbarProspectSep.classList.toggle('hidden', !hasCompany);
  }

  function updateSidebarPhaseIndicator() {
    if (!sidebarPhaseIndicator) return;

    const hasConv = !!activeConvId;
    const phase = getConvPhase(getActiveConv());

    sidebarPhaseIndicator.hidden = !hasConv;
    sidebarPhaseIndicator.classList.remove('sidebar-phase--idle', 'sidebar-phase--prep', 'sidebar-phase--live');
    if (!hasConv) {
      sidebarPhaseIndicator.classList.add('sidebar-phase--idle');
      return;
    }

    sidebarPhaseIndicator.classList.add(`sidebar-phase--${phase}`);

    if (phase === 'live') {
      if (sidebarPhaseLabel) sidebarPhaseLabel.textContent = 'On the call now';
    } else {
      if (sidebarPhaseLabel) sidebarPhaseLabel.textContent = 'Before the call';
    }
    if (sidebarPhaseSub) sidebarPhaseSub.hidden = true;
  }

  // ============================================================
  // localStorage — Load / Save
  // ============================================================

  function loadConversations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      conversations = raw ? JSON.parse(raw) : [];
    } catch (_) {
      conversations = [];
    }
    let migrated = false;
    const before = conversations.length;
    conversations = conversations.filter((c) => c.id !== LEGACY_ASSISTANT_ID);
    if (conversations.length !== before) migrated = true;

    conversations.forEach((c) => {
      if (!c.sessionId) {
        c.sessionId = newSessionId();
        migrated = true;
      }
      if (!c.sessionPhase) {
        c.sessionPhase = 'prep';
        migrated = true;
      }
    });
    if (migrated) saveConversations();
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (_) {}
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ============================================================
  // Conversation CRUD
  // ============================================================

  function createConversation(name, company, product) {
    const conv = {
      id:           generateId(),
      sessionId:    newSessionId(),
      sessionPhase: 'prep',
      name:         name.trim(),
      company:      (company || '').trim(),
      product:      product || 'general',
      createdAt:    new Date().toISOString(),
      messages:     [],
    };
    conversations.unshift(conv);
    saveConversations();
    renderSidebar();
    switchConversation(conv.id);
    return conv;
  }

  function getActiveConv() {
    return conversations.find((c) => c.id === activeConvId) || null;
  }

  function saveUserMessage(content) {
    const conv = getActiveConv();
    if (!conv) return;
    conv.messages.push({ role: 'user', content });
    saveConversations();
  }

  // ============================================================
  // Main Panel + Input State
  // ============================================================

  function updateProductPillVisibility() {
    productPillBar.style.display = activeConvId ? '' : 'none';
    updateSessionPhaseUI();
  }

  function updateInputAvailability() {
    const enabled = !!activeConvId;
    questionInput.disabled = !enabled;
    activeProductPill.disabled = !enabled;

    if (enabled) {
      const conv = getActiveConv();
      questionInput.placeholder = conv?.sessionPhase === 'live'
        ? INPUT_PLACEHOLDER_LIVE
        : INPUT_PLACEHOLDER_PREP;
      inputArea.classList.remove('input-area--disabled');
      sendBtn.disabled = questionInput.value.trim() === '' || isStreaming;
    } else {
      questionInput.placeholder = INPUT_PLACEHOLDER_IDLE;
      inputArea.classList.add('input-area--disabled');
      sendBtn.disabled = true;
    }
  }

  function renderMainPanel() {
    messagesEl.innerHTML = '';
    clearInput();
    removeSuggestionChips();
    updateProductPillVisibility();

    if (!activeConvId) {
      hasStarted = false;
      noChatState.classList.remove('hidden');
      welcomeState.classList.add('hidden');
      updateInputAvailability();
      updateTopbarContext();
      return;
    }

    const conv = getActiveConv();
    const msgs = conv ? conv.messages : [];

    if (msgs.length === 0) {
      hasStarted = false;
      noChatState.classList.add('hidden');
      welcomeState.classList.remove('hidden');
      if (conv) {
        showProspectChips(conv.name, conv.company);
      } else {
        hideProspectPrep();
      }
    } else {
      hasStarted = true;
      noChatState.classList.add('hidden');
      welcomeState.classList.add('hidden');
      msgs.forEach((msg) => {
        if (msg.role === 'user') {
          appendUserBubble(msg.content);
        } else {
          appendStoredBotBubble(msg.content);
        }
      });
      scrollBottom();
    }

    updateInputAvailability();
    if (activeConvId) questionInput.focus();
  }

  // ============================================================
  // Sidebar Rendering
  // ============================================================

  function renderSidebar() {
    convList.innerHTML = '';
    conversations.forEach((conv) => convList.appendChild(buildConvItem(conv)));
    if (sidebarEmpty) {
      sidebarEmpty.classList.toggle('hidden', conversations.length > 0);
    }
    if (topbarNewChatBtn) {
      topbarNewChatBtn.classList.toggle('hidden', conversations.length === 0);
    }
    updateSidebarActive();
  }

  function buildConvItem(conv) {
    const phase = getConvPhase(conv);
    const item = document.createElement('div');
    item.className = `conv-item phase-${phase}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.dataset.id = conv.id;

    item.innerHTML = `
      <div class="conv-avatar" aria-hidden="true" style="--avatar-hue: ${avatarHue(conv.name)}">${initials(conv.name)}</div>
      <div class="conv-meta">
        <div class="conv-name-row">
          <span class="conv-name">${escapeHtml(conv.name)}</span>
          <span class="phase-badge phase-badge--${phase}">${phase === 'live' ? 'Live' : 'Prep'}</span>
        </div>
        <span class="conv-company">${escapeHtml(conv.company || '')}</span>
      </div>
      <span class="conv-time">${formatRelativeTime(conv.createdAt)}</span>
      <button class="conv-menu-btn" title="More options" aria-label="More options" aria-haspopup="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.conv-menu-btn')) return;
      switchConversation(conv.id);
    });

    const menuBtn = item.querySelector('.conv-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConvMenu(menuBtn, conv.id, item);
    });

    return item;
  }

  function updateSidebarActive() {
    convList.querySelectorAll('.conv-item').forEach((el) => {
      const isActive = el.dataset.id === activeConvId;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });
  }

  function closeStatusDropdown() {
    if (openDropdownEl) {
      openDropdownEl._anchorItem && openDropdownEl._anchorItem.classList.remove('menu-open');
      openDropdownEl.remove();
      openDropdownEl = null;
    }
  }

  document.addEventListener('click', () => closeStatusDropdown());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStatusDropdown(); });

  // ============================================================
  // Product Pill
  // ============================================================

  function syncKbFileList(productId) {
    const id = productId ?? getActiveConv()?.product;
    document.querySelectorAll('#kbFileList .kb-file').forEach((el) => {
      el.classList.toggle('kb-file--active', !!id && id !== 'general' && el.dataset.product === id);
    });
  }

  function updateProductPill() {
    const conv = getActiveConv();
    const pid  = conv?.product || 'general';
    const p    = PRODUCTS.find((x) => x.id === pid) || PRODUCTS[0];
    activeProductLabel.textContent = p.label;
    const dot = activeProductPill.querySelector('.active-product-dot');
    if (dot) dot.style.background = p.dot;
    activeProductPill.dataset.product = pid;
    syncKbFileList(pid);
  }

  function showProductSwitchDropdown() {
    closeStatusDropdown();
    const rect = activeProductPill.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'status-dropdown-float';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `
      position:fixed;
      left:${rect.left}px;
      bottom:${window.innerHeight - rect.top + 6}px;
      min-width:${rect.width}px;
    `;

    const conv       = getActiveConv();
    const currentPid = conv?.product || 'general';

    const header = document.createElement('div');
    header.className = 'product-dropdown-header';
    header.textContent = "Select the product you're selling — RepReady coaches from that product's docs";
    menu.appendChild(header);

    PRODUCTS.forEach(({ id, label, desc, dot }) => {
      const btn = document.createElement('button');
      btn.className = 'status-opt status-opt-product' + (id === currentPid ? ' status-opt-active' : '');
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;margin-right:10px;display:inline-block;margin-top:4px"></span>
        <span class="status-opt-product-text">
          <span class="status-opt-product-label">${label}</span>
          <span class="status-opt-product-desc">${desc}</span>
        </span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeStatusDropdown();
        if (conv && id !== currentPid) {
          conv.product = id;
          saveConversations();
          updateProductPill();
          if (hasStarted) appendProductDivider(label);
        }
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    openDropdownEl = menu;
  }

  activeProductPill.addEventListener('click', (e) => {
    if (activeProductPill.disabled) return;
    e.stopPropagation();
    if (openDropdownEl) { closeStatusDropdown(); return; }
    showProductSwitchDropdown();
  });

  function appendProductDivider(productLabel) {
    const div = document.createElement('div');
    div.className = 'product-switch-divider';
    div.setAttribute('aria-label', `Switched to ${productLabel}`);
    div.innerHTML = `<span>Switched to ${productLabel}</span>`;
    messagesEl.appendChild(div);
    scrollBottom();
  }

  // ============================================================
  // Conv Action Menu (Edit / Delete)
  // ============================================================

  function showConvMenu(menuBtn, convId, itemEl) {
    closeStatusDropdown();

    itemEl.classList.add('menu-open');
    const rect = menuBtn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'status-dropdown-float';
    menu.setAttribute('role', 'menu');
    menu._anchorItem = itemEl;
    menu.style.cssText = `
      position:fixed;
      right:${window.innerWidth - rect.right}px;
      top:${rect.bottom + 6}px;
      left:auto;
      min-width:170px;
    `;

    function renderMain() {
      menu.innerHTML = '';

      const editBtn = document.createElement('button');
      editBtn.className = 'status-opt';
      editBtn.setAttribute('role', 'menuitem');
      editBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" style="margin-right:9px;flex-shrink:0" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>Edit`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeStatusDropdown();
        openEditModal(convId);
      });

      const sep = document.createElement('div');
      sep.className = 'conv-menu-sep';

      const delBtn = document.createElement('button');
      delBtn.className = 'status-opt status-opt-danger';
      delBtn.setAttribute('role', 'menuitem');
      delBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" style="margin-right:9px;flex-shrink:0" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>Delete`;
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); renderConfirm(); });

      menu.append(editBtn, sep, delBtn);
    }

    function renderConfirm() {
      menu.innerHTML = '';

      const label = document.createElement('div');
      label.className = 'conv-menu-confirm-label';
      label.textContent = 'Delete this chat?';

      const yesBtn = document.createElement('button');
      yesBtn.className = 'status-opt status-opt-danger';
      yesBtn.setAttribute('role', 'menuitem');
      yesBtn.textContent = 'Yes, delete';
      yesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeStatusDropdown();
        deleteConversation(convId);
      });

      const noBtn = document.createElement('button');
      noBtn.className = 'status-opt';
      noBtn.setAttribute('role', 'menuitem');
      noBtn.textContent = 'Cancel';
      noBtn.addEventListener('click', (e) => { e.stopPropagation(); renderMain(); });

      menu.append(label, yesBtn, noBtn);
    }

    renderMain();
    document.body.appendChild(menu);
    openDropdownEl = menu;
  }

  // ============================================================
  // Delete Conversation
  // ============================================================

  function deleteConversation(convId) {
    const idx = conversations.findIndex((c) => c.id === convId);
    if (idx === -1) return;
    conversations.splice(idx, 1);
    saveConversations();
    renderSidebar();

    if (activeConvId === convId) {
      switchConversation(conversations[0]?.id ?? null);
    }
  }

  // ============================================================
  // Edit Conversation Modal
  // ============================================================

  function openEditModal(convId) {
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;
    editingConvId = convId;
    editProspectInput.value  = conv.name;
    editCompanyInput.value   = conv.company || '';
    editConvSaveBtn.disabled = false;
    editConvModal.classList.remove('hidden');
    editProspectInput.focus();
    editProspectInput.select();
  }

  function closeEditModal() {
    editConvModal.classList.add('hidden');
    editingConvId = null;
  }

  function saveEditConv() {
    const name = editProspectInput.value.trim();
    if (!name) return;
    const conv = conversations.find((c) => c.id === editingConvId);
    if (!conv) return;
    conv.name    = name;
    conv.company = editCompanyInput.value.trim();
    saveConversations();
    renderSidebar();
    closeEditModal();
  }

  editProspectInput.addEventListener('input', () => {
    editConvSaveBtn.disabled = editProspectInput.value.trim() === '';
  });
  editProspectInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEditConv(); }
    if (e.key === 'Escape') closeEditModal();
  });
  editCompanyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEditConv(); }
    if (e.key === 'Escape') closeEditModal();
  });
  editConvSaveBtn.addEventListener('click', saveEditConv);
  editConvCancelBtn.addEventListener('click', closeEditModal);
  editConvModalClose.addEventListener('click', closeEditModal);
  editConvModal.addEventListener('click', (e) => { if (e.target === editConvModal) closeEditModal(); });

  // ============================================================
  // Switching Conversations
  // ============================================================

  function switchConversation(id) {
    activeConvId = id;
    updateSidebarActive();
    updateProductPill();
    renderMainPanel();
  }

  // ============================================================
  // New Prospect Chat Modal
  // ============================================================

  function checkKbStatus(name) {
    if (!kbStatusMsg) return;
    const trimmed = (name || '').trim();
    if (!trimmed) {
      kbStatusMsg.classList.add('hidden');
      kbStatusMsg.textContent = '';
      return;
    }
    const found = KB_PROSPECTS.includes(trimmed.toLowerCase());
    kbStatusMsg.classList.remove('hidden', 'kb-status-msg--found', 'kb-status-msg--not-found');
    if (found) {
      kbStatusMsg.classList.add('kb-status-msg--found');
      kbStatusMsg.textContent = `Notes found for ${trimmed} — RepReady will use their KB entry.`;
    } else {
      kbStatusMsg.classList.add('kb-status-msg--not-found');
      kbStatusMsg.textContent = 'No notes found for this name — you can still ask product and company questions.';
    }
  }

  function updateNewConvStartBtn() {
    const nameOk    = convProspectInput.value.trim() !== '';
    const companyOk = convCompanyInput.value.trim() !== '';
    newConvStartBtn.disabled = !(nameOk && companyOk);
  }

  function openNewConvModal() {
    convProspectInput.value  = '';
    convCompanyInput.value   = '';
    newConvStartBtn.disabled = true;
    if (kbStatusMsg) {
      kbStatusMsg.classList.add('hidden');
      kbStatusMsg.textContent = '';
    }
    prospectCardRow?.querySelectorAll('.prospect-card').forEach((card) => {
      card.classList.remove('prospect-card--selected');
    });
    newConvModal.classList.remove('hidden');
    convProspectInput.focus();
  }

  function closeNewConvModal() {
    newConvModal.classList.add('hidden');
  }

  convProspectInput.addEventListener('input', updateNewConvStartBtn);
  convProspectInput.addEventListener('keyup', () => {
    checkKbStatus(convProspectInput.value);
  });
  convCompanyInput.addEventListener('input', updateNewConvStartBtn);

  prospectCardRow?.addEventListener('click', (e) => {
    const card = e.target.closest('.prospect-card');
    if (!card) return;
    convProspectInput.value = card.dataset.name || '';
    convCompanyInput.value  = card.dataset.company || '';
    updateNewConvStartBtn();
    prospectCardRow.querySelectorAll('.prospect-card').forEach((el) => {
      el.classList.toggle('prospect-card--selected', el === card);
    });
    checkKbStatus(convProspectInput.value);
  });
  convProspectInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); tryStartProspectChat(); }
    if (e.key === 'Escape') closeNewConvModal();
  });
  convCompanyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); tryStartProspectChat(); }
    if (e.key === 'Escape') closeNewConvModal();
  });

  function tryStartProspectChat() {
    const name = convProspectInput.value.trim();
    const company = convCompanyInput.value.trim();
    if (!name || !company) return;
    closeNewConvModal();
    createConversation(name, company, 'general');
  }

  newConvStartBtn.addEventListener('click', tryStartProspectChat);
  newConvCancelBtn.addEventListener('click', closeNewConvModal);
  newConvModalClose.addEventListener('click', closeNewConvModal);
  newConvModal.addEventListener('click', (e) => { if (e.target === newConvModal) closeNewConvModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!newConvModal.classList.contains('hidden'))  closeNewConvModal();
    if (!editConvModal.classList.contains('hidden')) closeEditModal();
  });

  // ============================================================
  // Input Wiring
  // ============================================================

  questionInput.addEventListener('input', () => {
    autoResize(questionInput);
    if (!questionInput.disabled) sendBtn.disabled = questionInput.value.trim() === '' || isStreaming;
  });

  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && questionInput.value.trim()) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!isStreaming && questionInput.value.trim()) sendMessage();
  });

  noChatNewBtn.addEventListener('click', openNewConvModal);
  topbarNewChatBtn?.addEventListener('click', openNewConvModal);

  phasePrepBtn.addEventListener('click', () => setSessionPhase('prep'));
  phaseLiveBtn.addEventListener('click', () => setSessionPhase('live'));

  const HINT_CHIP_ARROW = '<svg class="hint-chip-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  function hideProspectPrep() {
    const section = document.getElementById('prospectPrepSection');
    const container = document.getElementById('prospectChipsContainer');
    if (section) section.classList.add('hidden');
    if (container) container.innerHTML = '';
  }

  function showProspectChips(name, company) {
    removeSuggestionChips();
    const section = document.getElementById('prospectPrepSection');
    const label = document.getElementById('prospectPrepLabel');
    const container = document.getElementById('prospectChipsContainer');
    if (!container) return;

    if (label) {
      label.textContent = `Prepare for your call with ${name}`;
    }

    const chips = [];
    if (KB_PROSPECTS.includes(name.trim().toLowerCase())) {
      chips.push({ text: `What should I know about ${name} before the call?`, type: 'person' });
    }
    chips.push(
      { text: `What should I know about ${company || 'this company'} to help me in the call?`, type: 'company' },
      { text: 'What objections should I expect on this call?', type: null },
    );

    const wrap = document.createElement('div');
    wrap.className = 'hints-grid';
    wrap.id = 'suggestionChips';

    chips.forEach(({ text, type }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hint-chip hint-chip--action';
      btn.innerHTML = `<span>${escapeHtml(text)}</span>${HINT_CHIP_ARROW}`;
      btn.addEventListener('click', () => {
        removeSuggestionChips();
        sendMessage(text, { questionType: type });
      });
      wrap.appendChild(btn);
    });

    container.appendChild(wrap);
    if (section) section.classList.toggle('hidden', getChatMode() !== 'prep');
    scrollBottom();
  }

  function removeSuggestionChips() {
    const el = document.getElementById('suggestionChips');
    if (!el) return;
    const isProspect = Boolean(el.closest('#prospectChipsContainer'));
    el.remove();
    if (isProspect) hideProspectPrep();
  }

  function fillInputFromChip(text) {
    if (!activeConvId || questionInput.disabled) return;
    questionInput.value = text;
    autoResize(questionInput);
    sendBtn.disabled = questionInput.value.trim() === '' || isStreaming;
    questionInput.focus();
  }

  welcomeState?.addEventListener('click', (e) => {
    const chip = e.target.closest('.hint-chip--fill');
    if (!chip) return;
    fillInputFromChip(chip.textContent.trim());
  });

  document.getElementById('liveExamplesSection')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.hint-chip--fill');
    if (!chip) return;
    fillInputFromChip(chip.textContent.trim());
  });

  // ============================================================
  // Core Send Flow
  // ============================================================

  function sendMessage(questionOverride, options = {}) {
    const question = (questionOverride ?? questionInput.value).trim();
    if (!question || isStreaming || !activeConvId) return;

    removeSuggestionChips();

    if (!hasStarted) {
      hasStarted = true;
      noChatState.classList.add('hidden');
      welcomeState.classList.add('hidden');
    }

    if (!questionOverride) clearInput();
    else {
      questionInput.value = '';
      autoResize(questionInput);
      sendBtn.disabled = true;
    }
    appendUserBubble(question);
    saveUserMessage(question);

    if (getChatMode() === 'live') {
      const conv = getActiveConv();
      if (conv) {
        conv.liveHintsHidden = true;
        saveConversations();
      }
      document.getElementById('liveExamplesSection')?.classList.add('hidden');
    }

    streamBotResponse(question, options);
  }

  async function streamBotResponse(question, options = {}) {
    const { silent = false, onComplete = null, questionType = null } = options;
    const targetConvId = activeConvId;
    isStreaming = true;
    setLoading(true);

    const thinkingEl   = appendThinkingIndicator();
    let botBubble      = null;
    let fullText       = '';
    let pendingSources = [];
    let firstToken     = true;

    try {
      const conv    = getActiveConv();
      const allMsgs = conv ? conv.messages : [];
      const history = allMsgs.slice(-5, -1).map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question,
          product:         conv?.product || 'general',
          history,
          session_id:      conv?.sessionId || newSessionId(),
          mode:            getChatMode(),
          prospect_name:   conv?.name || '',
          prospect_company: conv?.company || '',
          question_type:   questionType || null,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   currentEvent = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (currentEvent === 'sources') {
              try { pendingSources = JSON.parse(data); } catch (_) {}
              currentEvent = null;
              continue;
            }

            if (data === '[DONE]') {
              if (botBubble) {
                finalizeBubble(botBubble, fullText);
                const contentEl = botBubble.closest('.message-content');
                if (contentEl) {
                  appendSourcePills(contentEl, pendingSources);
                  appendFeedbackButtons(contentEl);
                }
              }
              const targetConv = conversations.find((c) => c.id === targetConvId);
              if (targetConv) {
                targetConv.messages.push({ role: 'assistant', content: fullText });
                saveConversations();
              }
              if (onComplete && activeConvId === targetConvId) onComplete();
              break outer;
            }

            const token = data.replace(/\\n/g, '\n');
            if (token === '') continue;

            if (firstToken) {
              firstToken = false;
              thinkingEl.remove();
              botBubble = appendBotBubble();
            }

            fullText += token;
            if (botBubble) {
              botBubble.textContent = fullText;
              scrollBottom();
            }
          }

          if (line === '') currentEvent = null;
        }
      }

    } catch (err) {
      thinkingEl.remove();
      appendErrorBubble();
      console.error('[RepReady]', err);
    } finally {
      isStreaming = false;
      setLoading(false);
      questionInput.focus();
    }
  }

  // ============================================================
  // DOM Builders
  // ============================================================

  function appendUserBubble(text) {
    const el = document.createElement('div');
    el.className = 'message message-user';
    el.innerHTML = `<div class="bubble bubble-user"></div>`;
    el.querySelector('.bubble-user').textContent = text;
    messagesEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function appendThinkingIndicator() {
    const el = document.createElement('div');
    el.className = 'message message-bot';
    el.id = 'thinking-row';
    el.innerHTML = `
      <div class="bot-avatar" aria-hidden="true">RR</div>
      <div class="message-content">
        <div class="bubble bubble-bot">
          <div class="thinking" aria-label="Thinking">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
    messagesEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function appendBotBubble() {
    const row = document.createElement('div');
    row.className = 'message message-bot';
    row.innerHTML = `
      <div class="bot-avatar" aria-hidden="true">RR</div>
      <div class="message-content">
        <div class="bubble bubble-bot streaming"></div>
      </div>
    `;
    messagesEl.appendChild(row);
    scrollBottom();
    return row.querySelector('.bubble-bot');
  }

  function appendStoredBotBubble(rawText) {
    const row = document.createElement('div');
    row.className = 'message message-bot';
    row.innerHTML = `
      <div class="bot-avatar" aria-hidden="true">RR</div>
      <div class="message-content">
        <div class="bubble bubble-bot"></div>
      </div>
    `;
    row.querySelector('.bubble-bot').innerHTML = renderMarkdown(rawText);
    messagesEl.appendChild(row);
    return row;
  }

  function appendErrorBubble() {
    const row = document.createElement('div');
    row.className = 'message message-bot';
    row.innerHTML = `
      <div class="bot-avatar" aria-hidden="true">RR</div>
      <div class="message-content">
        <div class="bubble bubble-bot bubble-error">
          Something went wrong — please try again.
        </div>
      </div>
    `;
    messagesEl.appendChild(row);
    scrollBottom();
  }

  function finalizeBubble(bubble, rawText) {
    bubble.classList.remove('streaming');
    bubble.innerHTML = renderMarkdown(rawText);
  }

  function appendSourcePills(contentEl, sources) {
    if (!sources || sources.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'source-pills';
    sources.forEach((src) => {
      const pill = document.createElement('span');
      pill.className = 'source-pill';
      pill.textContent = '📄 ' + src;
      wrap.appendChild(pill);
    });
    contentEl.appendChild(wrap);
  }

  function appendFeedbackButtons(contentEl) {
    const wrap = document.createElement('div');
    wrap.className = 'feedback-buttons';
    wrap.setAttribute('aria-label', 'Was this answer helpful?');
    wrap.innerHTML = `
      <button class="feedback-btn" data-vote="up" title="Helpful" aria-label="Thumbs up">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
      </button>
      <button class="feedback-btn" data-vote="down" title="Not helpful" aria-label="Thumbs down">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
          <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
        </svg>
      </button>
    `;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.feedback-btn');
      if (!btn) return;
      wrap.querySelectorAll('.feedback-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    contentEl.appendChild(wrap);
  }

  // ============================================================
  // Markdown Renderer
  // ============================================================

  function renderMarkdown(text) {
    text = text.replace(/([^\n])\s+Next move:/gi, '$1\n• Next move:');
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
    const items = [];
    let currentBullet = null;

    for (const line of lines) {
      const trimmed     = line.trim();
      const bulletMatch = trimmed.match(/^([•\-\*]|\d+\.)\s+(.+)/);

      if (bulletMatch) {
        if (currentBullet !== null) items.push(currentBullet);
        currentBullet = bulletMatch[2];
      } else if (currentBullet !== null) {
        currentBullet += ' ' + trimmed;
      } else {
        items.push({ type: 'p', text: trimmed });
        continue;
      }
    }
    if (currentBullet !== null) items.push(currentBullet);

    let hasBullets = false;
    let html = '';
    const wrapped = items.map((item) => {
      if (typeof item === 'string') {
        hasBullets = true;
        const isNextMove = /next move:/i.test(item);
        const liClass = isNextMove ? ' class="next-move-item"' : '';
        return `<li${liClass}><span>${formatInline(item)}</span></li>`;
      }
      return `<p>${formatInline(item.text)}</p>`;
    });

    if (hasBullets) {
      let inList = false;
      for (const fragment of wrapped) {
        if (fragment.startsWith('<li>')) {
          if (!inList) { html += '<ul>'; inList = true; }
          html += fragment;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += fragment;
        }
      }
      if (inList) html += '</ul>';
    } else {
      html = wrapped.join('');
    }

    return html || escapeHtml(text);
  }

  function formatInline(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/Next move:/gi, '<strong class="next-move-label">Next move:</strong>')
      .replace(/\(([a-zA-Z0-9_\s]+)\)/g, '<span class="source-inline">($1)</span>');
  }

  // ============================================================
  // Utilities
  // ============================================================

  function clearInput() {
    questionInput.value = '';
    autoResize(questionInput);
    sendBtn.disabled = true;
  }

  function setLoading(on) {
    sendBtn.classList.toggle('loading', on);
    questionInput.setAttribute('aria-busy', String(on));
    if (on) {
      sendBtn.disabled = true;
      questionInput.disabled = true;
    } else {
      updateInputAvailability();
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function scrollBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function initials(name) {
    return name.trim().split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase() || '??';
  }

  function avatarHue(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % 360;
    return h;
  }

  function formatRelativeTime(isoString) {
    const diff  = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)   return 'just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  === 1) return 'Yesterday';
    if (days  < 7)   return `${days}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // Init
  // ============================================================

  loadConversations();
  renderSidebar();
  renderMainPanel();
  syncKbFileList(getActiveConv()?.product);

  // ============================================================
  // View Routing
  // ============================================================

  const ALL_PAGES = [landingEl, appEl, gapsEl];

  function _hideAll() {
    ALL_PAGES.forEach((el) => el && el.classList.add('hidden'));
  }

  function showApp() {
    _hideAll();
    appEl.classList.remove('hidden');
    history.replaceState(null, '', '#app');
    updateProductPill();
    renderMainPanel();
  }

  function showLanding() {
    _hideAll();
    landingEl.classList.remove('hidden');
    history.replaceState(null, '', location.pathname);
  }

  function showGaps() {
    _hideAll();
    gapsEl.classList.remove('hidden');
    history.replaceState(null, '', '#gaps');
    window.scrollTo(0, 0);
    loadGaps();
  }

  function navigate(hash) {
    switch (hash) {
      case 'app':            showApp();           break;
      default:               showLanding();       break;
    }
  }

  async function loadGaps() {
    const container = document.getElementById('gapsContent');
    const loading   = document.getElementById('gapsLoading');
    if (loading) loading.style.display = 'block';
    try {
      const res  = await fetch('/gaps');
      const data = await res.json();
      renderGaps(container, data);
    } catch (_) {
      container.innerHTML = '<p class="gaps-loading">Failed to load gaps. Make sure the server is running.</p>';
    }
  }

  function renderGaps(container, data) {
    const products = Object.keys(data);
    if (products.length === 0) {
      container.innerHTML = `
        <div class="gaps-empty">
          <div class="gaps-empty-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 class="gaps-empty-title">No gaps logged yet</h3>
          <p class="gaps-empty-desc">RepReady will log questions it can't confidently answer here.</p>
        </div>`;
      return;
    }
    container.innerHTML = products.map((product) => {
      const items = data[product];
      const name  = product.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const rows  = items.map((item) => {
        const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
        return `
          <li class="gap-item">
            <div class="gap-item-dot"></div>
            <div class="gap-item-body">
              <p class="gap-item-question">${escapeHtml(item.question)}</p>
              <span class="gap-item-meta">${date}${item.max_score != null ? ` · score ${item.max_score}` : ''}</span>
            </div>
          </li>`;
      }).join('');
      return `
        <div class="gap-product-group">
          <div class="gap-product-header">
            <span class="gap-product-name">${name}</span>
            <span class="gap-count-badge">${items.length} gap${items.length !== 1 ? 's' : ''}</span>
          </div>
          <ul class="gap-list">${rows}</ul>
        </div>`;
    }).join('');
  }

  document.querySelectorAll('.js-open-app').forEach((btn) => {
    btn.addEventListener('click', () => navigate('app'));
  });
  document.querySelectorAll('.js-nav-landing').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.preventDefault(); navigate('landing'); });
  });

  backBtn.addEventListener('click', () => navigate('landing'));
  logoLink.addEventListener('click', (e) => { e.preventDefault(); navigate('landing'); });

  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) navigate(initialHash);

})();
