/** Phase/atmosphere UI, product pill, modals, view routing */

import { state, PRODUCTS, KB_PROSPECTS } from './state.js';
import {
  chatArea,
  noChatState,
  welcomeState,
  messagesEl,
  questionInput,
  inputArea,
  productPillBar,
  sessionPhaseToggle,
  phasePrepBtn,
  phaseLiveBtn,
  mainPanel,
  sidebarPhaseIndicator,
  sidebarPhaseLabel,
  sidebarPhaseSub,
  topbarContext,
  topbarProspectName,
  topbarProspectSep,
  topbarProspectCompany,
  activeProductPill,
  activeProductLabel,
  landingEl,
  appEl,
  newConvModal,
  convProspectInput,
  convCompanyInput,
  newConvStartBtn,
  kbStatusMsg,
  prospectCardRow,
  editConvModal,
  editProspectInput,
  editCompanyInput,
  editConvSaveBtn,
} from './dom.js';
import { scrollBottom } from './utils.js';
import {
  getActiveConv,
  getConvPhase,
  saveConversations,
  createConversation,
  closeStatusDropdown,
  renderSidebar,
} from './conversations.js';
import {
  clearInput,
  removeSuggestionChips,
  showProspectChips,
  hideProspectPrep,
  appendUserBubble,
  appendStoredBotBubble,
  appendProductDivider,
  updateInputAvailability,
} from './chat.js';

export { updateInputAvailability };

export function applyPhaseAtmosphere() {
  const conv = getActiveConv();
  const phase = getConvPhase(conv);
  const hasConv = !!state.activeConvId;

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

export function updateTopbarContext() {
  if (!topbarContext) return;

  const conv = getActiveConv();
  if (!conv || !state.activeConvId) {
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

export function updateSidebarPhaseIndicator() {
  if (!sidebarPhaseIndicator) return;

  const hasConv = !!state.activeConvId;
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

export function updateSessionPhaseUI() {
  if (sessionPhaseToggle) sessionPhaseToggle.hidden = !state.activeConvId;

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
  const liveTipsRestoreBtn = document.getElementById('liveTipsRestoreBtn');
  const conv = getActiveConv();
  const liveHintsHidden = !!conv?.liveHintsHidden;
  if (liveSection) {
    const showLive = !!state.activeConvId && phase === 'live' && !liveHintsHidden;
    liveSection.classList.toggle('hidden', !showLive);
  }
  if (liveTipsRestoreBtn) {
    const showRestore = !!state.activeConvId && phase === 'live' && liveHintsHidden;
    liveTipsRestoreBtn.classList.toggle('hidden', !showRestore);
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

export function updateProductPillVisibility() {
  productPillBar.style.display = state.activeConvId ? '' : 'none';
  updateSessionPhaseUI();
}

export function renderMainPanel() {
  messagesEl.innerHTML = '';
  clearInput();
  removeSuggestionChips();
  updateProductPillVisibility();

  if (!state.activeConvId) {
    state.hasStarted = false;
    noChatState.classList.remove('hidden');
    welcomeState.classList.add('hidden');
    updateInputAvailability();
    updateTopbarContext();
    return;
  }

  const conv = getActiveConv();
  const msgs = conv ? conv.messages : [];

  if (msgs.length === 0) {
    state.hasStarted = false;
    noChatState.classList.add('hidden');
    welcomeState.classList.remove('hidden');
    if (conv) {
      showProspectChips(conv.name, conv.company);
    } else {
      hideProspectPrep();
    }
  } else {
    state.hasStarted = true;
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
  if (state.activeConvId) questionInput.focus();
}

export function syncKbFileList(productId) {
  const id = productId ?? getActiveConv()?.product;
  document.querySelectorAll('#kbFileList .kb-file').forEach((el) => {
    el.classList.toggle('kb-file--active', !!id && id !== 'general' && el.dataset.product === id);
  });
}

export function updateProductPill() {
  const conv = getActiveConv();
  const pid = conv?.product || 'general';
  const p = PRODUCTS.find((x) => x.id === pid) || PRODUCTS[0];
  activeProductLabel.textContent = p.label;
  const dot = activeProductPill.querySelector('.active-product-dot');
  if (dot) dot.style.background = p.dot;
  activeProductPill.dataset.product = pid;
  syncKbFileList(pid);
}

export function showProductSwitchDropdown() {
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
        if (state.hasStarted) appendProductDivider(label);
      }
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  state.openDropdownEl = menu;
}

export function openEditModal(convId) {
  const conv = state.conversations.find((c) => c.id === convId);
  if (!conv) return;
  state.editingConvId = convId;
  editProspectInput.value = conv.name;
  editCompanyInput.value = conv.company || '';
  editConvSaveBtn.disabled = false;
  editConvModal.classList.remove('hidden');
  editProspectInput.focus();
  editProspectInput.select();
}

export function closeEditModal() {
  editConvModal.classList.add('hidden');
  state.editingConvId = null;
}

export function saveEditConv() {
  const name = editProspectInput.value.trim();
  if (!name) return;
  const conv = state.conversations.find((c) => c.id === state.editingConvId);
  if (!conv) return;
  conv.name = name;
  conv.company = editCompanyInput.value.trim();
  saveConversations();
  renderSidebar();
  closeEditModal();
}

export function checkKbStatus(name) {
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

export function updateNewConvStartBtn() {
  const nameOk = convProspectInput.value.trim() !== '';
  const companyOk = convCompanyInput.value.trim() !== '';
  newConvStartBtn.disabled = !(nameOk && companyOk);
}

export function openNewConvModal() {
  convProspectInput.value = '';
  convCompanyInput.value = '';
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

export function closeNewConvModal() {
  newConvModal.classList.add('hidden');
}

export function tryStartProspectChat() {
  const name = convProspectInput.value.trim();
  const company = convCompanyInput.value.trim();
  if (!name || !company) return;
  closeNewConvModal();
  createConversation(name, company, 'general');
}

function hideAllPages() {
  [landingEl, appEl].forEach((el) => el && el.classList.add('hidden'));
}

export function showApp() {
  hideAllPages();
  appEl.classList.remove('hidden');
  history.replaceState(null, '', '#app');
  updateProductPill();
  renderMainPanel();
}

export function showLanding() {
  hideAllPages();
  landingEl.classList.remove('hidden');
  history.replaceState(null, '', location.pathname);
}

export function navigate(hash) {
  switch (hash) {
    case 'app': showApp(); break;
    default: showLanding(); break;
  }
}
