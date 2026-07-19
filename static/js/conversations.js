/** localStorage conversations, sidebar, switch chat */

import { state, STORAGE_KEY, LEGACY_ASSISTANT_ID } from './state.js';
import { convList, sidebarEmpty, topbarNewChatBtn } from './dom.js';
import {
  newSessionId,
  generateId,
  initials,
  avatarHue,
  formatRelativeTime,
  escapeHtml,
} from './utils.js';

/** Wired from app.js after modules load (avoids circular imports) */
let onConversationSwitch = null;
let onPhaseChange = null;
let onOpenEditModal = null;

export function setConversationHooks({ onSwitch, onPhase, onEdit }) {
  onConversationSwitch = onSwitch || null;
  onPhaseChange = onPhase || null;
  onOpenEditModal = onEdit || null;
}

export function getActiveConv() {
  return state.conversations.find((c) => c.id === state.activeConvId) || null;
}

export function getChatMode() {
  const conv = getActiveConv();
  return conv?.sessionPhase === 'live' ? 'live' : 'prep';
}

export function getConvPhase(conv) {
  return conv?.sessionPhase === 'live' ? 'live' : 'prep';
}

export function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.conversations = raw ? JSON.parse(raw) : [];
  } catch (_) {
    state.conversations = [];
  }
  let migrated = false;
  const before = state.conversations.length;
  state.conversations = state.conversations.filter((c) => c.id !== LEGACY_ASSISTANT_ID);
  if (state.conversations.length !== before) migrated = true;

  state.conversations.forEach((c) => {
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

export function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
  } catch (_) {}
}

export function createConversation(name, company, product) {
  const conv = {
    id: generateId(),
    sessionId: newSessionId(),
    sessionPhase: 'prep',
    name: name.trim(),
    company: (company || '').trim(),
    product: product || 'general',
    createdAt: new Date().toISOString(),
    messages: [],
  };
  state.conversations.unshift(conv);
  saveConversations();
  renderSidebar();
  switchConversation(conv.id);
  return conv;
}

export function saveUserMessage(content) {
  const conv = getActiveConv();
  if (!conv) return;
  conv.messages.push({ role: 'user', content });
  saveConversations();
}

export function deleteConversation(convId) {
  const idx = state.conversations.findIndex((c) => c.id === convId);
  if (idx === -1) return;
  state.conversations.splice(idx, 1);
  saveConversations();
  renderSidebar();

  if (state.activeConvId === convId) {
    switchConversation(state.conversations[0]?.id ?? null);
  }
}

export function setSessionPhase(phase) {
  const conv = getActiveConv();
  if (!conv) return;
  const next = phase === 'live' ? 'live' : 'prep';
  if (next === 'live' && conv.sessionPhase !== 'live') {
    conv.sessionId = newSessionId();
  }
  conv.sessionPhase = next;
  saveConversations();
  onPhaseChange?.();
  renderSidebar();
}

export function setLiveHintsHidden(hidden) {
  const conv = getActiveConv();
  if (!conv) return;
  conv.liveHintsHidden = !!hidden;
  saveConversations();
  onPhaseChange?.();
}

export function closeStatusDropdown() {
  if (state.openDropdownEl) {
    state.openDropdownEl._anchorItem && state.openDropdownEl._anchorItem.classList.remove('menu-open');
    state.openDropdownEl.remove();
    state.openDropdownEl = null;
  }
}

export function updateSidebarActive() {
  convList.querySelectorAll('.conv-item').forEach((el) => {
    const isActive = el.dataset.id === state.activeConvId;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', String(isActive));
  });
}

export function renderSidebar() {
  convList.innerHTML = '';
  state.conversations.forEach((conv) => convList.appendChild(buildConvItem(conv)));
  if (sidebarEmpty) {
    sidebarEmpty.classList.toggle('hidden', state.conversations.length > 0);
  }
  if (topbarNewChatBtn) {
    topbarNewChatBtn.classList.toggle('hidden', state.conversations.length === 0);
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
      onOpenEditModal?.(convId);
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
  state.openDropdownEl = menu;
}

export function switchConversation(id) {
  state.activeConvId = id;
  updateSidebarActive();
  onConversationSwitch?.(id);
}
