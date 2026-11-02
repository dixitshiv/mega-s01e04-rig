export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One job, ordered by event time; equal timestamps follow file order. */
export type DigestRow = {
  job: string;
  /** Owner on the latest event, including an explicit null. */
  owner: string | null;
  /** Total valid events for this job, including retries. */
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  /** Most recent recorded error, retained after a later successful event. */
  lastError: string | null;
  /** Original log strings, retaining their time offsets. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** Sorted by job in ascending code-point order. */
  rows: DigestRow[];
  /** Counts of valid events, rather than final job statuses. */
  counts: Record<DigestStatus, number>;
  malformedLines: number;
};

/** Null means a missing file or invalid night name; empty files return an empty digest. */
export type ReadNightResult = NightDigest | null;

/** Synchronous implementation exported as readNight from ./reader.js. */
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
