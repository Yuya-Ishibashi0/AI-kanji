
import admin, { type ServiceAccount } from "firebase-admin";

// Initialize adminDb with a type that allows it to be undefined initially
let adminDb: admin.firestore.Firestore | undefined = undefined;

try {
  console.log("Attempting to initialize Firebase Admin SDK...");

  const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJsonString) {
    const errorMessage = "FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is NOT SET. Please check your .env.local file and ensure it contains the correctly formatted JSON string for your service account.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  console.log("FIREBASE_SERVICE_ACCOUNT_JSON environment variable is present.");

  let parsedServiceAccount: ServiceAccount;
  try {
    // Attempt to parse the JSON string
    const tempParsed = JSON.parse(serviceAccountJsonString);
    // Basic check to see if it's an object
    if (typeof tempParsed !== 'object' || tempParsed === null) {
        throw new Error("Parsed content is not an object.");
    }
    parsedServiceAccount = tempParsed as ServiceAccount;

  } catch (e: any) {
    const errorMessage = `FATAL ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. It's not a valid JSON string or not an object. Ensure it's a single line in your .env.local file, and all special characters (like newlines in private_key) are properly escaped (e.g., '\\\\n'). Raw Error: ${e.message}`;
    console.error(errorMessage);
    console.error("Offending string (first 100 chars):", serviceAccountJsonString.substring(0, 100));
    throw new Error(errorMessage);
  }
  console.log("Successfully parsed FIREBASE_SERVICE_ACCOUNT_JSON.");

  // Validate essential fields after parsing
  const { project_id, private_key, client_email } = parsedServiceAccount;

  if (!project_id || typeof project_id !== 'string') {
    const errorMessage = "FATAL ERROR: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing 'project_id' or it's not a string. Check your .env.local file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (!private_key || typeof private_key !== 'string') {
    const errorMessage = "FATAL ERROR: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing 'private_key' or it's not a string. Ensure private_key newlines are escaped as '\\\\n' within the JSON string in .env.local.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (!client_email || typeof client_email !== 'string') {
    const errorMessage = "FATAL ERROR: Parsed FIREBASE_SERVICE_ACCOUNT_JSON is missing 'client_email' or it's not a string. Check your .env.local file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  console.log(`Parsed service account details: project_id='${project_id}', client_email='${client_email}'. Looks valid so far.`);

  if (!admin.apps.length) {
    try {
      console.log("No existing Firebase app found. Initializing new Firebase app...");
      admin.initializeApp({
        credential: admin.credential.cert(parsedServiceAccount),
      });
      adminDb = admin.firestore();
      console.log("Firebase Admin SDK initialized successfully and Firestore instance obtained.");
    } catch (initError: any) {
      const errorMessage = `FATAL ERROR: Firebase Admin SDK admin.initializeApp() FAILED. This often means the service account JSON (even if parsed) has an issue (e.g., invalid private_key format after escaping, incorrect project_id). Please meticulously check the FIREBASE_SERVICE_ACCOUNT_JSON in your .env.local file. Raw Error: ${initError.message} ${initError.stack ? initError.stack : ''}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  } else {
    console.log("Existing Firebase app found. Using its Firestore instance.");
    adminDb = admin.apps[0].firestore(); // Get firestore from existing app
  }

  if (!adminDb) {
    // This case should ideally not be reached if errors are thrown above.
    const errorMessage = "FATAL ERROR: adminDb is still undefined after initialization attempts. This is an unexpected state.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

} catch (error) {
  console.error("CRITICAL FAILURE IN firebase-admin.ts SETUP:", error instanceof Error ? error.message : String(error));
  // Throw a new error to ensure the module loading fails clearly.
  // The fact that adminDb might be undefined will cause errors downstream when it's used.
  throw new Error(`Firebase Admin SDK setup failed. Check server logs in your Firebase Studio TERMINAL for 'FATAL ERROR' or 'CRITICAL FAILURE' messages. Primary cause: ${error instanceof Error ? error.message : String(error)}`);
}

// Export adminDb. If initialization failed and an error was thrown, this export
// will effectively export 'undefined' or the module load will have failed.
export { adminDb };
