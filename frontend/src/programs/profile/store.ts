import { changeEmail, changePassword, type User } from '../../data/firebase';

/** Google-only accounts hold no `'password'` entry in `providerData` — there
 *  is no password to reauthenticate with, so the credential forms hide. */
export const hasPasswordProvider = (user: User | null): boolean =>
  (user?.providerData ?? []).some((provider) => provider.providerId === 'password');

export const providerLabel = (user: User | null): string =>
  hasPasswordProvider(user) ? 'Email and password' : 'Google';

export { changeEmail, changePassword };
