/** Chat send/stream, bubbles, markdown, prospect chips */

import {
  state,
  KB_PROSPECTS,
  INPUT_PLACEHOLDER_LIVE,
  INPUT_PLACEHOLDER_PREP,
  INPUT_PLACEHOLDER_IDLE,
} from './state.js';
import {
  messagesEl,
  questionInput,
  sendBtn,
  noChatState,
  welcomeState,
  inputArea,
  activeProductPill,
} from './dom.js';
import {
  escapeHtml,
  autoResize,
  scrollBottom,
  newSessionId,
} from './utils.js';
import {
  getActiveConv,
  getChatMode,
  saveConversations,
  saveUserMessage,
  setLiveHintsHidden,
} from './conversations.js';

export function updateInputAvailability() {
  const enabled = !!state.activeConvId;
  questionInput.disabled = !enabled;
  activeProductPill.disabled = !enabled;

  if (enabled) {
    const conv = getActiveConv();
    questionInput.placeholder = conv?.sessionPhase === 'live'
      ? INPUT_PLACEHOLDER_LIVE
      : INPUT_PLACEHOLDER_PREP;
    inputArea.classList.remove('input-area--disabled');
    sendBtn.disabled = questionInput.value.trim() === '' || state.isStreaming;
  } else {
    questionInput.placeholder = INPUT_PLACEHOLDER_IDLE;
    inputArea.classList.add('input-area--disabled');
    sendBtn.disabled = true;
  }
}

const HINT_CHIP_ARROW = '<svg class="hint-chip-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

const NEXT_MOVE_ARROW = '<svg class="next-move-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

export function clearInput() {
  questionInput.value = '';
  autoResize(questionInput);
  sendBtn.disabled = true;
}

export function setLoading(on) {
  sendBtn.classList.toggle('loading', on);
  questionInput.setAttribute('aria-busy', String(on));
  if (on) {
    sendBtn.disabled = true;
    questionInput.disabled = true;
  } else {
    updateInputAvailability();
  }
}

export function hideProspectPrep() {
  const section = document.getElementById('prospectPrepSection');
  const container = document.getElementById('prospectChipsContainer');
  if (section) section.classList.add('hidden');
  if (container) container.innerHTML = '';
}

export function removeSuggestionChips() {
  const el = document.getElementById('suggestionChips');
  if (!el) return;
  const isProspect = Boolean(el.closest('#prospectChipsContainer'));
  el.remove();
  if (isProspect) hideProspectPrep();
}

export function showProspectChips(name, company) {
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

  chips.forEach(({ text }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hint-chip hint-chip--action';
    btn.innerHTML = `<span>${escapeHtml(text)}</span>${HINT_CHIP_ARROW}`;
    btn.addEventListener('click', () => {
      removeSuggestionChips();
      sendMessage(text);
    });
    wrap.appendChild(btn);
  });

  container.appendChild(wrap);
  if (section) section.classList.toggle('hidden', getChatMode() !== 'prep');
  scrollBottom();
}

export function fillInputFromChip(text) {
  if (!state.activeConvId || questionInput.disabled) return;
  questionInput.value = text;
  autoResize(questionInput);
  sendBtn.disabled = questionInput.value.trim() === '' || state.isStreaming;
  questionInput.focus();
}

function coachEyebrowLabel() {
  return `coach — ${getChatMode()}`;
}

export function appendUserBubble(text) {
  const el = document.createElement('div');
  el.className = 'message message-user';
  el.innerHTML = `<div class="bubble bubble-user"></div>`;
  el.querySelector('.bubble-user').textContent = text;
  messagesEl.appendChild(el);
  scrollBottom();
  return el;
}

export function appendThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'message message-bot';
  el.id = 'thinking-row';
  el.innerHTML = `
    <div class="message-content">
      <div class="bubble bubble-bot">
        <span class="coach-eyebrow">${coachEyebrowLabel()}</span>
        <div class="bubble-bot-body">
          <div class="thinking" aria-label="Thinking">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>
  `;
  messagesEl.appendChild(el);
  scrollBottom();
  return el;
}

export function appendBotBubble() {
  const row = document.createElement('div');
  row.className = 'message message-bot';
  row.innerHTML = `
    <div class="message-content">
      <div class="bubble bubble-bot streaming">
        <span class="coach-eyebrow">${coachEyebrowLabel()}</span>
        <div class="bubble-bot-body"></div>
      </div>
    </div>
  `;
  messagesEl.appendChild(row);
  scrollBottom();
  return row.querySelector('.bubble-bot');
}

export function appendStoredBotBubble(rawText) {
  const row = document.createElement('div');
  row.className = 'message message-bot';
  row.innerHTML = `
    <div class="message-content">
      <div class="bubble bubble-bot">
        <span class="coach-eyebrow">${coachEyebrowLabel()}</span>
        <div class="bubble-bot-body"></div>
      </div>
    </div>
  `;
  row.querySelector('.bubble-bot-body').innerHTML = renderMarkdown(rawText);
  messagesEl.appendChild(row);
  return row;
}

export function appendErrorBubble() {
  const row = document.createElement('div');
  row.className = 'message message-bot';
  row.innerHTML = `
    <div class="message-content">
      <div class="bubble bubble-bot bubble-error">
        <span class="coach-eyebrow">${coachEyebrowLabel()}</span>
        <div class="bubble-bot-body">
          Something went wrong — please try again.
        </div>
      </div>
    </div>
  `;
  messagesEl.appendChild(row);
  scrollBottom();
}

export function finalizeBubble(bubble, rawText) {
  bubble.classList.remove('streaming');
  const body = bubble.querySelector('.bubble-bot-body');
  if (body) body.innerHTML = renderMarkdown(rawText);
  else bubble.innerHTML = renderMarkdown(rawText);
}

export function appendSourcePills(contentEl, sources) {
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

export function appendFeedbackButtons(contentEl) {
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

function formatInline(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\(([a-zA-Z0-9_\s]+)\)/g, '<span class="source-inline">($1)</span>');
}

export function renderMarkdown(text) {
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

  let nextMoveText = null;
  const contentItems = [];
  items.forEach((item) => {
    if (typeof item === 'string' && /next move:/i.test(item)) {
      nextMoveText = item.replace(/^next move:\s*/i, '').trim();
    } else if (item && item.type === 'p' && /next move:/i.test(item.text)) {
      nextMoveText = item.text.replace(/^next move:\s*/i, '').trim();
    } else {
      contentItems.push(item);
    }
  });

  let hasBullets = false;
  let html = '';
  const wrapped = contentItems.map((item) => {
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

  if (nextMoveText) {
    html += `
      <div class="next-move-block">
        <div class="next-move-block-label">${NEXT_MOVE_ARROW}next move</div>
        <p class="next-move-block-text">${formatInline(nextMoveText)}</p>
      </div>`;
  }

  return html || escapeHtml(text);
}

export function sendMessage(questionOverride, options = {}) {
  const question = (questionOverride ?? questionInput.value).trim();
  if (!question || state.isStreaming || !state.activeConvId) return;

  removeSuggestionChips();

  if (!state.hasStarted) {
    state.hasStarted = true;
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
    setLiveHintsHidden(true);
  }

  streamBotResponse(question, options);
}

export async function streamBotResponse(question, options = {}) {
  const { onComplete = null } = options;
  const targetConvId = state.activeConvId;
  state.isStreaming = true;
  setLoading(true);

  const thinkingEl = appendThinkingIndicator();
  let botBubble = null;
  let fullText = '';
  let pendingSources = [];
  let hadStreamError = false;
  let firstToken = true;

  try {
    const conv = getActiveConv();
    const allMsgs = conv ? conv.messages : [];
    const history = allMsgs.slice(-5, -1).map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        product: conv?.product || 'general',
        history,
        session_id: conv?.sessionId || newSessionId(),
        mode: getChatMode(),
        prospect_name: conv?.name || '',
        prospect_company: conv?.company || '',
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = null;

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
          if (currentEvent === 'error') {
            hadStreamError = true;
            if (!botBubble) thinkingEl.remove();
            appendErrorBubble();
            currentEvent = null;
            continue;
          }

          if (data === '[DONE]') {
            if (botBubble && !hadStreamError) {
              finalizeBubble(botBubble, fullText);
              const contentEl = botBubble.closest('.message-content');
              if (contentEl) {
                appendSourcePills(contentEl, pendingSources);
                appendFeedbackButtons(contentEl);
              }
            }
            if (!hadStreamError) {
              const targetConv = state.conversations.find((c) => c.id === targetConvId);
              if (targetConv) {
                targetConv.messages.push({ role: 'assistant', content: fullText });
                saveConversations();
              }
            }
            if (onComplete && state.activeConvId === targetConvId) onComplete();
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
            const body = botBubble.querySelector('.bubble-bot-body') || botBubble;
            body.textContent = fullText;
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
    state.isStreaming = false;
    setLoading(false);
    questionInput.focus();
  }
}

export function appendProductDivider(productLabel) {
  const div = document.createElement('div');
  div.className = 'product-switch-divider';
  div.setAttribute('aria-label', `Switched to ${productLabel}`);
  div.innerHTML = `<span>Switched to ${productLabel}</span>`;
  messagesEl.appendChild(div);
  scrollBottom();
}
