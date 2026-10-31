import { create } from 'zustand';
import { useStore } from './store';
import {
  ACCOUNTS_KEY, GUEST_KEY, LEGACY_CLAIMED_KEY, LEGACY_KEY, SESSION_KEY, SIGNUPS_KEY, dataKey, sessionEmail,
} from './lib/session';

/**
 * Local accounts: a lightweight gate, not authentication. An account is an
 * email + name; each account's planning data lives under its own storage key.
 * Email-list opt-ins are kept locally and, when VITE_SIGNUP_ENDPOINT is set,
 * also POSTed there, so a real list (Mailchimp, Loops, a form backend…) can be
 * plugged in without UI changes. Real auth can later replace `signIn`.
 */

export interface Account {
  email: string;
  name: string;
  marketingOptIn: boolean;
  createdAt: number;
  lastSignIn: number;
}

export interface Signup {
  email: string;
  name?: string;
  source: 'sign-in' | 'waitlist' | 'settings';
  at: number;
  /** Whether a configured endpoint accepted it. */
  delivered?: boolean;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked; the app keeps working in memory */
  }
};

export const listAccounts = (): Account[] => Object.values(read<Record<string, Account>>(ACCOUNTS_KEY, {})).sort((a, b) => b.lastSignIn - a.lastSignIn);
export const listSignups = (): Signup[] => read<Signup[]>(SIGNUPS_KEY, []);

interface AccountState {
  account: Account | null;
}

export const useAccount = create<AccountState>()(() => {
  const email = sessionEmail();
  const account = email ? read<Record<string, Account>>(ACCOUNTS_KEY, {})[email] ?? null : null;
  return { account };
});

/** Point the planning store at a storage key, loading what is there or starting fresh. */
async function switchData(key: string) {
  useStore.persist.setOptions({ name: key });
  let has = false;
  try {
    has = localStorage.getItem(key) != null;
  } catch {
    /* ignore */
  }
  if (has) await useStore.persist.rehydrate();
  else useStore.getState().factoryReset();
}

export async function recordSignup(email: string, name: string | undefined, source: Signup['source']) {
  const list = listSignups().filter((s) => s.email.toLowerCase() !== email.toLowerCase());
  const entry: Signup = { email, name, source, at: Date.now() };
  const endpoint = import.meta.env.VITE_SIGNUP_ENDPOINT as string | undefined;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      entry.delivered = res.ok;
    } catch {
      entry.delivered = false;
    }
  }
  write(SIGNUPS_KEY, [...list, entry]);
  return entry;
}

export function removeSignup(email: string) {
  write(SIGNUPS_KEY, listSignups().filter((s) => s.email.toLowerCase() !== email.toLowerCase()));
}

export async function signIn(input: { email: string; name: string; marketingOptIn: boolean }): Promise<{ broughtOver: boolean }> {
  const email = input.email.trim().toLowerCase();
  const accounts = read<Record<string, Account>>(ACCOUNTS_KEY, {});
  const prev = accounts[email];
  const account: Account = {
    email,
    name: input.name.trim() || prev?.name || email.split('@')[0],
    marketingOptIn: input.marketingOptIn,
    createdAt: prev?.createdAt ?? Date.now(),
    lastSignIn: Date.now(),
  };
  write(ACCOUNTS_KEY, { ...accounts, [email]: account });
  if (input.marketingOptIn) await recordSignup(email, account.name, 'sign-in');

  // The first account on this device inherits any data created before accounts existed.
  let broughtOver = false;
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !localStorage.getItem(LEGACY_CLAIMED_KEY) && !localStorage.getItem(dataKey(email))) {
      localStorage.setItem(dataKey(email), legacy);
      localStorage.setItem(LEGACY_CLAIMED_KEY, email);
      broughtOver = true;
    }
    localStorage.setItem(SESSION_KEY, email);
  } catch {
    /* ignore */
  }
  await switchData(dataKey(email));
  useAccount.setState({ account });
  return { broughtOver };
}

export async function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  useAccount.setState({ account: null });
  await switchData(GUEST_KEY);
}

export function updateAccount(patch: Partial<Pick<Account, 'name' | 'marketingOptIn'>>) {
  const current = useAccount.getState().account;
  if (!current) return;
  const next = { ...current, ...patch };
  const accounts = read<Record<string, Account>>(ACCOUNTS_KEY, {});
  write(ACCOUNTS_KEY, { ...accounts, [next.email]: next });
  useAccount.setState({ account: next });
  if (patch.marketingOptIn === true) void recordSignup(next.email, next.name, 'settings');
  if (patch.marketingOptIn === false) removeSignup(next.email);
}

export function signupsCsv(): string {
  const rows = listSignups().map((s) => [s.email, s.name ?? '', s.source, new Date(s.at).toISOString(), s.delivered == null ? '' : String(s.delivered)]);
  return [['email', 'name', 'source', 'signed_up_at', 'delivered'], ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}
