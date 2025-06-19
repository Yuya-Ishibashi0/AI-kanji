
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts] NODE_ENV:', process.env.NODE_ENV);

const envVarsToCheck = [
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

console.log('[firebase-admin.ts] --- Checking Key Environment Variables ---');
envVarsToCheck.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    const preview = (varName === 'FIREBASE_PRIVATE_KEY') ? `(length: ${value.length}, preview: ${value.substring(0, 20)}...)` : `(length: ${value.length})`;
    console.log(`[firebase-admin.ts] ${varName}: EXISTS ${preview}`);
  } else {
    console.log(`[firebase-admin.ts] ${varName}: UNDEFINED`);
  }
});
console.log('[firebase-admin.ts] --- Finished Checking Key Environment Variables ---');

import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables for init. Firestore functionality will be MOCKED.');
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
    // Ensure private key newlines are correctly formatted
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    try {
      const serviceAccount: ServiceAccount = {
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      };

      // Detailed check for admin object properties before initialization
      console.log('[firebase-admin.ts] Checking admin object properties before initializeApp()...');
      console.log(`[firebase-admin.ts] typeof admin: ${typeof admin}`);
      if (admin && typeof admin.initializeApp === 'function') {
        console.log('[firebase-admin.ts] admin.initializeApp is a function.');
      } else {
        console.error('[firebase-admin.ts CRITICAL] admin.initializeApp is NOT a function or admin object is problematic.');
      }
      if (admin && admin.credential && typeof admin.credential.cert === 'function') {
        console.log('[firebase-admin.ts] admin.credential.cert is a function.');
      } else {
        console.error('[firebase-admin.ts CRITICAL] admin.credential.cert is NOT a function or admin.credential object is problematic.');
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
      if (e?.code) { 
        console.error(`[firebase-admin.ts ERROR DETAILS] Code: ${e.code}`);
      }
      if (e?.errorInfo) { 
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
  if (admin.apps[0]) {
    adminDb = admin.firestore(admin.apps[0]); 
  } else {
    console.error('[firebase-admin.ts CRITICAL] admin.apps array is populated but contains no valid app. Mocking adminDb.');
    adminDb = { 
        collection: (name: string) => {
            console.warn(`[firebase-admin.ts MOCK DB ACTIVE - EXISTING APP ISSUE] adminDb.collection('${name}') called.`);
            return { /* ... (mock implementation as above) ... */ } as any;
        }
    } as any;
  }
}

export { adminDb };

console.log('[firebase-admin.ts] Module finished loading.');
