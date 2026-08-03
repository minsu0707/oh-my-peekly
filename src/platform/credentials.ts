// keytar is CommonJS and doesn't statically declare named exports that
// Node's ESM/CJS interop can pick up reliably (only its default export
// reliably exposes all of getPassword/setPassword/deletePassword at
// runtime) — see the runtime verification note below. Import the default
// and call methods off it rather than `import * as keytar`.
import keytar from "keytar";

/**
 * Single keytar "service" name under which all Peekly-cached credentials are
 * stored, regardless of which external site's login the credentials belong
 * to. The distinguishing key per site is the keytar "account" name — see
 * `normalizeAccount` below.
 */
const KEYTAR_SERVICE = "peekly";

export interface StoredCredentials {
  loginId: string;
  password: string;
}

/**
 * Normalizes a service URL into a stable keytar account key so re-running
 * against the same site with a different path/query/hash (e.g.
 * `https://app.example.com/login` vs `https://app.example.com/dashboard?x=1`)
 * still hits the same cached credentials. Falls back to the raw, trimmed
 * input when the value isn't a parseable absolute URL (e.g. a bare hostname),
 * so callers aren't forced to pass a fully qualified URL.
 */
function normalizeAccount(serviceUrl: string): string {
  const trimmed = serviceUrl.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return trimmed;
    }
  }
}

/**
 * Saves a login ID/password pair for a service URL to the OS credential
 * store (Keychain on macOS, Credential Manager on Windows, via keytar).
 * Both values are stored together as a single JSON secret because keytar
 * only associates one opaque secret string per (service, account) pair.
 *
 * Never logs `loginId`/`password` — callers must not either (CONVENTIONS.md
 * section 5).
 */
export async function saveCredentials(
  serviceUrl: string,
  loginId: string,
  password: string
): Promise<void> {
  const account = normalizeAccount(serviceUrl);
  const secret: StoredCredentials = { loginId, password };
  await keytar.setPassword(KEYTAR_SERVICE, account, JSON.stringify(secret));
}

/**
 * Looks up cached credentials for a service URL. Returns `undefined` when
 * nothing is cached (never throws for a plain "not found" case) or when the
 * stored secret is unreadable/corrupt.
 */
export async function getCredentials(serviceUrl: string): Promise<StoredCredentials | undefined> {
  const account = normalizeAccount(serviceUrl);
  const raw = await keytar.getPassword(KEYTAR_SERVICE, account);
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (typeof parsed.loginId === "string" && typeof parsed.password === "string") {
      return { loginId: parsed.loginId, password: parsed.password };
    }
    return undefined;
  } catch {
    // Corrupt/unexpected secret format — treat as "nothing usable cached"
    // rather than surfacing the raw stored value in an error.
    return undefined;
  }
}

/**
 * Deletes cached credentials for a service URL, if any. Returns whether a
 * matching entry actually existed and was removed.
 */
export async function deleteCredentials(serviceUrl: string): Promise<boolean> {
  const account = normalizeAccount(serviceUrl);
  return keytar.deletePassword(KEYTAR_SERVICE, account);
}
