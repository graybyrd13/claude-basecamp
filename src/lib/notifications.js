/**
 * The persistent notification inbox: every check transition, run outcome,
 * and manager reply lands here regardless of which tab is open, so coming
 * back to Basecamp after time away always shows what happened. Additive to
 * notify.js's outward channels — this never replaces them.
 */

/** Record one notification. `type` drives the frontend's icon and grouping. */
export function recordNotification(stores, { type, projectPath = null, title, body = null, runId = null, intentId = null }) {
  return stores.notifications.insert({
    type,
    projectPath,
    title,
    body: body || null,
    read: false,
    runId,
    intentId,
  })
}

export function unreadCount(stores) {
  return stores.notifications.list().filter((n) => !n.read).length
}

/** Mark one notification read. Returns null if the id doesn't exist. */
export function markRead(stores, id) {
  return stores.notifications.update(id, { read: true })
}

/** Mark every unread notification read. Returns how many were flipped. */
export function markAllRead(stores) {
  let count = 0
  for (const n of stores.notifications.list()) {
    if (n.read) continue
    stores.notifications.update(n.id, { read: true })
    count++
  }
  return count
}
