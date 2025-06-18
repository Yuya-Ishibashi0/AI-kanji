
import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

console.log("Attempting to initialize Firebase Admin SDK...");

const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJsonString || typeof serviceAccountJsonString !== 'string' || serviceAccountJsonString.trim() === '') {
    const errorMessage = "CRITICAL FAILURE: Environment variable FIREBASE_SERVICE_ACCOUNT_JSON is not set or is empty. This is required for Firebase Admin SDK initialization. Please check your .env.local file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("FIREBASE_SERVICE_ACCOUNT_JSON environment variable found.");

let serviceAccount: ServiceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountJsonString);
    console.log("Successfully parsed FIREBASE_SERVICE_ACCOUNT_JSON string.");
} catch (e: any) {
    const errorMessage = `CRITICAL FAILURE: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Please ensure it's a valid JSON string and private_key newlines are correctly escaped as \\\\n. Raw Error: ${e.message}`;
    console.error(errorMessage);
    console.error("Value of FIREBASE_SERVICE_ACCOUNT_JSON that failed to parse (first 100 chars):", serviceAccountJsonString.substring(0,100) + "...");
    throw new Error(errorMessage);
}

if (typeof serviceAccount !== 'object' || serviceAccount === null) {
    const errorMessage = "CRITICAL FAILURE: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a valid object. It resolved to: " + String(serviceAccount);
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("Parsed FIREBASE_SERVICE_ACCOUNT_JSON is an object.");

const requiredKeys: (keyof ServiceAccount)[] = ['project_id', 'private_key', 'client_email'];
const missingKeys = requiredKeys.filter(key => !(key in serviceAccount) || !serviceAccount[key]);

if (missingKeys.length > 0) {
    const errorMessage = `CRITICAL FAILURE: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing or has empty values for required keys: ${missingKeys.join(', ')}. Please check the content of this variable in your .env.local file.`;
    console.error(errorMessage);
    console.error("Parsed object for debugging (excluding private_key):", { ...serviceAccount, private_key: "[REDACTED]"});
    throw new Error(errorMessage);
}
console.log("All required keys (project_id, private_key, client_email) are present and non-empty in the parsed service account JSON.");

// Validate types of crucial fields
if (typeof serviceAccount.project_id !== 'string') {
    const errorMessage = `CRITICAL FAILURE: 'project_id' in FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof serviceAccount.project_id}. Value: ${serviceAccount.project_id}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
if (typeof serviceAccount.private_key !== 'string') {
     const errorMessage = `CRITICAL FAILURE: 'private_key' in FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof serviceAccount.private_key}. Ensure newlines are escaped as \\\\n. Value (first 30 chars): ${String(serviceAccount.private_key).substring(0,30)}...`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
if (typeof serviceAccount.client_email !== 'string') {
    const errorMessage = `CRITICAL FAILURE: 'client_email' in FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof serviceAccount.client_email}. Value: ${serviceAccount.client_email}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("Data types for project_id, private_key, and client_email are correct.");


if (!admin.apps.length) {
  try {
    console.log("No existing Firebase app found, attempting to initialize with parsed credentials...");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON environment variable!");
  } catch (error: any) {
    let detailedErrorMessage = `FATAL ERROR: Firebase Admin SDK initializeApp failed. Raw Error Name: ${error.name}, Message: ${error.message}.`;
    if (error.message && (error.message.toLowerCase().includes("privatekey") || error.message.toLowerCase().includes("private_key"))) {
        detailedErrorMessage += " This often indicates an issue with the format of 'private_key' in FIREBASE_SERVICE_ACCOUNT_JSON (e.g., newlines not properly escaped as \\\\n, or the key itself is malformed).";
    } else if (error.code === 'app/invalid-credential' || (error.errorInfo && error.errorInfo.code === 'auth/invalid-credential')) {
        detailedErrorMessage += " The credential object itself is invalid. Double-check all fields in your service account JSON, especially project_id and client_email.";
    }
    console.error(detailedErrorMessage);
    if (error.stack) {
        console.error("Error Stack:", error.stack);
    }
    console.error("Service account used (excluding private_key):", { ...serviceAccount, private_key: "[REDACTED FOR LOGGING]"});
    throw new Error(detailedErrorMessage);
  }
} else {
  console.log("Firebase Admin SDK already initialized. Reusing existing instance.");
}

export const adminDb = admin.firestore();
console.log("Firebase Admin SDK setup complete. adminDb exported.");
