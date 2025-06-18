
import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

// Log entry point
console.log("Attempting to initialize Firebase Admin SDK...");

const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJsonString) {
  const errorMessage = "CRITICAL FAILURE: The FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. This variable must contain the entire service account JSON key as a single string. Please check your .env.local file.";
  console.error(errorMessage);
  throw new Error(errorMessage); // This will cause an Internal Server Error if var is missing
}

console.log("FIREBASE_SERVICE_ACCOUNT_JSON environment variable found (length:", serviceAccountJsonString.length, ").");

let serviceAccount: ServiceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJsonString);
  console.log("Successfully parsed FIREBASE_SERVICE_ACCOUNT_JSON string.");
} catch (error) {
  const errorMessage = `CRITICAL FAILURE: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. It does not appear to be valid JSON. Please ensure it's a correctly formatted JSON string, with private key newlines escaped as \\\\n. Raw Error: ${error instanceof Error ? error.message : String(error)}`;
  console.error(errorMessage);
  console.error("Received string was (first 100 chars, then last 100 chars if long):");
  if (serviceAccountJsonString.length <= 200) {
    console.error(serviceAccountJsonString);
  } else {
    console.error(serviceAccountJsonString.substring(0, 100) + "..." + serviceAccountJsonString.substring(serviceAccountJsonString.length - 100));
  }
  throw new Error(errorMessage); // This will cause an Internal Server Error if JSON is invalid
}

// Extra check: ensure serviceAccount is an object
if (typeof serviceAccount !== 'object' || serviceAccount === null) {
    const errorMessage = `CRITICAL FAILURE: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is not an object. Received: ${JSON.stringify(serviceAccount)}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}


const requiredKeys: (keyof ServiceAccount)[] = ['project_id', 'private_key', 'client_email'];
const missingKeys = requiredKeys.filter(key => !(key in serviceAccount) || !serviceAccount[key]);

if (missingKeys.length > 0) {
  const errorMessage = `CRITICAL FAILURE: The parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing or has empty values for the following required keys: ${missingKeys.join(', ')}. Please ensure your service account JSON is complete and correct.`;
  console.error(errorMessage);
  console.error("Parsed service account object (excluding private_key for brevity):", { ...serviceAccount, private_key: serviceAccount.private_key ? "[REDACTED - present but not checked for validity here]" : "MISSING/EMPTY" });
  throw new Error(errorMessage); // This will cause an Internal Server Error
}

console.log("Parsed FIREBASE_SERVICE_ACCOUNT_JSON contains all required top-level keys (project_id, private_key, client_email).");

// Validate private_key specifically for common issues
if (typeof serviceAccount.private_key !== 'string') {
    const warningMessage = "WARNING: The 'private_key' in FIREBASE_SERVICE_ACCOUNT_JSON is not a string. This is highly likely to cause initialization failure.";
    console.warn(warningMessage);
    // Potentially throw new Error(warningMessage) here if you want to be stricter
} else if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----') || !serviceAccount.private_key.includes('-----END PRIVATE KEY-----')) {
    console.warn("WARNING: The 'private_key' in FIREBASE_SERVICE_ACCOUNT_JSON does not look like a complete PEM key (missing BEGIN/END markers). Ensure it's the full key string.");
} else if (serviceAccount.private_key.includes('\n') && !serviceAccount.private_key.includes('\\n')) {
    console.warn("WARNING: The 'private_key' string in FIREBASE_SERVICE_ACCOUNT_JSON contains literal newlines (a direct line break in the string value) but NOT escaped newlines (\\\\n). For a JSON string value, newlines in the private key MUST be represented as \\\\n. For example: \"private_key\": \"-----BEGIN PRIVATE KEY-----\\\\nYOUR_KEY_PART_1\\\\nYOUR_KEY_PART_2\\\\n-----END PRIVATE KEY-----\\\\n\". This is a common cause of parsing or initialization failure.");
}


if (!admin.apps.length) {
  try {
    console.log("No existing Firebase app found, attempting to initialize a new one with parsed service account...");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
  } catch (error) {
    const errorMessage = `FATAL ERROR: Firebase Admin SDK initialization (admin.initializeApp) failed.
    This often means the service account credentials, while parsed, are considered invalid by the SDK, or there's a network issue.
    Please meticulously double-check the content of FIREBASE_SERVICE_ACCOUNT_JSON in your .env.local file.
    Key things to verify:
    1. The entire JSON content is a single string value assigned to FIREBASE_SERVICE_ACCOUNT_JSON.
       Example: FIREBASE_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'
    2. Within that JSON string, the 'private_key' field's value must have its internal newlines escaped as \\\\n.
       Example for the private_key field: "private_key": "-----BEGIN PRIVATE KEY-----\\\\nYOUR_KEY_LINE_1\\\\nYOUR_KEY_LINE_2\\\\n-----END PRIVATE KEY-----\\\\n"
    3. All other values (project_id, client_email etc.) in the JSON are correct.
    Raw Error from initializeApp: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    if (error instanceof Error && error.stack) {
        console.error("Error stack from initializeApp:", error.stack);
    }
    throw new Error(errorMessage); // This will cause an Internal Server Error
  }
} else {
  console.log("Firebase Admin SDK already initialized.");
}

export const adminDb = admin.firestore();
console.log("Firebase Admin SDK setup complete. adminDb exported.");
