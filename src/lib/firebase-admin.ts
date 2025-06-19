
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
      console.log(`[firebase-admin.ts] ${varName} (preview, first 30 after any processing): ${value.substring(0,30)}...`);
      console.log(`[firebase-admin.ts] ${varName} (preview, last 30 after any processing): ...${value.substring(value.length - 30)}`);
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
import type { Firestore, ServiceAccount } from 'firebase-admin/firestore';

let adminDb: Firestore;

if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY) for Admin SDK init. Firestore functionality will be MOCKED.');
    adminDb = {
      collection: (name: string) => {
        console.warn(`[firebase-admin.ts MOCK DB ACTIVE - MISSING ENV VARS] adminDb.collection('${name}') called.`);
        return {
          doc: (docId: string) => ({
            get: async () => {
              console.warn(`[firebase-admin.ts MOCK DB ACTIVE - MISSING ENV VARS] ...doc('${docId}').get() called.`);
              return ({ exists: false, data: () => undefined });
            },
            set: async (data: any) => {
              console.warn(`[firebase-admin.ts MOCK DB ACTIVE - MISSING ENV VARS] ...doc('${docId}').set() called with data:`, data);
              return Promise.resolve();
            }
          })
        } as any;
      }
    } as any;
    console.log('[firebase-admin.ts] Firebase Admin SDK initialization SKIPPED (missing env vars). adminDb is MOCKED.');
  } else {
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('[firebase-admin.ts] All required Admin SDK env vars seem present. Preparing service account object...');
    try {
      const serviceAccount: ServiceAccount = {
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
    } catch (e: any) {
      console.error('🔥 [firebase-admin.ts FATAL ERROR] Firebase Admin SDK initialization FAILED. Firestore functionality will be MOCKED.');
      console.error(`[firebase-admin.ts ERROR DETAILS] Error Type: ${e.constructor.name}`);
      if (e.message) {
        console.error(`[firebase-admin.ts ERROR DETAILS] Message: ${e.message}`);
      }
      if (e.code) {
        console.error(`[firebase-admin.ts ERROR DETAILS] Code: ${e.code}`);
      }
      if (e.errorInfo) { // Firebase specific error info
         console.error(`[firebase-admin.ts ERROR DETAILS] Firebase Error Info Code: ${e.errorInfo.code}`);
         console.error(`[firebase-admin.ts ERROR DETAILS] Firebase Error Info Message: ${e.errorInfo.message}`);
      }
      console.error('[firebase-admin.ts ERROR DETAILS] Full error object:', e);
      
      adminDb = {
        collection: (name: string) => {
          console.warn(`[firebase-admin.ts MOCK DB ACTIVE - INIT FAILURE] adminDb.collection('${name}') called.`);
          return {
            doc: (docId: string) => ({
              get: async () => {
                console.warn(`[firebase-admin.ts MOCK DB ACTIVE - INIT FAILURE] ...doc('${docId}').get() called.`);
                return ({ exists: false, data: () => undefined });
              },
              set: async (data: any) => {
                console.warn(`[firebase-admin.ts MOCK DB ACTIVE - INIT FAILURE] ...doc('${docId}').set() called with data:`, data);
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
