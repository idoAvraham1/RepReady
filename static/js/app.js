/** RepReady chat — ES module entry: init + event wiring */

import { state } from './state.js';
import {
  questionInput,
  sendBtn,
  noChatNewBtn,
  topbarNewChatBtn,
  phasePrepBtn,
  phaseLiveBtn,
  activeProductPill,
  welcomeState,
  backBtn,
  logoLink,
  newConvModal,
  newConvModalClose,
  newConvCancelBtn,
  newConvStartBtn,
  convProspectInput,
  convCompanyInput,
  prospectCardRow,
  editConvModal,
  editConvModalClose,
  editConvCancelBtn,
  editConvSaveBtn,
  editProspectInput,
  editCompanyInput,
} from './dom.js';
import { autoResize } from './utils.js';
import {
  loadConversations,
  getActiveConv,
  setSessionPhase,
  setLiveHintsHidden,
  closeStatusDropdown,
  renderSidebar,
  setConversationHooks,
} from './conversations.js';
import {
  sendMessage,
  fillInputFromChip,
} from './chat.js';
import {
  renderMainPanel,
  syncKbFileList,
  showProductSwitchDropdown,
  closeEditModal,
  saveEditConv,
  checkKbStatus,
  updateNewConvStartBtn,
  openNewConvModal,
  closeNewConvModal,
  tryStartProspectChat,
  navigate,
  updateProductPill,
  updateSessionPhaseUI,
  updateInputAvailability,
  openEditModal,
} from './ui.js';

setConversationHooks({
  onSwitch: () => {
    updateProductPill();
    renderMainPanel();
  },
  onPhase: () => {
    updateSessionPhaseUI();
    updateInputAvailability();
  },
  onEdit: (convId) => openEditModal(convId),
});

// Dropdown dismiss
document.addEventListener('click', () => closeStatusDropdown());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStatusDropdown();
});

// Product pill
activeProductPill.addEventListener('click', (e) => {
  if (activeProductPill.disabled) return;
  e.stopPropagation();
  if (state.openDropdownEl) {
    closeStatusDropdown();
    return;
  }
  showProductSwitchDropdown();
});

// Edit modal
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

// New conversation modal
convProspectInput.addEventListener('input', updateNewConvStartBtn);
convProspectInput.addEventListener('keyup', () => {
  checkKbStatus(convProspectInput.value);
});
convCompanyInput.addEventListener('input', updateNewConvStartBtn);

prospectCardRow?.addEventListener('click', (e) => {
  const card = e.target.closest('.prospect-card');
  if (!card) return;
  convProspectInput.value = card.dataset.name || '';
  convCompanyInput.value = card.dataset.company || '';
  updateNewConvStartBtn();
  prospectCardRow.querySelectorAll('.prospect-card').forEach((el) => {
    el.classList.toggle('prospect-card--selected', el === card);
  });
  checkKbStatus(convProspectInput.value);
});
convProspectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); tryStartProspectChat(); }
  if (e.key === 'Escape') closeNewConvModal();
});
convCompanyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); tryStartProspectChat(); }
  if (e.key === 'Escape') closeNewConvModal();
});

newConvStartBtn.addEventListener('click', tryStartProspectChat);
newConvCancelBtn.addEventListener('click', closeNewConvModal);
newConvModalClose.addEventListener('click', closeNewConvModal);
newConvModal.addEventListener('click', (e) => {
  if (e.target === newConvModal) closeNewConvModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!newConvModal.classList.contains('hidden')) closeNewConvModal();
  if (!editConvModal.classList.contains('hidden')) closeEditModal();
});

// Input wiring
questionInput.addEventListener('input', () => {
  autoResize(questionInput);
  if (!questionInput.disabled) {
    sendBtn.disabled = questionInput.value.trim() === '' || state.isStreaming;
  }
});

questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!state.isStreaming && questionInput.value.trim()) sendMessage();
  }
});

sendBtn.addEventListener('click', () => {
  if (!state.isStreaming && questionInput.value.trim()) sendMessage();
});

noChatNewBtn.addEventListener('click', openNewConvModal);
topbarNewChatBtn?.addEventListener('click', openNewConvModal);

phasePrepBtn.addEventListener('click', () => setSessionPhase('prep'));
phaseLiveBtn.addEventListener('click', () => setSessionPhase('live'));

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

document.getElementById('liveExamplesDismissBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  setLiveHintsHidden(true);
});

document.getElementById('liveTipsRestoreBtn')?.addEventListener('click', () => {
  setLiveHintsHidden(false);
});

// View routing
document.querySelectorAll('.js-open-app').forEach((btn) => {
  btn.addEventListener('click', () => navigate('app'));
});
document.querySelectorAll('.js-nav-landing').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });
});

backBtn.addEventListener('click', () => navigate('landing'));
logoLink.addEventListener('click', (e) => {
  e.preventDefault();
  navigate('landing');
});

// Init
loadConversations();
renderSidebar();
renderMainPanel();
syncKbFileList(getActiveConv()?.product);

const initialHash = window.location.hash.replace('#', '');
if (initialHash) navigate(initialHash);
