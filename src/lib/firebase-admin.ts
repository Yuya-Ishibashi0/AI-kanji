// src/lib/firebase-admin.ts (Simplified for environment variable debugging)
console.log('[firebase-admin.ts TEMPORARY DEBUG] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts TEMPORARY DEBUG] NODE_ENV:', process.env.NODE_ENV);

const directEnvVarsToLog = [
  'TEST_VAR_DIRECT',
  'ANOTHER_TEST_VAR'
];

console.log('[firebase-admin.ts TEMPORARY DEBUG] --- Logging Direct Environment Variables ---');
directEnvVarsToLog.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: EXISTS, Value: "${value}" (length: ${value.length})`);
  } else {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts TEMPORARY DEBUG] --- Finished Logging Direct Environment Variables ---');


const secretEnvVarsToLog = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_PLACES_API_KEY',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

console.log('[firebase-admin.ts TEMPORARY DEBUG] --- Logging Secret Environment Variables ---');
secretEnvVarsToLog.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: EXISTS (length: ${value.length})`);
    if (varName === 'FIREBASE_PRIVATE_KEY') {
      // For private key, just log existence and length, not the value itself for security,
      // even in debug, unless absolutely necessary and then immediately removed.
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (preview, first 10 after any processing): ${value.substring(0,10)}...`);
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} contains literal \\\\n: ${value.includes('\\n')}`);
      const formattedForCheck = value.replace(/\\n/g, '\n');
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (after replace) contains actual newline: ${formattedForCheck.includes('\n')}`);
    }
  } else {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts TEMPORARY DEBUG] --- Finished Logging Secret Environment Variables ---');


// Temporarily comment out all Firebase Admin SDK initialization logic
/*
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY) for Admin SDK init.');
    adminDb = {
      collection: (name: string) => {
        console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}') called, but Firestore is NOT INITIALIZED due to missing env vars.`);
        return {
          doc: (docId: string) => ({
            get: async () => ({ exists: false, data: () => undefined }),
            set: async (data: any) => Promise.resolve()
          })
        } as any;
      }
    } as any;
    console.log('[firebase-admin.ts] Firebase Admin SDK initialization SKIPPED. adminDb is MOCKED.');
  } else {
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('[firebase-admin.ts] All required Admin SDK env vars seem present. Preparing service account object...');
    try {
      const serviceAccount = {
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      };
      console.log('[firebase-admin.ts] Service account object constructed. Calling admin.initializeApp()...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ [firebase-admin.ts] Firebase Admin SDK initialized successfully!');
      adminDb = admin.firestore();
    } catch (e) {
      console.error('[firebase-admin.ts FATAL ERROR] Firebase Admin SDK initialization failed.', e);
      const error = e as Error;
      console.error(`[firebase-admin.ts ERROR DETAILS] Name: ${error.name}, Message: ${error.message}`);
      adminDb = {
        collection: (name: string) => {
          console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}') called, but Firestore FAILED TO INITIALIZE.`);
          return {
            doc: (docId: string) => ({
              get: async () => ({ exists: false, data: () => undefined }),
              set: async (data: any) => Promise.resolve()
            })
          } as any;
        }
      } as any;
      console.log('[firebase-admin.ts] adminDb is MOCKED due to initialization failure.');
    }
  }
} else {
  console.log('[firebase-admin.ts] Firebase admin app already initialized.');
  adminDb = admin.firestore();
}

export { adminDb };
*/

// Export a mock adminDb if the real one is commented out to prevent import errors
// This mock should be removed once the issue is resolved and Admin SDK init is restored.
export const adminDb = {
  collection: (name: string) => {
    console.warn(`[firebase-admin.ts MOCK (active due to full commenting)] adminDb.collection('${name}') called. Firestore functionality is disabled.`);
    return {
      doc: (docId: string) => ({
        get: async () => {
          console.warn(`[firebase-admin.ts MOCK (active)] adminDb.collection('${name}').doc('${docId}').get() called.`);
          return { exists: false, data: () => undefined };
        },
        set: async (data: any) => {
          console.warn(`[firebase-admin.ts MOCK (active)] adminDb.collection('${name}').doc('${docId}').set() called.`);
          return Promise.resolve();
        }
      })
    } as any;
  }
} as any;


console.log('[firebase-admin.ts TEMPORARY DEBUG] Module finished loading.');
