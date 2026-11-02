import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const temporaryDirectories: string[] = [];
const night = '2026-10-28';

function temporaryNight(lines: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  temporaryDirectories.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('aggregates the supplied fixture without losing retries, errors, null owners or offsets', () => {
    const digest = readNight('runs', night);
    expect(digest).not.toBeNull();
    expect(digest?.malformedLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0,
      lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held', lastStatus: 'ok' });
    expect(digest?.rows[3]).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('uses chronological instants across offsets and retains the latest recorded error after recovery', () => {
    const dir = temporaryNight([
      JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'job', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T02:15:00+02:00', job: 'job', status: 'retry', owner: 'second', error: 'latest error' }),
      JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'job', status: 'fail', owner: 'first', error: 'old error' }),
    ]);
    expect(readNight(dir, night)).toEqual({
      night, malformedLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T02:00:00+01:00',
      }],
    });
  });

  it('uses file order for equal instants', () => {
    const dir = temporaryNight([
      JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'job', status: 'retry', owner: 'first', error: 'retry error' }),
      JSON.stringify({ at: '2026-10-28T00:00:00Z', job: 'job', status: 'fail', owner: 'last', error: 'failure' }),
    ]);
    expect(readNight(dir, night)?.rows[0]).toMatchObject({
      owner: 'last', lastStatus: 'fail', lastError: 'failure',
      firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T00:00:00Z',
    });
  });

  it('counts invalid JSON and invalid event shapes while retaining valid lines', () => {
    const valid = { at: '2026-10-28T01:00:00+01:00', job: 'job', status: 'ok', owner: null };
    const invalid = [
      null, [], 42, {},
      { ...valid, at: 'yesterday' },
      { ...valid, at: '2026-10-28T01:00:00' },
      { ...valid, job: '' },
      { ...valid, job: 42 },
      { ...valid, status: 'unknown' },
      { ...valid, owner: undefined },
      { ...valid, owner: 42 },
      { ...valid, error: null },
    ];
    const dir = temporaryNight(['{broken', ...invalid.map((event) => JSON.stringify(event)), JSON.stringify(valid), '', '  ']);
    const digest = readNight(dir, night);
    expect(digest?.malformedLines).toBe(invalid.length + 1);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].owner).toBeNull();
  });

  it('distinguishes a missing file from an empty night', () => {
    const dir = temporaryNight();
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(dir, night)).toEqual({ night, rows: [], counts: { ok: 0, retry: 0, fail: 0 }, malformedLines: 0 });
  });

  it('rejects path traversal and invalid night names', () => {
    const dir = temporaryNight();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
    expect(readNight(dir, '2026-10-28.jsonl')).toBeNull();
  });
});
