import { describe, it, expect, vi } from 'vitest'
import {
  STORAGE_SCHEMA_VERSION,
  migrateVersionedEnvelope,
  migrateVersionedRecord,
  wrapVersionedEnvelope,
  isVersionedEnvelope,
  readRecordVersion,
  type MigrationMap,
} from './storageMigration'

describe('storageMigration', () => {
  describe('STORAGE_SCHEMA_VERSION', () => {
    it('is 1 for the initial schema', () => {
      expect(STORAGE_SCHEMA_VERSION).toBe(1)
    })
  })

  describe('migrateVersionedEnvelope - legacy v0 data', () => {
    it('treats un-enveloped data as version 0 and runs migrations up to current', () => {
      interface Shape {
        greeting?: string
        salutation?: string
      }
      const migrations: MigrationMap<Shape> = {
        0: (d) => ({ salutation: d.greeting ?? 'hi' }),
      }
      const legacy = { greeting: 'hello' }

      const result = migrateVersionedEnvelope<Shape>(legacy, migrations, 1)

      expect(result).toEqual({ salutation: 'hello' })
    })

    it('returns null for null input', () => {
      expect(migrateVersionedEnvelope(null, {}, 1)).toBeNull()
    })
  })

  describe('migrateVersionedEnvelope - current version', () => {
    it('skips migrations when the envelope is already at the current version', () => {
      const spy = vi.fn()
      const migrations = { 0: spy, 1: spy }
      const enveloped = wrapVersionedEnvelope({ kept: true }, 1)

      const result = migrateVersionedEnvelope<{ kept: boolean }>(enveloped, migrations, 1)

      expect(result).toEqual({ kept: true })
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('migrateVersionedEnvelope - older version', () => {
    it('runs sequential migrations from the stored version up to the current version', () => {
      interface Shape {
        v: number
      }
      const calls: number[] = []
      const migrations: MigrationMap<Shape> = {
        0: (d) => {
          calls.push(0)
          return { v: 1 }
        },
        1: (d) => {
          calls.push(1)
          return { v: 2 }
        },
        2: (d) => {
          calls.push(2)
          return { v: 3 }
        },
      }
      const envelopedAt1 = { schemaVersion: 1, data: { v: 0 } }

      const result = migrateVersionedEnvelope<Shape>(envelopedAt1, migrations, 3)

      expect(result).toEqual({ v: 3 })
      expect(calls).toEqual([1, 2])
    })

    it('treats a non-numeric schemaVersion as version 0', () => {
      const migrations: MigrationMap<{ v: number }> = {
        0: () => ({ v: 99 }),
      }
      const malformed = { schemaVersion: 'oops', data: { v: 0 } }

      const result = migrateVersionedEnvelope<{ v: number }>(malformed, migrations, 1)

      expect(result).toEqual({ v: 99 })
    })
  })

  describe('wrapVersionedEnvelope', () => {
    it('stamps the current schema version onto the envelope on save', () => {
      const wrapped = wrapVersionedEnvelope({ a: 1 })

      expect(wrapped.schemaVersion).toBe(STORAGE_SCHEMA_VERSION)
      expect(wrapped.data).toEqual({ a: 1 })
    })

    it('accepts an explicit version override', () => {
      const wrapped = wrapVersionedEnvelope({ a: 1 }, 2)

      expect(wrapped.schemaVersion).toBe(2)
    })
  })

  describe('isVersionedEnvelope', () => {
    it('recognizes a {schemaVersion, data} object', () => {
      expect(isVersionedEnvelope({ schemaVersion: 1, data: [] })).toBe(true)
    })

    it('rejects null, arrays, and objects missing either key', () => {
      expect(isVersionedEnvelope(null)).toBe(false)
      expect(isVersionedEnvelope([])).toBe(false)
      expect(isVersionedEnvelope({ schemaVersion: 1 })).toBe(false)
      expect(isVersionedEnvelope({ data: 1 })).toBe(false)
    })
  })

  describe('migrateVersionedRecord', () => {
    it('reads the version from the schemaVersion field and migrates a legacy record forward', () => {
      interface Shape {
        schemaVersion?: number
        name: string
      }
      const migrations: MigrationMap<Shape> = {
        0: (d) => ({ ...d, name: d.name.toUpperCase() }),
      }
      const legacy = { name: 'old' }

      const result = migrateVersionedRecord<Shape>(legacy, migrations, 1)

      expect(result).toEqual({ name: 'OLD' })
    })

    it('skips migration when the record schemaVersion is already current', () => {
      const spy = vi.fn()
      const migrations = { 0: spy, 1: spy }
      const record = { schemaVersion: 1, name: 'x' }

      const result = migrateVersionedRecord<{ schemaVersion?: number; name: string }>(
        record,
        migrations,
        1,
      )

      expect(result).toEqual(record)
      expect(spy).not.toHaveBeenCalled()
    })

    it('returns null for non-object input', () => {
      expect(migrateVersionedRecord(null, {}, 1)).toBeNull()
      expect(migrateVersionedRecord('string', {}, 1)).toBeNull()
      expect(migrateVersionedRecord(42, {}, 1)).toBeNull()
    })
  })

  describe('readRecordVersion', () => {
    it('returns the schemaVersion when present and numeric', () => {
      expect(readRecordVersion({ schemaVersion: 3 })).toBe(3)
    })

    it('returns 0 when schemaVersion is missing', () => {
      expect(readRecordVersion({ name: 'x' })).toBe(0)
    })

    it('returns 0 when schemaVersion is non-numeric', () => {
      expect(readRecordVersion({ schemaVersion: 'bad' })).toBe(0)
    })

    it('returns 0 for non-objects', () => {
      expect(readRecordVersion(null)).toBe(0)
      expect(readRecordVersion('string')).toBe(0)
    })
  })
})
