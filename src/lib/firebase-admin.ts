
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts] NODE_ENV:', process.env.NODE_ENV);

import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin/app'; // Corrected import source
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

// Log critical env vars for debugging if they are present (briefly)
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY; // Keep let for potential modification

console.log('[firebase-admin.ts] --- Initial Firebase Admin SDK Env Var Check (Existence & Length) ---');
console.log(`[firebase-admin.ts] FIREBASE_PROJECT_ID: ${projectId ? `EXISTS (length: ${projectId.length})` : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] FIREBASE_CLIENT_EMAIL: ${clientEmail ? `EXISTS (length: ${clientEmail.length})` : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY: ${privateKey ? `EXISTS (length: ${privateKey.length})` : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] GOOGLE_PLACES_API_KEY: ${process.env.GOOGLE_PLACES_API_KEY ? 'EXISTS' : 'UNDEFINED'}`);
console.log(`[firebase-admin.ts] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'EXISTS' : 'UNDEFINED'}`);
// It's generally not recommended to log parts of private keys even in dev,
// but if absolutely necessary for debugging, ensure it's heavily redacted and temporary.
// For now, we'll rely on the "EXISTS" check.

if (privateKey && typeof privateKey === 'string') {
    // Ensure privateKey is a string before calling replace
    privateKey = privateKey.replace(/\\n/g, '\n');
} else if (privateKey) {
    console.warn('[firebase-admin.ts] FIREBASE_PRIVATE_KEY exists but is not a string. This could cause issues.');
}
console.log('[firebase-admin.ts] --- End Initial Firebase Admin SDK Env Var Check ---');


if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');

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
    console.log('[firebase-admin.ts] All required Admin SDK env vars seem present. Preparing service account object...');
    
    // Log the state of the admin object before attempting to use its properties
    console.log(`[firebase-admin.ts] typeof admin: ${typeof admin}`);
    console.log(`[firebase-admin.ts] typeof admin.initializeApp: ${typeof admin.initializeApp}`);
    console.log(`[firebase-admin.ts] typeof admin.credential: ${typeof admin.credential}`);
    if (admin.credential) {
      console.log(`[firebase-admin.ts] typeof admin.credential.cert: ${typeof admin.credential.cert}`);
    } else {
      console.warn('[firebase-admin.ts] admin.credential is undefined before initializeApp. This is unexpected.');
    }

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
      console.error('[firebase-admin.ts ERROR DETAILS] Stack Trace (if available):', e.stack || 'Not available');
      
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
            return { 
              doc: (docId: string) => ({
                get: async () => {
                  console.warn(`[firebase-admin.ts MOCK DB ACTIVE - EXISTING APP ISSUE] ...doc('${docId}').get() called.`);
                  return ({ exists: false, data: () => undefined });
                },
                set: async (data: any) => {
                  console.warn(`[firebase-admin.ts MOCK DB ACTIVE - EXISTING APP ISSUE] ...doc('${docId}').set() called with data:`, data);
                  return Promise.resolve();
                }
              })
            } as any;
        }
    } as any;
  }
}

export { adminDb };

console.log('[firebase-admin.ts] Module finished loading.');
