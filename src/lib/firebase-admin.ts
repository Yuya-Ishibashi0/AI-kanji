
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts TEMPORARY DEBUG] Module starting to load. Timestamp:', new Date().toISOString());
console.log('[firebase-admin.ts TEMPORARY DEBUG] NODE_ENV:', process.env.NODE_ENV);

const envVarsToLog = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_PLACES_API_KEY', // Though not used in this file, good to check
  'GEMINI_API_KEY',         // Though not used in this file, good to check
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

envVarsToLog.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: EXISTS (length: ${value.length})`);
    if (varName === 'FIREBASE_PRIVATE_KEY') {
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (first 20 char after any processing): ${value.substring(0,20)}...`);
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} contains literal \\n: ${value.includes('\\n')}`);
      const formattedForCheck = value.replace(/\\n/g, '\n');
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (after replace) contains actual newline: ${formattedForCheck.includes('\n')}`);
    }
  } else {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: UNDEFINED`);
  }
});

import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

let adminDb: Firestore;

if (!admin.apps.length) {
  console.log('[firebase-admin.ts] No Firebase admin apps initialized. Attempting to initialize...');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[firebase-admin.ts FATAL ERROR] Missing required Firebase Admin SDK environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY).');
    console.error(`[firebase-admin.ts DEBUG] projectId: ${projectId ? 'Set' : 'UNDEFINED'}`);
    console.error(`[firebase-admin.ts DEBUG] clientEmail: ${clientEmail ? 'Set' : 'UNDEFINED'}`);
    console.error(`[firebase-admin.ts DEBUG] privateKey: ${privateKey ? 'Set (length: ' + privateKey.length + ')' : 'UNDEFINED'}`);
    
    // Mock adminDb to prevent further errors if other modules import it
    adminDb = {
      collection: (name: string) => {
        console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}') called, but Firestore is NOT INITIALIZED due to missing env vars.`);
        return {
          doc: (docId: string) => ({
            get: async () => {
              console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}').doc('${docId}').get() called, Firestore NOT INITIALIZED.`);
              return { exists: false, data: () => undefined };
            },
            set: async (data: any) => {
                console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}').doc('${docId}').set() called, Firestore NOT INITIALIZED.`);
                return Promise.resolve();
            }
          })
        };
      }
    } as any;
    console.log('[firebase-admin.ts] Firebase Admin SDK initialization SKIPPED due to missing env vars. adminDb is MOCKED.');

  } else {
    // Ensure private key's literal \n are replaced with actual newlines
    // This is crucial if the private key is passed as a single-line string with escaped newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('[firebase-admin.ts] All required Admin SDK env vars seem present. Preparing service account object...');
    console.log(`[firebase-admin.ts DEBUG] Using projectId: ${projectId}`);
    console.log(`[firebase-admin.ts DEBUG] Using clientEmail: ${clientEmail}`);
    console.log(`[firebase-admin.ts DEBUG] Using privateKey (first 30 chars after replace): ${privateKey.substring(0,30)}...`);

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
      console.error('[firebase-admin.ts FATAL ERROR] Firebase Admin SDK initialization failed during admin.initializeApp() or admin.credential.cert().', e);
      const error = e as Error;
      console.error(`[firebase-admin.ts ERROR DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
      adminDb = {
        collection: (name: string) => {
          console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}') called, but Firestore FAILED TO INITIALIZE.`);
          return {
            doc: (docId: string) => ({
              get: async () => {
                console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}').doc('${docId}').get() called, Firestore FAILED TO INITIALIZE.`);
                return { exists: false, data: () => undefined };
              },
              set: async (data: any) => {
                  console.warn(`[firebase-admin.ts MOCK] adminDb.collection('${name}').doc('${docId}').set() called, Firestore FAILED TO INITIALIZE.`);
                  return Promise.resolve();
              }
            })
          };
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
console.log('[firebase-admin.ts TEMPORARY DEBUG] Module finished loading.');
