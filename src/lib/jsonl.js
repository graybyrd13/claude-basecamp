import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

/**
 * Stream a JSONL file line by line, invoking onEntry for each parsed object.
 * Malformed lines are skipped. Returns when the file is fully read.
 */
export async function streamJsonl(filePath, onEntry) {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    onEntry(entry)
  }
}
