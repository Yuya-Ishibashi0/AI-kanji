
import admin from "firebase-admin";
import type { ServiceAccount as FirebaseAdminServiceAccountType } from "firebase-admin";

console.log("Attempting to initialize Firebase Admin SDK using 3-variable method from .env.local...");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyFromEnv = process.env.FIREBASE_PRIVATE_KEY;

let criticalError = false;
const detailedErrorMessages: string[] = [];

if (!projectId) {
    const msg = "CRITICAL FAILURE: Environment variable FIREBASE_PROJECT_ID is not set. This is required for Firebase Admin SDK initialization using the 3-variable method. Please check your .env.local file.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("FIREBASE_PROJECT_ID environment variable found.");
}

if (!clientEmail) {
    const msg = "CRITICAL FAILURE: Environment variable FIREBASE_CLIENT_EMAIL is not set. This is required for Firebase Admin SDK initialization using the 3-variable method. Please check your .env.local file.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("FIREBASE_CLIENT_EMAIL environment variable found.");
}

if (!privateKeyFromEnv) {
    const msg = "CRITICAL FAILURE: Environment variable FIREBASE_PRIVATE_KEY is not set. This is required for Firebase Admin SDK initialization using the 3-variable method. Please check your .env.local file.";
    console.error(msg);
    detailedErrorMessages.push(msg);
    criticalError = true;
} else {
    console.log("FIREBASE_PRIVATE_KEY environment variable found (content not logged for security).");
}

if (criticalError) {
    const finalErrorMessage = `CRITICAL FAILURE: One or more required Firebase Admin environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing. Details: ${detailedErrorMessages.join('; ')}`;
    // This error will be thrown and should appear in server logs if this script is loaded during startup.
    // If loaded lazily (e.g., in a server action), it might manifest as an Internal Server Error to the client.
    console.error("THROWING ERROR:", finalErrorMessage);
    throw new Error(finalErrorMessage);
}

const formattedPrivateKey = privateKeyFromEnv?.replace(/\\n/g, '\n');

if (!formattedPrivateKey || typeof formattedPrivateKey !== 'string' || !formattedPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----') || !formattedPrivateKey.endsWith('-----END PRIVATE KEY-----\n')) {
    const msg = `CRITICAL FAILURE: The FIREBASE_PRIVATE_KEY environment variable content appears to be malformed or not a valid private key string. It must start with '-----BEGIN PRIVATE KEY-----' and end with '-----END PRIVATE KEY-----\\n', with actual newlines represented as '\\n' in the .env.local file. Ensure the .env.local value for FIREBASE_PRIVATE_KEY is enclosed in double quotes if it contains special characters, and all internal newlines are '\\n'. Current (obfuscated) start: ${formattedPrivateKey?.substring(0,20)}... Current (obfuscated) end: ...${formattedPrivateKey?.slice(-20)}`;
    console.error(msg);
    detailedErrorMessages.push(msg);
    // This error will be thrown.
    console.error("THROWING ERROR:", msg);
    throw new Error(msg);
}

const serviceAccountForSdk: FirebaseAdminServiceAccountType = {
  projectId: projectId!,
  clientEmail: clientEmail!,
  privateKey: formattedPrivateKey!,
};

if (!admin.apps.length) {
  try {
    console.log("No existing Firebase app found, attempting to initialize with credentials from 3 environment variables...");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountForSdk),
    });
    console.log("✅ Firebase Admin SDK initialized successfully using 3 environment variables from .env.local!");
  } catch (error: any) {
    let sdkInitErrorMessage = `FATAL ERROR: Firebase Admin SDK initializeApp failed when using 3-variable method. Raw Error Name: ${error.name}, Message: ${error.message}.`;
    if (error.message && (error.message.toLowerCase().includes("privatekey") || error.message.toLowerCase().includes("private_key"))) {
        sdkInitErrorMessage += " This often indicates an issue with the format or content of 'FIREBASE_PRIVATE_KEY' (e.g., newlines not properly formatted as '\\n' in the .env.local, or the key itself is malformed/corrupted).";
    } else if (error.code === 'app/invalid-credential' || (error.errorInfo && error.errorInfo.code === 'auth/invalid-credential')) {
        sdkInitErrorMessage += " The credential object itself is invalid. Double-check all three environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env.local file.";
    } else if (error.message && error.message.includes("Error: error:0909006C:PEM routines:get_name:no start line")) {
        sdkInitErrorMessage += " This specific PEM routine error strongly suggests the private key is not correctly formatted. Ensure it starts with '-----BEGIN PRIVATE KEY-----' and ends with '-----END PRIVATE KEY-----\\n' and that newlines within the key are correctly represented as '\\n' in your .env.local file string value.";
    } else {
        sdkInitErrorMessage += " This could be due to various reasons including network issues, incorrect project settings, or malformed credential data. Check the specific error message above.";
    }
    console.error(sdkInitErrorMessage);
    if (error.stack) {
        console.error("Error Stack:", error.stack);
    }
    console.error("Service account object passed to admin.credential.cert() (excluding privateKey):", { projectId: serviceAccountForSdk.projectId, clientEmail: serviceAccountForSdk.clientEmail, privateKey: "[REDACTED FOR LOGGING]"});
    // This error will be thrown.
    console.error("THROWING ERROR:", sdkInitErrorMessage);
    throw new Error(sdkInitErrorMessage);
  }
} else {
  console.log("Firebase Admin SDK already initialized (3-variable method). Reusing existing instance.");
}

export const adminDb = admin.firestore();
console.log("Firebase Admin SDK setup complete (3-variable method). adminDb exported.");
