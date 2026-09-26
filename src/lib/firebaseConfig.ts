/**
 * Firebase Web SDK config, from VITE_FIREBASE_* env vars instead of the
 * committed firebase-applet-config.json this replaced. Firebase Web config
 * values aren't secret by design (Firebase enforces access via Security
 * Rules, not by hiding these) — this is about not checking a
 * project-specific file into source control, the same convention every
 * other credential in this app follows.
 */
const env = (import.meta as any).env || {};

export const firebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

export const firestoreDatabaseId: string = env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '';
