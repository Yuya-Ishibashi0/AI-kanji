
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
      const previewLength = 30;
      // Ensure value is a string and long enough before trying substring
      if (typeof value === 'string' && value.length > previewLength * 2) {
        console.log(`[firebase-admin.ts] ${varName} (preview, first ${previewLength} after any processing): ${value.substring(0,previewLength)}...`);
        console.log(`[firebase-admin.ts] ${varName} (preview, last ${previewLength} after any processing): ...${value.substring(value.length - previewLength)}`);
      } else if (typeof value === 'string') {
        console.log(`[firebase-admin.ts] ${varName} (full value as it's short): ${value}`);
      }
      // Check for literal \n and actual newline after potential replacement
      if (typeof value === 'string') {
        console.log(`[firebase-admin.ts] ${varName} contains literal \\\\n (before replace): ${value.includes('\\n')}`);
        const formattedForCheck = value.replace(/\\n/g, '\n');
        console.log(`[firebase-admin.ts] ${varName} (after replace) contains actual newline: ${formattedForCheck.includes('\n')}`);
      }
    }
  } else {
    console.log(`[firebase-admin.ts] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts] --- Finished Logging Secret Environment Variables ---');


import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin/app'; // Corrected import for ServiceAccount
import type { Firestore } from 'firebase-admin/firestore';

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
      console.log('[firebase-admin.ts] Service account object constructed. Checking admin object before initializeApp()...');
      console.log('[firebase-admin.ts] Type of admin object:', typeof admin);
      if (admin && typeof admin.initializeApp === 'function' && admin.credential && typeof admin.credential.cert === 'function') {
          console.log('[firebase-admin.ts] admin.initializeApp and admin.credential.cert appear to be functions.');
      } else {
          console.error('[firebase-admin.ts] CRITICAL: admin object or its key methods (initializeApp, credential.cert) are not correctly defined!');
          if (admin) {
              console.error('[firebase-admin.ts] admin.initializeApp type:', typeof admin.initializeApp);
              console.error('[firebase-admin.ts] admin.credential type:', typeof admin.credential);
              if (admin.credential) {
                console.error('[firebase-admin.ts] admin.credential.cert type:', typeof admin.credential.cert);
              }
          }
      }
      console.log('[firebase-admin.ts] Calling admin.initializeApp()...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ [firebase-admin.ts] Firebase Admin SDK initialized successfully!');
      adminDb = admin.firestore();
    } catch (e: any) {
      console.error('🔥 [firebase-admin.ts FATAL ERROR] Firebase Admin SDK initialization FAILED. Firestore functionality will be MOCKED.');
      console.error(`[firebase-admin.ts ERROR DETAILS] Error Type: ${e?.constructor?.name || typeof e}`);
      if (e?.message) {
        console.error(`[firebase-admin.ts ERROR DETAILS] Message: ${e.message}`);
      }
      if (e?.code) { // Standard error code
        console.error(`[firebase-admin.ts ERROR DETAILS] Code: ${e.code}`);
      }
      if (e?.errorInfo) { // Firebase specific error info
         console.error(`[firebase-admin.ts ERROR DETAILS] Firebase Error Info Code: ${e.errorInfo.code}`);
         console.error(`[firebase-admin.ts ERROR DETAILS] Firebase Error Info Message: ${e.errorInfo.message}`);
      }
      // Log the full error object, but be cautious with potentially large objects in production
      // For debugging, this is useful.
      try {
        console.error('[firebase-admin.ts ERROR DETAILS] Full error object (stringified):', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      } catch (stringifyError) {
        console.error('[firebase-admin.ts ERROR DETAILS] Full error object (could not stringify, logging as is):', e);
      }
      
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
  // Ensure adminDb is assigned here as well if an app already exists
  if (admin.apps[0]) { // Check if the first app is not null
    adminDb = admin.firestore(admin.apps[0]); // Get firestore from the existing app
  } else {
    // This case should ideally not happen if admin.apps.length > 0
    console.error('[firebase-admin.ts] CRITICAL: admin.apps array is populated but contains no valid app. Mocking adminDb.');
    // Fallback to mock, similar to initialization failure
    adminDb = { /* ... mock implementation ... */ } as any;
  }
}

export { adminDb };

console.log('[firebase-admin.ts] Module finished loading.');

    