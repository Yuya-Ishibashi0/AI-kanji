
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts TEMPORARY DEBUG] Module starting to load. Timestamp:', new Date().toISOString());

console.log('[firebase-admin.ts TEMPORARY DEBUG] NODE_ENV:', process.env.NODE_ENV);

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

envVarsToCheck.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: EXISTS (length: ${value.length})`);
    if (varName === 'FIREBASE_PRIVATE_KEY') {
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (first 20 char): ${value.substring(0,20)}...`);
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} contains literal \\n: ${value.includes('\\n')}`);
      const formattedForCheck = value.replace(/\\n/g, '\n');
      console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName} (after replace) contains actual newline: ${formattedForCheck.includes('\n')}`);
    }
  } else {
    console.log(`[firebase-admin.ts TEMPORARY DEBUG] ${varName}: UNDEFINED`);
  }
});


console.log('[firebase-admin.ts TEMPORARY DEBUG] Firebase Admin SDK initialization SKIPPED. adminDb will be mocked.');

// To ensure this file still exports something that other files might expect,
// and to prevent build errors if other files import adminDb expecting a Firestore instance.
// This is a very crude mock.
export const adminDb = {
  collection: (name: string) => {
    console.warn(`[firebase-admin.ts TEMPORARY DEBUG] adminDb.collection('${name}') called, but Firestore is mocked.`);
    return {
      doc: (docId: string) => ({
        get: async () => {
          console.warn(`[firebase-admin.ts TEMPORARY DEBUG] adminDb.collection('${name}').doc('${docId}').get() called, but Firestore is mocked.`);
          return { exists: false, data: () => undefined };
        },
        set: async (data: any) => {
            console.warn(`[firebase-admin.ts TEMPORARY DEBUG] adminDb.collection('${name}').doc('${docId}').set() called with data:`, data , `but Firestore is mocked.`);
            return Promise.resolve();
        }
      })
    };
  }
} as any; // Cast to any to satisfy potential type checks, though it's not a real Firestore instance.

console.log('[firebase-admin.ts TEMPORARY DEBUG] Mocked adminDb exported.');
