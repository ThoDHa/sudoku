export const STORAGE_SCHEMA_VERSION = 1

export interface VersionedEnvelope<T> {
  schemaVersion: number
  data: T
}

export type MigrationMap<T> = Record<number, (data: T) => T>

export function isVersionedEnvelope(raw: unknown): raw is VersionedEnvelope<unknown> {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    'schemaVersion' in raw &&
    'data' in raw
  )
}

function runMigrations<T>(
  data: T,
  fromVersion: number,
  toVersion: number,
  migrations: MigrationMap<T>,
): T {
  let current = data
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v]
    if (step) {
      current = step(current)
    }
  }
  return current
}

export function migrateVersionedEnvelope<T>(
  raw: unknown,
  migrations: MigrationMap<T>,
  currentVersion: number = STORAGE_SCHEMA_VERSION,
): T | null {
  if (raw === null) return null

  let version: number
  let data: unknown

  if (isVersionedEnvelope(raw)) {
    version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
    data = raw.data
  } else {
    version = 0
    data = raw
  }

  return runMigrations(data as T, version, currentVersion, migrations)
}

export function wrapVersionedEnvelope<T>(
  data: T,
  version: number = STORAGE_SCHEMA_VERSION,
): VersionedEnvelope<T> {
  return { schemaVersion: version, data }
}

export function readRecordVersion(raw: unknown): number {
  // Stryker disable next-line ConditionalExpression: the `typeof raw !== 'object'` operand is redundant. `raw === null` already returns 0 for null, and for any other primitive the subsequent `(raw as ...).schemaVersion` property access auto-boxes (no throw) and yields undefined, which the `: 0` fallback returns. Removing the typeof operand is therefore observationally identical.
  if (typeof raw !== 'object' || raw === null) return 0
  const v = (raw as { schemaVersion?: unknown }).schemaVersion
  return typeof v === 'number' ? v : 0
}

export function migrateVersionedRecord<T>(
  raw: unknown,
  migrations: MigrationMap<T>,
  currentVersion: number = STORAGE_SCHEMA_VERSION,
): T | null {
  if (raw === null || typeof raw !== 'object') return null
  const version = readRecordVersion(raw)
  return runMigrations(raw as T, version, currentVersion, migrations)
}
