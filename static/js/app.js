/* ============================================================
   RepReady — Chat Application
   localStorage conversations · SSE streaming · RAG attribution
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // DOM Refs
  // ============================================================

  const chatArea          = document.getElementById('chatArea');
  const noChatState       = document.getElementById('noChatState');
  const welcomeState      = document.getElementById('welcomeState');
  const messagesEl        = document.getElementById('messages');
  const questionInput     = document.getElementById('questionInput');
  const sendBtn           = document.getElementById('sendBtn');
  const inputArea         = document.getElementById('inputArea');
  const newChatBtn        = document.getElementById('newChatBtn');
  const sidebarNewChatBtn = document.getElementById('sidebarNewChatBtn');
  const noChatNewBtn      = document.getElementById('noChatNewBtn');
  const convList          = document.getElementById('convList');
  const convSectionLabel  = document.getElementById('convSectionLabel');

  // Product pill
  const activeProductPill  = document.getElementById('activeProductPill');
  const activeProductLabel = document.getElementById('activeProductLabel');

  const INPUT_PLACEHOLDER_ACTIVE = 'Ask about pricing, features, integrations…';
  const INPUT_PLACEHOLDER_IDLE   = 'Select or create a chat to start';

  // View routing
  const landingEl         = document.getElementById('landing');
  const appEl             = document.getElementById('app');
  const bestPracticesEl   = document.getElementById('best-practices');
  const gapsEl            = document.getElementById('gaps');
  const backBtn           = document.getElementById('backBtn');
  const logoLink          = document.getElementById('logoLink');
  const newConvModal      = document.getElementById('newConvModal');
  const newConvModalClose = document.getElementById('newConvModalClose');
  const newConvCancelBtn  = document.getElementById('newConvCancelBtn');
  const newConvStartBtn   = document.getElementById('newConvStartBtn');
  const convProspectInput = document.getElementById('convProspectName');
  const convCompanyInput  = document.getElementById('convCompanyName');

  const editConvModal      = document.getElementById('editConvModal');
  const editConvModalClose = document.getElementById('editConvModalClose');
  const editConvCancelBtn  = document.getElementById('editConvCancelBtn');
  const editConvSaveBtn    = document.getElementById('editConvSaveBtn');
  const editProspectInput  = document.getElementById('editProspectName');
  const editCompanyInput   = document.getElementById('editCompanyName');

  // ============================================================
  // State
  // ============================================================

  const STORAGE_KEY  = 'repready_conversations';
  let conversations  = [];
  let activeConvId   = null;
  let editingConvId  = null;
  let isStreaming    = false;
  let hasStarted     = false;
  let openDropdownEl = null; // currently open floating dropdown

  const PRODUCTS = [
    { id: 'general',      label: 'All Products',  dot: '#8b8fa8' },
    { id: 'repready_pro', label: 'RepReady Pro',   dot: '#6366f1' },
    { id: 'coachai',      label: 'CoachAI',        dot: '#22c55e' },
    { id: 'salestrain',   label: 'SalesTrain',     dot: '#f59e0b' },
    { id: 'signalhq',     label: 'SignalHQ',       dot: '#ef4444' },
    { id: 'dealdesk',     label: 'DealDesk',       dot: '#a78bfa' },
  ];

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
      id:        generateId(),
      name:      name.trim(),
      company:   (company || '').trim(),
      product:   product || 'general',
      status:    'progress',
      createdAt: new Date().toISOString(),
      messages:  [],
    };
    conversations.unshift(conv);
    saveConversations();
    renderSidebar();
    updateStats();
    switchConversation(conv.id);
    return conv;
  }

  function getActiveConv() {
    return conversations.find((c) => c.id === activeConvId) || null;
  }

  function updateConvStatus(id, status) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    conv.status = status;
    saveConversations();
    renderSidebar();
    updateStats();
  }

  function saveUserMessage(content) {
    const conv = getActiveConv();
    if (!conv) return;
    conv.messages.push({ role: 'user', content });
    saveConversations();
  }

  function saveAssistantMessage(content) {
    const conv = getActiveConv();
    if (!conv) return;
    conv.messages.push({ role: 'assistant', content });
    saveConversations();
  }

  // ============================================================
  // Main Panel + Input State
  // ============================================================

  function updateInputAvailability() {
    const enabled = !!activeConvId;
    questionInput.disabled = !enabled;
    activeProductPill.disabled = !enabled;
    questionInput.placeholder = enabled ? INPUT_PLACEHOLDER_ACTIVE : INPUT_PLACEHOLDER_IDLE;

    if (enabled) {
      inputArea.classList.remove('input-area--disabled');
      sendBtn.disabled = questionInput.value.trim() === '' || isStreaming;
    } else {
      inputArea.classList.add('input-area--disabled');
      sendBtn.disabled = true;
    }
  }

  function renderMainPanel() {
    messagesEl.innerHTML = '';
    clearInput();

    if (!activeConvId) {
      hasStarted = false;
      noChatState.classList.remove('hidden');
      welcomeState.classList.add('hidden');
      updateInputAvailability();
      return;
    }

    const conv = getActiveConv();
    const msgs = conv ? conv.messages : [];

    if (msgs.length === 0) {
      hasStarted = false;
      noChatState.classList.add('hidden');
      welcomeState.classList.remove('hidden');
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
    const hasConvs = conversations.length > 0;
    convSectionLabel.style.display = hasConvs ? '' : 'none';

    conversations.forEach((conv) => {
      convList.appendChild(buildConvItem(conv));
    });
    updateSidebarActive();
  }

  function buildConvItem(conv) {
    const item = document.createElement('div');
    item.className = `conv-item status-${conv.status}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.dataset.id = conv.id;

    item.innerHTML = `
      <div class="status-dot-wrap" title="Change status">
        <span class="status-dot"></span>
      </div>
      <div class="conv-avatar" aria-hidden="true">${initials(conv.name)}</div>
      <div class="conv-meta">
        <span class="conv-name">${escapeHtml(conv.name)}</span>
        <span class="conv-company">${escapeHtml(conv.company || '')}</span>
      </div>
      <span class="conv-time">${formatRelativeTime(conv.createdAt)}</span>
      <button class="conv-menu-btn" title="More options" aria-label="More options" aria-haspopup="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
    `;

    // Click on item body → switch conversation
    item.addEventListener('click', (e) => {
      if (e.target.closest('.status-dot-wrap') || e.target.closest('.conv-menu-btn')) return;
      switchConversation(conv.id);
    });

    // Status dot click → status dropdown
    const dotWrap = item.querySelector('.status-dot-wrap');
    dotWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      showStatusDropdown(dotWrap, conv.id);
    });

    // ··· button click → conv action menu
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

  function updateStats() {
    const chips = document.querySelectorAll('.sidebar-stats .stat-chip');
    const won      = conversations.filter((c) => c.status === 'won').length;
    const progress = conversations.filter((c) => c.status === 'progress').length;
    const lost     = conversations.filter((c) => c.status === 'lost').length;
    chips[0].textContent = `${won} Won`;
    chips[1].textContent = `${progress} Active`;
    chips[2].textContent = `${lost} Lost`;
  }

  // ============================================================
  // Status Dropdown (floating, fixed-position to avoid clip)
  // ============================================================

  function showStatusDropdown(dotEl, convId) {
    closeStatusDropdown();

    const rect = dotEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'status-dropdown-float';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `left:${rect.right + 8}px;top:${rect.top - 4}px;`;

    const opts = [
      { status: 'won',      label: '🟢 Mark as Won' },
      { status: 'progress', label: '🟡 In Progress' },
      { status: 'lost',     label: '🔴 Mark as Lost' },
    ];
    opts.forEach(({ status, label }) => {
      const btn = document.createElement('button');
      btn.className = 'status-opt';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateConvStatus(convId, status);
        closeStatusDropdown();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    openDropdownEl = menu;
  }

  function closeStatusDropdown() {
    if (openDropdownEl) {
      openDropdownEl._anchorItem && openDropdownEl._anchorItem.classList.remove('menu-open');
      openDropdownEl.remove();
      openDropdownEl = null;
    }
  }

  document.addEventListener('click', () => closeStatusDropdown());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStatusDropdown();
  });

  // ============================================================
  // Product Pill — display + switch dropdown
  // ============================================================

  function updateProductPill() {
    const conv = getActiveConv();
    const pid  = conv?.product || 'general';
    const p    = PRODUCTS.find((x) => x.id === pid) || PRODUCTS[0];
    activeProductLabel.textContent = p.label;
    const dot = activeProductPill.querySelector('.active-product-dot');
    if (dot) dot.style.background = p.dot;
    activeProductPill.dataset.product = pid;
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

    const conv = getActiveConv();
    const currentPid = conv?.product || 'general';

    PRODUCTS.forEach(({ id, label, dot }) => {
      const btn = document.createElement('button');
      btn.className = 'status-opt' + (id === currentPid ? ' status-opt-active' : '');
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;margin-right:10px;display:inline-block"></span>${label}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeStatusDropdown();
        if (conv && id !== currentPid) {
          const prevProduct = conv.product;
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

    // Right-align to the button, appear below it
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
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderConfirm();
      });

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
      noBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderMain();
      });

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
    updateStats();

    if (activeConvId === convId) {
      if (conversations.length > 0) {
        switchConversation(conversations[0].id);
      } else {
        activeConvId = null;
        renderMainPanel();
      }
    }
  }

  // ============================================================
  // Edit Conversation Modal
  // ============================================================

  function openEditModal(convId) {
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;
    editingConvId = convId;
    editProspectInput.value = conv.name;
    editCompanyInput.value  = conv.company || '';
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
    if (e.key === 'Enter') { e.preventDefault(); saveEditConv(); }
    if (e.key === 'Escape') closeEditModal();
  });

  editCompanyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEditConv(); }
    if (e.key === 'Escape') closeEditModal();
  });

  editConvSaveBtn.addEventListener('click', saveEditConv);
  editConvCancelBtn.addEventListener('click', closeEditModal);
  editConvModalClose.addEventListener('click', closeEditModal);
  editConvModal.addEventListener('click', (e) => {
    if (e.target === editConvModal) closeEditModal();
  });

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
  // New Conversation Modal
  // ============================================================

  function renderProductChips(containerId, activeId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    PRODUCTS.forEach(({ id, label, dot }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'product-chip' + (id === activeId ? ' active' : '');
      btn.dataset.product = id;
      btn.setAttribute('aria-pressed', String(id === activeId));
      btn.innerHTML = `<span class="product-chip-dot" style="background:${dot}" aria-hidden="true"></span>${label}`;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.product-chip').forEach((c) => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      });
      container.appendChild(btn);
    });
  }

  function openNewConvModal() {
    convProspectInput.value = '';
    convCompanyInput.value  = '';
    newConvStartBtn.disabled = true;
    renderProductChips('newConvProductSelector', 'general');
    newConvModal.classList.remove('hidden');
    convProspectInput.focus();
  }

  function closeNewConvModal() {
    newConvModal.classList.add('hidden');
  }

  convProspectInput.addEventListener('input', () => {
    newConvStartBtn.disabled = convProspectInput.value.trim() === '';
  });

  convProspectInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tryStartConv(); }
    if (e.key === 'Escape') closeNewConvModal();
  });

  convCompanyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tryStartConv(); }
    if (e.key === 'Escape') closeNewConvModal();
  });

  function tryStartConv() {
    const name = convProspectInput.value.trim();
    if (!name) return;
    const activeChip = document.querySelector('#newConvProductSelector .product-chip.active');
    const product = activeChip ? activeChip.dataset.product : 'general';
    closeNewConvModal();
    createConversation(name, convCompanyInput.value, product);
  }

  newConvStartBtn.addEventListener('click', tryStartConv);
  newConvCancelBtn.addEventListener('click', closeNewConvModal);
  newConvModalClose.addEventListener('click', closeNewConvModal);
  newConvModal.addEventListener('click', (e) => {
    if (e.target === newConvModal) closeNewConvModal();
  });

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
    if (!questionInput.disabled) {
      sendBtn.disabled = questionInput.value.trim() === '' || isStreaming;
    }
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

  // New Chat buttons open the creation modal
  newChatBtn.addEventListener('click', openNewConvModal);
  sidebarNewChatBtn.addEventListener('click', openNewConvModal);
  noChatNewBtn.addEventListener('click', openNewConvModal);

  // ============================================================
  // Core Send Flow
  // ============================================================

  function sendMessage() {
    const question = questionInput.value.trim();
    if (!question || isStreaming || !activeConvId) return;

    if (!hasStarted) {
      hasStarted = true;
      noChatState.classList.add('hidden');
      welcomeState.classList.add('hidden');
    }

    clearInput();
    appendUserBubble(question);
    saveUserMessage(question);
    streamBotResponse(question);
  }

  async function streamBotResponse(question) {
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
      // Last 4 messages before the current one = 2 full exchanges (user + assistant each).
      // saveUserMessage() was already called, so the current message is at allMsgs[-1];
      // we exclude it and take the 4 preceding messages for history context.
      const history = allMsgs.slice(-5, -1).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question,
          product: conv?.product || 'general',
          history,
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
              // Persist the completed assistant message
              saveAssistantMessage(fullText);
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

  // Renders a stored (non-streaming) bot message with full formatting
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
      pill.textContent = '\uD83D\uDCC4 ' + src;
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
    // If "Next move:" appears mid-bullet (not at line start), split it into its own bullet
    text = text.replace(/([^\n])\s+Next move:/gi, '$1\n• Next move:');
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
    const items = [];
    let currentBullet = null;

    for (const line of lines) {
      const trimmed = line.trim();
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
        return `<li><span>${formatInline(item)}</span></li>`;
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

  function formatRelativeTime(isoString) {
    const diff  = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)  return 'just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  === 1) return 'Yesterday';
    if (days  < 7)  return `${days}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return str
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
  updateStats();
  renderMainPanel();

  // ============================================================
  // View Routing
  // Central navigate(hash) dispatcher — add a new page by adding
  // a section to index.html, CSS rules, and a case here.
  // ============================================================

  const ALL_PAGES = [landingEl, appEl, bestPracticesEl, gapsEl];

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

  function showBestPractices() {
    _hideAll();
    bestPracticesEl.classList.remove('hidden');
    history.replaceState(null, '', '#best-practices');
    window.scrollTo(0, 0);
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
      case 'best-practices': showBestPractices(); break;
      case 'gaps':           showGaps();          break;
      default:               showLanding();       break;
    }
  }

  // ── Gaps data loader ─────────────────────────────────────
  async function loadGaps() {
    const container = document.getElementById('gapsContent');
    const loading   = document.getElementById('gapsLoading');
    if (loading) loading.style.display = 'block';

    try {
      const res  = await fetch('/gaps');
      const data = await res.json();
      renderGaps(container, data);
    } catch (err) {
      container.innerHTML = '<p class="gaps-loading">Failed to load gaps. Make sure the server is running.</p>';
    }
  }

  function renderGaps(container, data) {
    const products = Object.keys(data);

    if (products.length === 0) {
      container.innerHTML = `
        <div class="gaps-empty">
          <div class="gaps-empty-icon">✅</div>
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Event wiring ─────────────────────────────────────────

  // "Open App" / "Open Chats" buttons on landing page
  document.querySelectorAll('.js-open-app').forEach((btn) => {
    btn.addEventListener('click', () => navigate('app'));
  });

  // "Best Practices" landing nav button
  document.querySelectorAll('.js-nav-best-practices').forEach((btn) => {
    btn.addEventListener('click', () => navigate('best-practices'));
  });

  // "Knowledge Gaps" landing nav button
  document.querySelectorAll('.js-nav-gaps').forEach((btn) => {
    btn.addEventListener('click', () => navigate('gaps'));
  });

  // "Back" buttons on info pages go back to landing
  document.querySelectorAll('.js-nav-landing').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      navigate('landing');
    });
  });

  // Back button in app topbar
  backBtn.addEventListener('click', () => navigate('landing'));

  // Logo in app topbar goes back to landing
  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });

  // Deep-link: if page loaded with a hash, navigate to it
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) navigate(initialHash);

})();
