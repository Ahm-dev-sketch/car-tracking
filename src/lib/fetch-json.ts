// Bound both the request and response-body read, including a stalled connection.
export async function fetchJson<T>(url: string, init: Omit<RequestInit, 'signal'> = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error?.message || `Request failed (${response.status}). Please try again.`);
        }
        if (body === null) throw new Error('The server returned an invalid response. Please refresh to check the latest status.');
        return body as T;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('The server is taking too long to respond. Refresh to check the latest status before trying again.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
