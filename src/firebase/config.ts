// Firebase web configuration comes from Vite environment variables (see .env.example).
// These values identify the Firebase project and are safe to ship to browsers; access
// control is enforced by Firebase Authentication and firestore.rules, not by secrecy.

const env = import.meta.env

export const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true'

export const firebaseConfig = useEmulators
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-pipeline-architect.firebaseapp.com',
      projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-pipeline-architect',
      appId: env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
      projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
      appId: env.VITE_FIREBASE_APP_ID as string | undefined,
    }

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)
