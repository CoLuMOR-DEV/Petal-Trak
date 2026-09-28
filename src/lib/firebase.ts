import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import baseConfig from '../../firebase-applet-config.json';

// Helper to parse a valid Firestore database ID (ignoring URLs accidentally put in VITE_FIREBASE_DATABASE_ID)
function parseFirestoreDbId(rawId?: string): string | undefined {
  if (!rawId || typeof rawId !== 'string') return undefined;
  const trimmed = rawId.trim();
  if (!trimmed || trimmed === '(default)') return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.includes(':')) {
    return undefined;
  }
  return trimmed;
}

// Helper to parse Realtime Database URL
function parseRtdbUrl(rawUrl?: string, rawDbId?: string): string {
  if (rawUrl && typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
    return rawUrl.trim();
  }
  if (rawDbId && typeof rawDbId === 'string' && rawDbId.startsWith('http')) {
    return rawDbId.trim();
  }
  return (baseConfig as any).databaseURL || 'https://rdyearproject-b4647-default-rtdb.asia-southeast1.firebasedatabase.app';
}

const envDbId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const envRtdbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL;

// Support environment variables with automatic fallback to provisioned configuration
export const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || baseConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || baseConfig.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
  databaseURL: parseRtdbUrl(envRtdbUrl, envDbId),
  firestoreDatabaseId: parseFirestoreDbId(envDbId) || parseFirestoreDbId(baseConfig.firestoreDatabaseId),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore safely
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Firebase Realtime Database
export const rtdb = firebaseConfig.databaseURL
  ? getDatabase(app, firebaseConfig.databaseURL)
  : getDatabase(app);

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Notice: ', JSON.stringify(errInfo));
  return errInfo;
}

// Test connection on boot per Firebase guidelines
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info("Firebase client operating in local cache / offline fallback mode.");
    }
  }
}
