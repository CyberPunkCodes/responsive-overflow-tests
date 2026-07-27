import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { authStoragePath, resolveBaseURL } from "./config.js";
import type { ResponsiveConfig } from "./types.js";

const DEFAULT_USERNAME_SELECTOR =
  'input[type="email"], input[name="email"], input[name="username"], input[id="email"], input[id="username"]';
const DEFAULT_PASSWORD_SELECTOR = 'input[type="password"]';
const DEFAULT_SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';

/** A lock older than this is assumed to be from a crashed run and is stolen. */
const STALE_LOCK_MS = 120_000;
const LOCK_POLL_MS = 250;
const LOCK_WAIT_TIMEOUT_MS = 90_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Playwright runs tests in parallel worker *processes*, so without this every
 * worker would find no session file and log in at the same moment. Beyond being
 * wasteful, many frameworks throttle repeated logins (Laravel does by default),
 * which can lock the test account mid-run. One worker takes the lock and logs
 * in; the rest wait for the session to appear.
 */
function acquireLock(lockPath: string): boolean {
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
        rmSync(lockPath, { force: true });
        writeFileSync(lockPath, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {
      // Lost the race to steal it — fall through and wait like everyone else.
    }
    return false;
  }
}

async function waitForSession(storagePath: string, lockPath: string): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (existsSync(storagePath)) return;
    // Holder died without producing a session — let this worker try instead.
    if (!existsSync(lockPath)) return;
    await sleep(LOCK_POLL_MS);
  }

  throw new Error(
    "responsive-overflow-tests: timed out waiting for another worker to finish logging in. " +
      `Delete ${dirname(storagePath)} and re-run; if it persists, check that auth.login succeeds.`
  );
}

/**
 * Logs in once and caches the session to disk so the authenticated checks can
 * reuse it.
 *
 * Deliberately not a Playwright `globalSetup`: that needs a resolvable file
 * path into this package, which forces `import.meta.url`, and that is a hard
 * syntax error once Playwright transpiles this module to CommonJS for a
 * consumer whose project isn't ESM. Doing it in-process keeps the package
 * loadable under both module systems and scaffolds no extra files.
 *
 * Idempotent: if the session file already exists it is reused. Delete
 * `.playwright/auth/` to force a fresh login.
 */
export async function ensureAuthSession(
  browser: Browser,
  config: ResponsiveConfig
): Promise<void> {
  const login = config.auth?.login;

  // Nothing to do for storageState / basic-auth / header strategies.
  if (!login) return;

  const storagePath = resolve(process.cwd(), authStoragePath(config));
  if (existsSync(storagePath)) return;

  if (!login.username || !login.password) {
    throw new Error(
      "responsive-overflow-tests: auth.login is configured but username/password are empty. " +
        "They are normally read from environment variables — check those are set in this shell."
    );
  }

  mkdirSync(dirname(storagePath), { recursive: true });

  const lockPath = `${storagePath}.lock`;
  if (!acquireLock(lockPath)) {
    await waitForSession(storagePath, lockPath);
    if (existsSync(storagePath)) return;
    if (!acquireLock(lockPath)) return;
  }

  const baseURL = resolveBaseURL(config);
  const context = await browser.newContext(baseURL ? { baseURL } : {});
  const page = await context.newPage();

  try {
    await page.goto(login.url, { waitUntil: "load" });
    await page.fill(login.usernameSelector ?? DEFAULT_USERNAME_SELECTOR, login.username);
    await page.fill(login.passwordSelector ?? DEFAULT_PASSWORD_SELECTOR, login.password);
    await Promise.all([
      page.waitForLoadState("load"),
      page.click(login.submitSelector ?? DEFAULT_SUBMIT_SELECTOR),
    ]);

    if (login.successUrl) {
      await page.waitForURL(`**${login.successUrl}**`, { timeout: 15_000 });
    }

    // Write via a temp file and rename so a worker polling for the session
    // never reads a half-written one — rename is atomic on the same volume.
    const state = await context.storageState();
    const tempPath = `${storagePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state));
    renameSync(tempPath, storagePath);
  } catch (error) {
    throw new Error(
      `responsive-overflow-tests: login failed at ${login.url}. ` +
        "Check auth.login selectors and credentials — see ADVANCED.md#authentication.\n" +
        `Underlying error: ${(error as Error).message}`
    );
  } finally {
    rmSync(lockPath, { force: true });
    await context.close();
  }
}

/**
 * Builds a page carrying the authenticated session, for use inside a test.
 *
 * The authenticated checks create their own context rather than relying on
 * `test.use({ storageState })`: Playwright resolves `use` options before any
 * `beforeAll` hook runs, so a session file produced in a hook would arrive too
 * late and every authenticated test would fail with ENOENT. Creating the
 * context here means the login happens first, by construction.
 *
 * The caller owns the returned page's context and should close it.
 */
export async function createAuthedPage(
  browser: Browser,
  config: ResponsiveConfig
): Promise<Page> {
  await ensureAuthSession(browser, config);

  const storagePath = resolve(process.cwd(), authStoragePath(config));
  const baseURL = resolveBaseURL(config);
  const options: BrowserContextOptions = baseURL ? { baseURL } : {};

  // Only load a session when one actually exists — the basic-auth and header
  // strategies authenticate without ever producing a storage-state file.
  if (existsSync(storagePath)) options.storageState = storagePath;
  if (config.auth?.httpCredentials) options.httpCredentials = config.auth.httpCredentials;
  if (config.auth?.headers) options.extraHTTPHeaders = config.auth.headers;

  const context = await browser.newContext(options);
  return context.newPage();
}
