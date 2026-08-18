import { doc, getDoc } from 'firebase/firestore';
import { firestore, watchAuth } from './firebase';

/**
 * Where the API lives, decided at run time rather than at build time.
 *
 * `AF_CONVERT_API` is compiled into the bundle, which is correct for a fixed
 * host and useless for one that moves: a tunnel gets a new hostname every time
 * it restarts, and changing the compiled value means a fresh Vercel build and a
 * window where the deployed site is broken. Reading it from Firestore instead
 * makes a moved API a document write — visible on the next page load, with no
 * rebuild and no deploy.
 *
 * `config/runtime` is world-readable and client-unwritable by `firestore.rules`,
 * which is exactly the shape this wants: any visitor may learn the address, and
 * only something holding a service account may change it. The address is not a
 * secret — every route behind it verifies a Firebase ID token.
 *
 * The build-time value stays as the fallback, so a machine with no Firestore
 * reach still works against whatever it was built with.
 */

declare const __AF_CONVERT_API__: string;

const buildTime = (__AF_CONVERT_API__ ?? '').replace(/\/+$/, '');

let fromFirestore: string | null = null;

/**
 * The base every API client should use, read at call time.
 *
 * Deliberately a function rather than a constant: a client constructed before
 * the document arrives would otherwise hold the build-time value for the life
 * of the page, which on a deployed site is the one that no longer works.
 */
export const convertApiBase = (): string => fromFirestore ?? buildTime;

/** True once a value has come back — for telling "not configured" apart from
 *  "not looked yet", which read identically as an empty string. */
export const runtimeConfigLoaded = (): boolean => fromFirestore !== null;

/**
 * Fetches the document, once, without blocking anything.
 *
 * Failure is not an error worth surfacing: the fallback is the value the bundle
 * was built with, and a converter that cannot be reached already says so on the
 * page that needs it. Racing a timeout so a slow or blocked Firestore cannot
 * leave a caller waiting on a read it does not have to have.
 */
export async function loadRuntimeConfig(timeoutMs = 4000): Promise<string> {
  try {
    const snapshot = await Promise.race([
      getDoc(doc(firestore(), 'config', 'runtime')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timed out')), timeoutMs),
      ),
    ]);

    if (snapshot.exists()) {
      const value = snapshot.get('convertApi');
      // Only a non-empty string wins. An empty field is a half-written document
      // and must not silently blank out a working build-time address.
      if (typeof value === 'string' && value.trim() !== '') {
        fromFirestore = value.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Left on the build-time value on purpose.
  }
  return convertApiBase();
}

/**
 * Looks once now, and again if signing in changes the answer.
 *
 * The first attempt happens before anybody has signed in, which is right — the
 * address is not secret and `firestore.rules` in this repo makes `config/`
 * world-readable. The rules actually deployed are stricter than the repo's and
 * refuse an unauthenticated read, so that first attempt currently fails and the
 * app falls back to its build-time address for the whole session.
 *
 * Retrying when a user appears removes the dependency on which rules are live:
 * every consumer of this address is signed in by the time it is used anyway.
 * Once the repo's rules are deployed the first attempt will simply succeed and
 * the retry becomes a no-op.
 */
export function watchRuntimeConfig(): void {
  void loadRuntimeConfig();

  watchAuth((user) => {
    // Only worth re-reading if signing in could change the answer.
    if (user && !runtimeConfigLoaded()) void loadRuntimeConfig();
  });
}
