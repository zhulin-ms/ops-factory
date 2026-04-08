import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const LOG_ROOT = process.env.GOOSE_PATH_ROOT || process.cwd()
const LOG_DIR = join(LOG_ROOT, 'logs', 'mcp')
export const LOG_FILE_PATH = join(LOG_DIR, 'control_center.log')

mkdirSync(LOG_DIR, { recursive: true })

function sanitizeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (value === undefined) return undefined

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

export function log(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'control_center',
    event,
  }

  for (const [key, value] of Object.entries(details)) {
    const sanitized = sanitizeValue(value)
    if (sanitized !== undefined) payload[key] = sanitized
  }

  const line = JSON.stringify(payload)
  console.error(line)
  appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8')
}

export function logInfo(event, details) {
  log('INFO', event, details)
}

export function logError(event, details) {
  log('ERROR', event, details)
}
