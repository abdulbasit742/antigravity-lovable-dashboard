export const AUTH_EXPIRED_EVENT = 'antigravity:auth-expired';

interface AuthResponse {
  authenticated: boolean;
  expiresInSeconds?: number;
  error?: { message?: string };
}

async function parseResponse(response: Response): Promise<AuthResponse> {
  try {
    return await response.json() as AuthResponse;
  } catch {
    return { authenticated: false, error: { message: 'The server returned an invalid response.' } };
  }
}

export async function getOperatorSession(): Promise<boolean> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error('Unable to check the operator session.');
  return (await parseResponse(response)).authenticated === true;
}

export async function loginOperator(password: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await parseResponse(response);
  if (!response.ok || !data.authenticated) {
    throw new Error(data.error?.message || 'Unable to sign in.');
  }
}

export async function logoutOperator(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
}

export function notifyAuthExpired(): void {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
