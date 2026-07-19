/** Shared mutable app state */

export const LEGACY_ASSISTANT_ID = '__assistant__';
export const STORAGE_KEY = 'repready_conversations';

export const INPUT_PLACEHOLDER_LIVE = "What's happening on the call right now?";
export const INPUT_PLACEHOLDER_PREP = 'Ask about this prospect, objections, or what to expect…';
export const INPUT_PLACEHOLDER_IDLE = 'Select or create a chat first';

export const PRODUCTS = [
  { id: 'general',      label: 'All products',  desc: 'Cross-product comparisons',             dot: '#8b8fa8' },
  { id: 'repready_pro', label: 'RepReady Pro',   desc: 'AI knowledge assistant · battle cards', dot: '#0F6E56' },
  { id: 'coachai',      label: 'CoachAI',        desc: 'Real-time call coaching',               dot: '#22c55e' },
  { id: 'salestrain',   label: 'SalesTrain',     desc: 'AI sales training & simulation',        dot: '#f59e0b' },
  { id: 'signalhq',     label: 'SignalHQ',       desc: 'Prospect intelligence & signals',       dot: '#D85A30' },
  { id: 'dealdesk',     label: 'DealDesk',       desc: 'CPQ & proposal automation',             dot: '#3d5a80' },
];

export const KB_PROSPECTS = ['alex rivera', 'marcus johnson', 'priya patel'];

export const state = {
  conversations: [],
  activeConvId: null,
  editingConvId: null,
  isStreaming: false,
  hasStarted: false,
  openDropdownEl: null,
};
