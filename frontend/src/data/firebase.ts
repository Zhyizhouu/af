import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase, against the same project the Flutter build uses.
 *
 * The keys here are public identifiers by design — anybody can point a client
 * at this project, and `firestore.rules` is the only thing protecting the data.
 * That is why they sit in the source of both apps rather than in a secret.
 */
const config = {
  apiKey: 'AIzaSyAa2WiZEIfbnvoCK8SXTqJQ6B4Qw7T5X1M',
  appId: '1:317661900103:web:786b2d3489c9432d4eb062',
  messagingSenderId: '317661900103',
  projectId: 'af-main',
  authDomain: 'af-main.firebaseapp.com',
  storageBucket: 'af-main.firebasestorage.app',
};

let app: FirebaseApp | null = null;

export const firebaseApp = (): FirebaseApp => (app ??= initializeApp(config));
export const auth = (): Auth => getAuth(firebaseApp());
export const firestore = (): Firestore => getFirestore(firebaseApp());

export type { User };

export const watchAuth = (onChange: (user: User | null) => void) =>
  onAuthStateChanged(auth(), onChange);

export const signInWithGoogle = () =>
  signInWithPopup(auth(), new GoogleAuthProvider());

export const signInWithPassword = (email: string, password: string) =>
  signInWithEmailAndPassword(auth(), email.trim(), password);

export const registerWithPassword = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth(), email.trim(), password);

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth(), email.trim());

export const signOutNow = () => signOut(auth());

/**
 * The credential the API asks for.
 *
 * Returned rather than cached: the SDK refreshes an expiring token on request,
 * so asking every time is both correct and cheap.
 */
export const idToken = async (): Promise<string | null> => {
  const user = auth().currentUser;
  return user ? user.getIdToken() : null;
};

/**
 * Whether this account holds the `admin` custom claim.
 *
 * Read off the decoded ID token, whose signature Firebase has already checked —
 * so this is not the client deciding it is an admin, it is the client reading
 * what a signed token says. The claim cannot be written from here at all; only
 * the Admin SDK can set one, which is what makes it worth trusting.
 *
 * What this governs is *drawing*, and drawing is not a security boundary. The
 * routes refuse a non-admin themselves; hiding the program only avoids
 * offering a button that would 403.
 *
 * `forceRefresh` matters after a claim changes: a token already in hand keeps
 * its old claims for up to an hour, so a freshly promoted admin would see
 * nothing until it expired.
 */
export const isAdmin = async (forceRefresh = false): Promise<boolean> => {
  const user = auth().currentUser;
  if (!user) return false;
  const result = await user.getIdTokenResult(forceRefresh);
  return result.claims.admin === true;
};

/**
 * Errors worth reading, in this app's voice rather than Firebase's.
 *
 * Credential failures are deliberately blurred into one message: a form that
 * distinguishes "no such account" from "wrong password" is a form that will
 * tell a stranger which of your addresses have accounts.
 */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'That email and password do not match an account.';
    case 'auth/email-already-in-use':
      return 'There is already an account with that address.';
    case 'auth/weak-password':
      return 'Use at least six characters.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled on this Firebase project.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'That address is already registered with a password. Sign in with it instead.';
    default:
      return 'Sign-in failed. Try again.';
  }
}

export { EmailAuthProvider };
