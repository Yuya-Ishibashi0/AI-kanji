
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts] NODE_ENV:', process.env.NODE_ENV);

const directEnvVarsToLog = [
  'TEST_VAR_DIRECT',
  'ANOTHER_TEST_VAR'
];

console.log('[firebase-admin.ts] --- Logging Direct Environment Variables (from .env.local or App Hosting direct value) ---');
directEnvVarsToLog.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts] ${varName}: EXISTS, Value: "${value}" (length: ${value.length})`);
  } else {
    console.log(`[firebase-admin.ts] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts] --- Finished Logging Direct Environment Variables ---');


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

console.log('[firebase-admin.ts] --- Logging Secret Environment Variables (from .env.local or Secret Manager) ---');
secretEnvVarsToLog.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts] ${varName}: EXISTS (length: ${value.length})`);
    if (varName === 'FIREBASE_PRIVATE_KEY') {
      console.log(`[firebase-admin.ts] ${varName} (preview, first 10 after any processing): ${value.substring(0,10)}...`);
      console.log(`[firebase-admin.ts] ${varName} contains literal \\\\n (before replace): ${value.includes('\\n')}`);
      const formattedForCheck = value.replace(/\\n/g, '\n');
      console.log(`[firebase-admin.ts] ${varName} (after replace) contains actual newline: ${formattedForCheck.includes('\n')}`);
    }
  } else {
    console.log(`[firebase-admin.ts] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts] --- Finished Logging Secret Environment Variables ---');


import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY) for Admin SDK init. Firestore functionality will be MOCKED.');
    // Fallback to a mock DB to prevent crashes, but log that it's mocked.
    adminDb = {
      collection: (name: string) => {
        console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}') called, but Firestore is NOT INITIALIZED due to missing env vars.`);
        return {
          doc: (docId: string) => ({
            get: async () => {
              console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}').doc('${docId}').get() called.`);
              return ({ exists: false, data: () => undefined });
            },
            set: async (data: any) => {
              console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}').doc('${docId}').set() called with data:`, data);
              return Promise.resolve();
            }
          })
        } as any;
      }
    } as any;
    console.log('[firebase-admin.ts] Firebase Admin SDK initialization SKIPPED. adminDb is MOCKED.');
  } else {
    // IMPORTANT: Replace literal "\\n" with actual newline characters if the key was stored as a single line string.
    // This is crucial if the private key is coming from an environment variable that might have escaped newlines.
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
      // Fallback to a mock DB in case of initialization failure as well
      adminDb = {
        collection: (name: string) => {
          console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}') called, but Firestore FAILED TO INITIALIZE.`);
          return {
            doc: (docId: string) => ({
              get: async () => {
                console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}').doc('${docId}').get() called during init failure.`);
                return ({ exists: false, data: () => undefined });
              },
              set: async (data: any) => {
                console.warn(`[firebase-admin.ts MOCK DB ACTIVE] adminDb.collection('${name}').doc('${docId}').set() called with data during init failure:`, data);
                return Promise.resolve();
              }
            })
          } as any;
        }
      } as any;
      console.log('[firebase-admin.ts] adminDb is MOCKED due to initialization failure.');
    }
  }
} else {
  console.log('[firebase-admin.ts] Firebase admin app already initialized. Reusing existing instance.');
  adminDb = admin.firestore();
}

export { adminDb };

console.log('[firebase-admin.ts] Module finished loading.');
