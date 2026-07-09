import { spawn } from 'node:child_process'
import { getSettings } from './settings.js'

const FETCH_TIMEOUT_MS = 8000

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

/**
 * Fan a notification out to every configured channel. Fire-and-forget:
 * failures are collected and returned but never thrown, so a dead webhook
 * can't break a run.
 */
export async function sendNotification(stores, { title, body }) {
  const settings = getSettings(stores)
  const text = body ? `${title}\n${body}` : title
  const attempts = []

  if (settings.slackWebhook) {
    attempts.push(
      post(settings.slackWebhook, { text }).then(
        (r) => ({ channel: 'slack', ok: r.ok }),
        (e) => ({ channel: 'slack', ok: false, error: e.message })
      )
    )
  }
  if (settings.discordWebhook) {
    attempts.push(
      post(settings.discordWebhook, { content: text.slice(0, 1900) }).then(
        (r) => ({ channel: 'discord', ok: r.ok }),
        (e) => ({ channel: 'discord', ok: false, error: e.message })
      )
    )
  }
  if (settings.telegramBotToken && settings.telegramChatId) {
    attempts.push(
      post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        chat_id: settings.telegramChatId,
        text: text.slice(0, 4000),
      }).then(
        (r) => ({ channel: 'telegram', ok: r.ok }),
        (e) => ({ channel: 'telegram', ok: false, error: e.message })
      )
    )
  }
  if (settings.macosNotifications && process.platform === 'darwin') {
    attempts.push(
      new Promise((resolve) => {
        const script = `display notification ${JSON.stringify(body || '')} with title ${JSON.stringify(`Basecamp: ${title}`)}`
        const child = spawn('osascript', ['-e', script], { stdio: 'ignore' })
        child.on('exit', (code) => resolve({ channel: 'macos', ok: code === 0 }))
        child.on('error', (e) => resolve({ channel: 'macos', ok: false, error: e.message }))
      })
    )
  }

  return Promise.all(attempts)
}

/** Notify about a finished run, respecting the notify-on-success setting. */
export function notifyRunFinished(stores, run) {
  if (!run) return
  const settings = getSettings(stores)
  if (run.status === 'succeeded' && !settings.notifyOnSuccess) return
  const label = run.routineName ? `Routine "${run.routineName}"` : 'Task'
  const repo = run.projectPath.split('/').filter(Boolean).pop()
  sendNotification(stores, {
    title: run.status === 'succeeded' ? `${label} finished in ${repo}` : `${label} failed in ${repo}`,
    body: (run.resultText || run.error || '').slice(0, 300),
  }).catch(() => {})
}
