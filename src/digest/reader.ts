import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.at === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.at) &&
    Number.isFinite(Date.parse(event.at)) &&
    typeof event.job === 'string' && event.job.trim().length > 0 &&
    (event.status === 'ok' || event.status === 'retry' || event.status === 'fail') &&
    (event.owner === null || typeof event.owner === 'string') &&
    (event.error === undefined || typeof event.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  // The route parameter must name a night, never a path outside runsDir.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = {
    night,
    rows: [],
    counts: { ok: 0, retry: 0, fail: 0 },
    malformedLines: 0,
  };
  const events: RunEvent[] = [];
  for (const line of contents.split(/\r?\n/)) {
    // Empty files and trailing newlines are not malformed events.
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      digest.malformedLines++;
      continue;
    }
    if (!isRunEvent(value)) {
      digest.malformedLines++;
      continue;
    }
    events.push(value);
    digest.counts[value.status]++;
  }

  // Stable sorting preserves file order when two events share an instant.
  events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        lastStatus: event.status,
        lastError: null,
        firstAt: event.at,
        lastAt: event.at,
      };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
  }
  digest.rows = [...jobs.values()].sort((left, right) =>
    left.job < right.job ? -1 : left.job > right.job ? 1 : 0,
  );
  return digest;
};
