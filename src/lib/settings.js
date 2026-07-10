/**
 * Single-record settings backed by the settings store.
 * All notification channels are optional; empty string means disabled.
 */
const DEFAULTS = {
  slackWebhook: '',
  discordWebhook: '',
  telegramBotToken: '',
  telegramChatId: '',
  macosNotifications: false,
  notifyOnSuccess: false,
  // Governor: admission control for autonomous runs. 0 means "no cap".
  monthlyBudgetUsd: 0,
  repoBudgetsUsd: {},
  maxConcurrentRuns: 2,
  maxRunsPerDay: 6,
  maxFailStreak: 2,
}

export function getSettings(stores) {
  const record = stores.settings.list()[0]
  return { ...DEFAULTS, ...(record || {}) }
}

// Server-side sanitation for the governor's numbers: the API accepts raw
// JSON, and a bad value here would misbehave every reconcile tick (a
// negative cap compares true forever, escalating each minute). Clamp on
// write so every reader can trust the store.
// Non-numeric input falls back to the default; numeric input clamps to [1, max].
const intClamp = (v, fallback, max) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : fallback
}

const CLAMPS = {
  monthlyBudgetUsd: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0),
  maxConcurrentRuns: (v) => intClamp(v, 2, 20),
  maxRunsPerDay: (v) => intClamp(v, 6, 200),
  maxFailStreak: (v) => intClamp(v, 2, 20),
  repoBudgetsUsd: (v) => {
    const out = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [path, cap] of Object.entries(v)) {
        const n = Number(cap)
        if (Number.isFinite(n) && n > 0) out[path] = n
      }
    }
    return out
  },
}

export function updateSettings(stores, fields) {
  const allowed = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (key in fields) allowed[key] = CLAMPS[key] ? CLAMPS[key](fields[key]) : fields[key]
  }
  const record = stores.settings.list()[0]
  if (record) return { ...DEFAULTS, ...stores.settings.update(record.id, allowed) }
  return { ...DEFAULTS, ...stores.settings.insert(allowed) }
}
