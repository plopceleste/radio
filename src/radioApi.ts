const RADIO_SERVERS = [
  'de1.api.radio-browser.info',
  'at1.api.radio-browser.info',
  'nl1.api.radio-browser.info'
];

export async function fetchRadioDirectory(endpoint: string): Promise<any> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  let lastError: Error | null = null;
  const workerUrl = (import.meta as any).env?.VITE_WORKER_PROXY_URL || '';

  for (const server of RADIO_SERVERS) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);

      const targetUrl = `https://${server}/${cleanEndpoint}`;
      const fetchUrl = workerUrl
        ? `${workerUrl}?url=${encodeURIComponent(targetUrl)}`
        : targetUrl;

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(id);

      if (response.ok) {
        return await response.json();
      } else {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = new Error('Request timed out');
      } else {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Failed to reach any radio-browser API mirror');
}
