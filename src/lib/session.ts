/**
 * Storage keys for local accounts. Kept free of store imports so the store can
 * pick its persistence key at creation time.
 *
 *   the-quad:session          email of the signed-in account
 *   the-quad:accounts         { [email]: Account }
 *   the-quad:signups          email-list opt-ins collected on this device
 *   the-quad:user:<email>     that account's planning data (zustand persist)
 *   the-quad                  pre-account data, moved into the first account
 */

export const SESSION_KEY = 'the-quad:session';
export const ACCOUNTS_KEY = 'the-quad:accounts';
export const SIGNUPS_KEY = 'the-quad:signups';
export const LEGACY_KEY = 'the-quad';
export const LEGACY_CLAIMED_KEY = 'the-quad:legacy-claimed';
export const GUEST_KEY = 'the-quad:guest';

export const dataKey = (email: string) => `the-quad:user:${email.trim().toLowerCase()}`;

export function sessionEmail(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Persistence key for the current session (guest when signed out). */
export function currentDataKey(): string {
  const email = sessionEmail();
  return email ? dataKey(email) : GUEST_KEY;
}
