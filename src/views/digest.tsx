import type { NightDigest } from '../digest/types.js';

function missing(value: string | null) {
  return value === null ? '—' : value;
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const warning = row.retries >= 3 || row.lastStatus === 'fail';
              return (
                <tr class={warning ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{missing(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}{warning ? ' · warning' : ''}</td>
                  <td>{missing(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="mute">malformed lines: {digest.malformedLines}</p>
    </>
  );
}
