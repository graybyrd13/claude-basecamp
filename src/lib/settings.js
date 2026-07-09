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
}

export function getSettings(stores) {
  const record = stores.settings.list()[0]
  return { ...DEFAULTS, ...(record || {}) }
}

export function updateSettings(stores, fields) {
  const allowed = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (key in fields) allowed[key] = fields[key]
  }
  const record = stores.settings.list()[0]
  if (record) return { ...DEFAULTS, ...stores.settings.update(record.id, allowed) }
  return { ...DEFAULTS, ...stores.settings.insert(allowed) }
}
