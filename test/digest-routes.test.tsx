import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

describe('digest routes', () => {
  let runsDir: string;

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(
      join(runsDir, '2026-10-30.jsonl'),
      [
        JSON.stringify({ at: '2026-10-30T08:00:00-07:00', job: 'zeta', status: 'retry', owner: 'Zed' }),
        JSON.stringify({ at: '2026-10-30T08:01:00-07:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-30T08:02:00-07:00', job: 'zeta', status: 'retry', owner: 'Zed' }),
        JSON.stringify({ at: '2026-10-30T08:03:00-07:00', job: 'zeta', status: 'retry', owner: 'Zed' }),
        JSON.stringify({ at: '2026-10-30T08:04:00-07:00', job: 'zeta', status: 'retry', owner: 'Zed' }),
        JSON.stringify({ at: '2026-10-30T08:05:00-07:00', job: 'broken', status: 'fail', owner: 'Bea', error: 'exit 1' }),
        '{not json',
      ].join('\n'),
    );
    writeFileSync(join(runsDir, '2026-10-31.jsonl'), '');
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({ ...config, runsDir });
  }

  it('renders a night and returns the shared digest in JSON', async () => {
    const htmlResponse = await app().request('/digest/2026-10-30');
    const html = await htmlResponse.text();
    const jsonResponse = await app().request('/api/digest/2026-10-30');
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toMatchObject({
      night: '2026-10-30',
      counts: { ok: 1, retry: 4, fail: 1 },
      malformedLines: 1,
      rows: [
        { job: 'alpha', owner: null },
        { job: 'broken', lastStatus: 'fail', lastError: 'exit 1' },
        { job: 'zeta', retries: 4 },
      ],
    });

    const alpha = html.indexOf('<td>alpha</td>');
    const broken = html.indexOf('<td>broken</td>');
    const zeta = html.indexOf('<td>zeta</td>');
    expect(alpha).toBeGreaterThan(-1);
    expect(alpha).toBeLessThan(broken);
    expect(broken).toBeLessThan(zeta);
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('retry · warning');
    expect(html).toContain('fail · warning');

    const pageJobs = ['alpha', 'broken', 'zeta'].map((job) => html.indexOf(`<td>${job}</td>`));
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'broken', 'zeta']);
    expect(pageJobs).toEqual([...pageJobs].sort((left, right) => left - right));
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const html = await app().request('/digest/2026-11-01');
    const json = await app().request('/api/digest/2026-11-01');

    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('renders an empty night and returns empty rows in JSON', async () => {
    const html = await app().request('/digest/2026-10-31');
    const body = await html.text();
    const json = await app().request('/api/digest/2026-10-31');

    expect(html.status).toBe(200);
    expect(body).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({
      night: '2026-10-31',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      malformedLines: 0,
    });
  });

  it('links board nights and shows their event counts', async () => {
    const response = await app().request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-31">2026-10-31</a> — ok 0 · retry 0 · fail 0');
    expect(html).toContain('<a href="/digest/2026-10-30">2026-10-30</a> — ok 1 · retry 4 · fail 1');
  });
});
