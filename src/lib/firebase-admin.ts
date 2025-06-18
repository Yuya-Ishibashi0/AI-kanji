
import admin from "firebase-admin";
import type { ServiceAccount as FirebaseAdminServiceAccountType } from "firebase-admin";

// Interface for the actual structure of the parsed JSON (which uses snake_case)
interface ParsedServiceAccountJson {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
  [key: string]: any; // Allow other properties that might exist
}

console.log("Attempting to initialize Firebase Admin SDK...");

const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJsonString || typeof serviceAccountJsonString !== 'string' || serviceAccountJsonString.trim() === '') {
    const errorMessage = "CRITICAL FAILURE: Environment variable FIREBASE_SERVICE_ACCOUNT_JSON is not set or is empty. This is required for Firebase Admin SDK initialization. Please check your .env.local file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("FIREBASE_SERVICE_ACCOUNT_JSON environment variable found.");

let parsedJson: ParsedServiceAccountJson;
try {
    parsedJson = JSON.parse(serviceAccountJsonString);
    console.log("Successfully parsed FIREBASE_SERVICE_ACCOUNT_JSON string.");
} catch (e: any) {
    const errorMessage = `CRITICAL FAILURE: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Please ensure it's a valid JSON string and private_key newlines are correctly escaped as \\\\n. Raw Error: ${e.message}`;
    console.error(errorMessage);
    console.error("Value of FIREBASE_SERVICE_ACCOUNT_JSON that failed to parse (first 100 chars):", serviceAccountJsonString.substring(0,100) + "...");
    throw new Error(errorMessage);
}

if (typeof parsedJson !== 'object' || parsedJson === null) {
    const errorMessage = "CRITICAL FAILURE: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a valid object. It resolved to: " + String(parsedJson);
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("Parsed FIREBASE_SERVICE_ACCOUNT_JSON is an object.");

const requiredSnakeCaseKeys: (keyof ParsedServiceAccountJson)[] = ['project_id', 'private_key', 'client_email'];
const missingKeys = requiredSnakeCaseKeys.filter(key => !(key in parsedJson) || !parsedJson[key]);

if (missingKeys.length > 0) {
    const errorMessage = `CRITICAL FAILURE: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing or has empty values for required snake_case keys: ${missingKeys.join(', ')}. Please check the content of this variable in your .env.local file.`;
    console.error(errorMessage);
    console.error("Parsed object for debugging (excluding private_key):", { ...parsedJson, private_key: "[REDACTED]"});
    throw new Error(errorMessage);
}
console.log("All required snake_case keys (project_id, private_key, client_email) are present and non-empty in the parsed service account JSON.");

// Validate types of crucial fields from the parsed JSON (using snake_case keys)
if (typeof parsedJson.project_id !== 'string') {
    const errorMessage = `CRITICAL FAILURE: 'project_id' in parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof parsedJson.project_id}. Value: ${parsedJson.project_id}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
if (typeof parsedJson.private_key !== 'string') {
     const errorMessage = `CRITICAL FAILURE: 'private_key' in parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof parsedJson.private_key}. Ensure newlines are escaped as \\\\n. Value (first 30 chars): ${String(parsedJson.private_key).substring(0,30)}...`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
if (typeof parsedJson.client_email !== 'string') {
    const errorMessage = `CRITICAL FAILURE: 'client_email' in parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a string. Current type: ${typeof parsedJson.client_email}. Value: ${parsedJson.client_email}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}
console.log("Data types for project_id, private_key, and client_email are correct in the parsed JSON.");

// Transform the parsed snake_case object to the camelCase object expected by FirebaseAdminServiceAccountType
const serviceAccountForSdk: FirebaseAdminServiceAccountType = {
    projectId: parsedJson.project_id,
    clientEmail: parsedJson.client_email,
    privateKey: parsedJson.private_key?.replace(/\\n/g, '\n'), // Ensure private key newlines are actual newlines for the SDK
};

if (!admin.apps.length) {
  try {
    console.log("No existing Firebase app found, attempting to initialize with transformed (camelCase) credentials...");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountForSdk),
    });
    console.log("✅ Firebase Admin SDK initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON environment variable!");
  } catch (error: any) {
    let detailedErrorMessage = `FATAL ERROR: Firebase Admin SDK initializeApp failed. Raw Error Name: ${error.name}, Message: ${error.message}.`;
    if (error.message && (error.message.toLowerCase().includes("privatekey") || error.message.toLowerCase().includes("private_key"))) {
        detailedErrorMessage += " This often indicates an issue with the format of 'private_key' (e.g., newlines not properly escaped as \\\\n in the .env file, or the key itself is malformed even after transformation).";
    } else if (error.code === 'app/invalid-credential' || (error.errorInfo && error.errorInfo.code === 'auth/invalid-credential')) {
        detailedErrorMessage += " The credential object itself is invalid. Double-check all fields in your service account JSON, especially project_id and client_email after transformation.";
    }
    console.error(detailedErrorMessage);
    if (error.stack) {
        console.error("Error Stack:", error.stack);
    }
    console.error("Service account object passed to admin.credential.cert() (camelCase, excluding privateKey):", { ...serviceAccountForSdk, privateKey: "[REDACTED FOR LOGGING]"});
    throw new Error(detailedErrorMessage);
  }
} else {
  console.log("Firebase Admin SDK already initialized. Reusing existing instance.");
}

export const adminDb = admin.firestore();
console.log("Firebase Admin SDK setup complete. adminDb exported.");
