function escapeHTML(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatRoleplayText(text) {
  let html = escapeHTML(text);
  
  // Convert *actions* or *actions (unclosed) into action-text tags
  // Matches text inside asterisks e.g. *walks in*
  html = html.replace(/\*([^*]+)\*/g, '<span class="action-text">*$1*</span>');
  
  // Replace newlines with <br>
  return html.replace(/\n/g, "<br>");
}

const BOT_ACCENTS = ['cyan', 'magenta', 'purple', 'amber', 'emerald'];

// Stable hash based on botId — color never changes when roster order changes
function hashBotId(botId) {
  const str = String(botId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getBotAccent(botId) {
  if (botId == null) return 'purple';
  return BOT_ACCENTS[hashBotId(botId) % BOT_ACCENTS.length];
}

export function getBotAvatarUrl(charId, activeRoomBots) {
  const bot = activeRoomBots.find(b => b.id === charId);
  return bot ? bot.avatar : null;
}
