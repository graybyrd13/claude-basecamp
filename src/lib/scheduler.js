import { launchRun } from './runner.js'
import { admitRun, monthKey } from './governor.js'
import { lastPathSegment } from './paths.js'

const TICK_MS = 30 * 1000

/**
 * Compute the next run time (ms epoch) for a routine schedule, strictly after `from`.
 * Schedule shapes:
 *   { type: 'interval', minutes: 90 }
 *   { type: 'daily',  time: '09:00' }
 *   { type: 'weekly', day: 1, time: '09:00' }   // 0 = Sunday
 */
export function nextRunTime(schedule, from = Date.now()) {
  if (!schedule || !schedule.type) return null
  if (schedule.type === 'interval') {
    const minutes = Number(schedule.minutes)
    if (!minutes || minutes < 1) return null
    return from + minutes * 60 * 1000
  }
  const [hours, mins] = String(schedule.time || '09:00')
    .split(':')
    .map(Number)
  if (Number.isNaN(hours) || Number.isNaN(mins)) return null

  const next = new Date(from)
  next.setHours(hours, mins, 0, 0)
  if (schedule.type === 'daily') {
    if (next.getTime() <= from) next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  if (schedule.type === 'weekly') {
    const targetDay = Number(schedule.day) % 7
    while (next.getDay() !== targetDay || next.getTime() <= from) {
      next.setDate(next.getDate() + 1)
      next.setHours(hours, mins, 0, 0)
    }
    return next.getTime()
  }
  return null
}

export function describeSchedule(schedule) {
  if (!schedule) return '—'
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (schedule.type === 'interval') return `every ${schedule.minutes} min`
  if (schedule.type === 'daily') return `daily at ${schedule.time}`
  if (schedule.type === 'weekly') return `${DAYS[schedule.day % 7]}s at ${schedule.time}`
  return '—'
}

/** Fire any routines that are due. Exported for tests; called by startScheduler. */
export function fireDueRoutines(stores, now = Date.now(), launch = launchRun) {
  const fired = []
  for (const routine of stores.routines.list()) {
    if (!routine.enabled || !routine.nextRun || routine.nextRun > now) continue

    // The governor gates scheduled spend too: over budget, a routine skips
    // its window (still rescheduled) and says so once per month.
    const verdict = admitRun(stores, { projectPath: routine.projectPath }, now)
    if (!verdict.ok) {
      const month = monthKey(now)
      if (routine.budgetEscalatedMonth !== month) {
        stores.updates.insert({
          kind: 'decision-needed',
          routineId: routine.id,
          projectPath: routine.projectPath,
          title: `Budget paused: routine “${routine.name}” in ${lastPathSegment(routine.projectPath)}`,
          body: `${verdict.reason}. Raise the cap in Settings or wait for the month to roll over.`,
        })
      }
      stores.routines.update(routine.id, {
        nextRun: nextRunTime(routine.schedule, now),
        budgetEscalatedMonth: month,
      })
      continue
    }

    stores.routines.update(routine.id, {
      nextRun: nextRunTime(routine.schedule, now),
      lastRun: now,
    })
    try {
      const run = launch(stores, {
        projectPath: routine.projectPath,
        prompt: routine.prompt,
        permissionMode: routine.permissionMode,
        model: routine.model,
        effort: routine.effort,
        routineId: routine.id,
        routineName: routine.name,
      })
      fired.push(run)
    } catch (err) {
      stores.updates.insert({
        kind: 'run-failed',
        title: `Routine “${routine.name}” could not start`,
        body: err.message,
      })
    }
  }
  return fired
}

export function startScheduler(stores) {
  const timer = setInterval(() => fireDueRoutines(stores), TICK_MS)
  timer.unref()
  return timer
}
