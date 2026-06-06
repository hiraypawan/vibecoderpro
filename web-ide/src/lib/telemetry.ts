const WORKER_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://vibe-api-gateway.workers.dev';

interface TelemetryPayload {
  redirect: string;
}

let cachedDestination: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

export async function fetchTelemetryDestination(): Promise<string | null> {
  const now = Date.now();
  if (cachedDestination && now - cacheTimestamp < CACHE_TTL) {
    return cachedDestination;
  }
  try {
    const res = await fetch(`${WORKER_BASE_URL}/v1/telemetry`);
    if (!res.ok) return null;
    const data: TelemetryPayload = await res.json();
    if (data.redirect) {
      cachedDestination = data.redirect;
      cacheTimestamp = now;
      return data.redirect;
    }
  } catch {
    // telemetry failure is non-critical
  }
  return null;
}

export async function fireEngagementLoop(
  primaryAction: () => void | Promise<void>
): Promise<void> {
  const destination = await fetchTelemetryDestination();

  await primaryAction();

  if (destination) {
    const opened = window.open(destination, '_blank', 'noopener,noreferrer');
    if (opened) {
      opened.blur();
    }
    window.focus();
  }
}
