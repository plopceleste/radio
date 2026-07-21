import { StationsSchema, StatsSchema, type Station, type Stats } from './schemas';

// radio-browser discourages hardcoding individual mirrors (they go offline).
// The documented approach is to discover the current server pool at runtime and
// pick randomly; this hardcoded list is only a fallback if discovery fails.
// https://api.radio-browser.info/  ("How to use / mirrors")
const FALLBACK_SERVERS = [
  'de1.api.radio-browser.info',
  'at1.api.radio-browser.info',
  'nl1.api.radio-browser.info',
];

let serverPromise: Promise<string[]> | null = null;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Resolve the available server list once, then reuse it for the session.
async function getServers(): Promise<string[]> {
  if (!serverPromise) {
    serverPromise = (async () => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('https://all.api.radio-browser.info/json/servers', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(id);
        if (res.ok) {
          const list = await res.json();
          const names = Array.isArray(list)
            ? [...new Set(list.map((s: any) => s?.name).filter(Boolean) as string[])]
            : [];
          if (names.length) return shuffle(names);
        }
      } catch {
        // fall through to the fallback list
      }
      return shuffle(FALLBACK_SERVERS);
    })();
  }
  return serverPromise;
}

// Fetch raw JSON from the first reachable mirror, trying each in turn.
async function fetchDirectory(endpoint: string): Promise<unknown> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const workerUrl = (import.meta as any).env?.VITE_WORKER_PROXY_URL || '';
  let lastError: Error | null = null;

  for (const server of await getServers()) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);

      const targetUrl = `https://${server}/${cleanEndpoint}`;
      const fetchUrl = workerUrl
        ? `${workerUrl}?url=${encodeURIComponent(targetUrl)}`
        : targetUrl;

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(id);

      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err: any) {
      lastError = err?.name === 'AbortError' ? new Error('Request timed out') : err;
    }
  }

  // Every server failed — drop the cached list so the next call re-discovers
  // instead of retrying a stale/dead set for the rest of the session.
  serverPromise = null;
  throw lastError || new Error('Failed to reach any radio-browser API mirror');
}

/** Fetch and validate a list of stations from a search/topclick endpoint. */
export async function fetchStations(endpoint: string): Promise<Station[]> {
  return StationsSchema.parse(await fetchDirectory(endpoint));
}

/** Fetch and validate the directory-wide stats. */
export async function fetchStats(): Promise<Stats> {
  return StatsSchema.parse(await fetchDirectory('json/stats'));
}
