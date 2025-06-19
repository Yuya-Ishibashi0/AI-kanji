
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts] NODE_ENV:', process.env.NODE_ENV);

import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin/app'; // Corrected import source
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

// Log key environment variables for debugging if they are present
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

console.log('[firebase-admin.ts] --- Initial Firebase Admin SDK Env Var Check ---');
console.log(`[firebase-admin.ts] FIREBASE_PROJECT_ID: ${projectId ? `EXISTS (length: ${projectId.length})` : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] FIREBASE_CLIENT_EMAIL: ${clientEmail ? `EXISTS (length: ${clientEmail.length})` : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY: ${privateKey ? `EXISTS (length: ${privateKey.length})` : 'UNDEFINED'}`);
if (privateKey) {
  console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY (preview, first 30): ${privateKey.substring(0, 30)}...`);
  const containsLiteralSlashN = privateKey.includes('\\n');
  console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY contains literal \\n (before replace): ${containsLiteralSlashN}`);
  privateKey = privateKey.replace(/\\n/g, '\n');
  console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY (after replace) contains actual newline: ${privateKey.includes('\n')}`);
}
console.log('[firebase-admin.ts] --- End Initial Firebase Admin SDK Env Var Check ---');


if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables for init. Firestore functionality will be MOCKED.');
    // Fallback to a mock DB if critical env vars are missing
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
        } as any; // Type assertion for mock
      }
    } as any; // Type assertion for mock
    console.log('[firebase-admin.ts] Firebase Admin SDK initialization SKIPPED (missing env vars). adminDb is MOCKED.');
  } else {
    console.log('[firebase-admin.ts] All required Admin SDK env vars seem present. Preparing service account object...');
    try {
      const serviceAccount: ServiceAccount = {
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      };

      // Detailed check for admin object properties before initialization
      console.log('[firebase-admin.ts] Checking admin object properties before initializeApp()...');
      console.log(`[firebase-admin.ts] typeof admin: ${typeof admin}`);
      console.log(`[firebase-admin.ts] typeof admin.initializeApp: ${typeof admin.initializeApp}`);
      console.log(`[firebase-admin.ts] typeof admin.credential: ${typeof admin.credential}`);
      if (admin.credential) {
        console.log(`[firebase-admin.ts] typeof admin.credential.cert: ${typeof admin.credential.cert}`);
      }


      console.log('[firebase-admin.ts] Service account object constructed. Calling admin.initializeApp()...');
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
      if (e?.errorInfo) { // For Firebase specific errors
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
      
      // Fallback to a mock DB if initialization fails
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
          } as any; // Type assertion for mock
        }
      } as any; // Type assertion for mock
      console.log('[firebase-admin.ts] adminDb is MOCKED due to initialization failure.');
    }
  }
} else {
  console.log('[firebase-admin.ts] Firebase admin app already initialized. Reusing existing instance.');
  // Ensure adminDb is assigned from the existing app
  if (admin.apps[0]) {
    adminDb = admin.firestore(admin.apps[0]); 
  } else {
    // This case should ideally not happen if admin.apps.length > 0
    console.error('[firebase-admin.ts CRITICAL] admin.apps array is populated but contains no valid app. Mocking adminDb.');
    adminDb = { // MOCK DB
        collection: (name: string) => {
            console.warn(`[firebase-admin.ts MOCK DB ACTIVE - EXISTING APP ISSUE] adminDb.collection('${name}') called.`);
            return { /* ... (mock implementation as above) ... */ } as any;
        }
    } as any;
  }
}

export { adminDb };

console.log('[firebase-admin.ts] Module finished loading.');
