const TOKEN_KEY = 'pyr_token';
const COOKIE_NAME = 'token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Sync to cookie so Next.js middleware (server-side) can read it
  document.cookie = `${COOKIE_NAME}=${token}; path=/; SameSite=Strict`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  // Clear cookie
  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
