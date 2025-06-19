
// src/lib/firebase-admin.ts
console.log('[firebase-admin.ts] Module starting to load. Timestamp:', new Date().toISOString());

console.log('[firebase-admin.ts] Checking existence of FIREBASE_PROJECT_ID:', typeof process.env.FIREBASE_PROJECT_ID !== 'undefined', 'Value:', process.env.FIREBASE_PROJECT_ID ? `"${process.env.FIREBASE_PROJECT_ID}"` : 'undefined');
console.log('[firebase-admin.ts] Checking existence of FIREBASE_CLIENT_EMAIL:', typeof process.env.FIREBASE_CLIENT_EMAIL !== 'undefined', 'Value:', process.env.FIREBASE_CLIENT_EMAIL ? `"${process.env.FIREBASE_CLIENT_EMAIL}"` : 'undefined');
console.log('[firebase-admin.ts] Checking existence of FIREBASE_PRIVATE_KEY:', typeof process.env.FIREBASE_PRIVATE_KEY !== 'undefined');

if (typeof process.env.FIREBASE_PRIVATE_KEY === 'string') {
  console.log('[firebase-admin.ts] FIREBASE_PRIVATE_KEY length:', process.env.FIREBASE_PRIVATE_KEY.length);
  const pkPreviewStart = process.env.FIREBASE_PRIVATE_KEY.substring(0, 40);
  const pkPreviewEnd = process.env.FIREBASE_PRIVATE_KEY.substring(process.env.FIREBASE_PRIVATE_KEY.length - 40);
  console.log(`[firebase-admin.ts] FIREBASE_PRIVATE_KEY preview: ${pkPreviewStart}...${pkPreviewEnd}`);
  console.log('[firebase-admin.ts] FIREBASE_PRIVATE_KEY contains literal \\n:', process.env.FIREBASE_PRIVATE_KEY.includes('\\n'));
  console.log('[firebase-admin.ts] FIREBASE_PRIVATE_KEY contains actual newline character ( রূপান্তরিত হওয়ার আগে):', process.env.FIREBASE_PRIVATE_KEY.includes('\n'));
} else {
  console.log('[firebase-admin.ts] FIREBASE_PRIVATE_KEY is not a string or is undefined.');
}

import admin from "firebase-admin";
import type { ServiceAccount as FirebaseAdminServiceAccountType } from "firebase-admin";

console.log("[firebase-admin.ts] Attempting to initialize Firebase Admin SDK using 3-variable method...");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyFromEnv = process.env.FIREBASE_PRIVATE_KEY;

let criticalError = false;
const detailedErrorMessages: string[] = [];

if (!projectId) {
    const msg = "[firebase-admin.ts] CRITICAL FAILURE: Environment variable FIREBASE_PROJECT_ID is not set.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("[firebase-admin.ts] FIREBASE_PROJECT_ID environment variable found:", projectId);
}

if (!clientEmail) {
    const msg = "[firebase-admin.ts] CRITICAL FAILURE: Environment variable FIREBASE_CLIENT_EMAIL is not set.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("[firebase-admin.ts] FIREBASE_CLIENT_EMAIL environment variable found.");
}

if (!privateKeyFromEnv) {
    const msg = "[firebase-admin.ts] CRITICAL FAILURE: Environment variable FIREBASE_PRIVATE_KEY is not set.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("[firebase-admin.ts] FIREBASE_PRIVATE_KEY environment variable found (existence check passed). Length:", privateKeyFromEnv.length);
}

if (criticalError) {
    const finalErrorMessage = `[firebase-admin.ts] CRITICAL FAILURE: One or more required Firebase Admin environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing. Details: ${detailedErrorMessages.join('; ')}`;
    console.error("[firebase-admin.ts] THROWING ERROR (pre-initialization):", finalErrorMessage);
    throw new Error(finalErrorMessage);
}

const formattedPrivateKey = privateKeyFromEnv?.replace(/\\n/g, '\n');
console.log('[firebase-admin.ts] Formatted private key. Length after replacing \\n with actual newlines:', formattedPrivateKey?.length);
if (formattedPrivateKey && (!formattedPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----') || !formattedPrivateKey.includes('-----END PRIVATE KEY-----'))) {
    const msg = `[firebase-admin.ts] CRITICAL FAILURE: The formatted FIREBASE_PRIVATE_KEY appears malformed. It must start with '-----BEGIN PRIVATE KEY-----' and end with '-----END PRIVATE KEY-----'. Current (obfuscated) start: ${formattedPrivateKey?.substring(0,20)}... Current (obfuscated) end: ...${formattedPrivateKey?.slice(-20)}`;
    console.error(msg);
    throw new Error(msg);
}


let serviceAccountForSdk: FirebaseAdminServiceAccountType;
try {
  console.log("[firebase-admin.ts] Attempting to construct serviceAccount object for Admin SDK credential...");
  serviceAccountForSdk = {
    projectId: projectId!,
    clientEmail: clientEmail!,
    privateKey: formattedPrivateKey!,
  };
  console.log("[firebase-admin.ts] Service account object constructed. Project ID:", serviceAccountForSdk.projectId, "Client Email:", serviceAccountForSdk.clientEmail, "Private Key (length):", serviceAccountForSdk.privateKey.length);
} catch (e: any) {
  const errMsg = `[firebase-admin.ts] CRITICAL FAILURE: Error constructing serviceAccount object: ${e.message}. This might be due to an issue with projectId, clientEmail, or privateKey variables before they are even used by Firebase.`;
  console.error(errMsg, e.stack || e);
  throw new Error(errMsg);
}

if (!admin.apps.length) {
  try {
    console.log("[firebase-admin.ts] No existing Firebase app found, attempting to initialize with credentials...");
    
    let credential;
    try {
      console.log("[firebase-admin.ts] Calling admin.credential.cert()...");
      credential = admin.credential.cert(serviceAccountForSdk);
      console.log("[firebase-admin.ts] admin.credential.cert() successful.");
    } catch (certError: any) {
      const errMsg = `[firebase-admin.ts] FATAL ERROR: admin.credential.cert() failed. Raw Error Name: ${certError.name}, Message: ${certError.message}. This usually means the service account key (especially private_key) is malformed or invalid.`;
      console.error(errMsg, certError.stack);
      console.error("[firebase-admin.ts] Service account object passed to admin.credential.cert() (excluding privateKey):", { projectId: serviceAccountForSdk.projectId, clientEmail: serviceAccountForSdk.clientEmail, privateKey: "[REDACTED FOR LOGGING]"});
      throw new Error(errMsg);
    }
    
    console.log("[firebase-admin.ts] Calling admin.initializeApp()...");
    admin.initializeApp({ credential });
    console.log("✅ [firebase-admin.ts] Firebase Admin SDK initialized successfully!");
  } catch (error: any) {
    let sdkInitErrorMessage = `[firebase-admin.ts] FATAL ERROR: Firebase Admin SDK initialization failed. Raw Error Name: ${error.name}, Message: ${error.message}.`;
    if (error.message && (error.message.toLowerCase().includes("privatekey") || error.message.toLowerCase().includes("private_key"))) {
        sdkInitErrorMessage += " This often indicates an issue with the format or content of 'FIREBASE_PRIVATE_KEY'.";
    } else if (error.code === 'app/invalid-credential' || (error.errorInfo && error.errorInfo.code === 'auth/invalid-credential')) {
        sdkInitErrorMessage += " The credential object itself is invalid. Double-check all three environment variables.";
    } else if (error.message && error.message.includes("Error: error:0909006C:PEM routines:get_name:no start line")) {
        sdkInitErrorMessage += " This specific PEM routine error strongly suggests the private key is not correctly formatted.";
    }
    console.error(sdkInitErrorMessage);
    if (error.stack) {
        console.error("Error Stack:", error.stack);
    }
    console.error("[firebase-admin.ts] Service account object passed (excluding privateKey):", { projectId: serviceAccountForSdk?.projectId, clientEmail: serviceAccountForSdk?.clientEmail, privateKey: "[REDACTED FOR LOGGING]"});
    throw new Error(sdkInitErrorMessage);
  }
} else {
  console.log("[firebase-admin.ts] Firebase Admin SDK already initialized. Reusing existing instance.");
}

export const adminDb = admin.firestore();
console.log("[firebase-admin.ts] Firebase Admin SDK setup complete. adminDb exported.");
