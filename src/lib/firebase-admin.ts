
import * as admin from 'firebase-admin';

// Read the service account JSON from an environment variable
const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJsonString) {
  console.error('Firebase Admin SDKの初期化に必要な環境変数 FIREBASE_SERVICE_ACCOUNT_JSON が設定されていません。');
  console.error('この環境変数には、サービスアカウントキーJSONファイルの内容を文字列として設定してください。');
  throw new Error('Firebase Admin SDKの認証情報が不足しています。FIREBASE_SERVICE_ACCOUNT_JSON が見つかりません。');
}

let serviceAccount: admin.ServiceAccount;
try {
  const parsedJson = JSON.parse(serviceAccountJsonString);
  // Ensure it's an object and not null
  if (typeof parsedJson === 'object' && parsedJson !== null) {
    serviceAccount = parsedJson as admin.ServiceAccount;
  } else {
    // This case handles if JSON.parse results in null or a non-object (e.g., a string or number if the JSON was just "null" or "123")
    throw new Error('Parsed FIREBASE_SERVICE_ACCOUNT_JSON is not a valid object.');
  }
} catch (error: any) {
  console.error('環境変数 FIREBASE_SERVICE_ACCOUNT_JSON の内容をJSONとしてパースできませんでした。またはパース結果が期待されるオブジェクト形式ではありません。');
  console.error('JSONの形式が正しいか（例：全体が\'{\',\'}\'で囲まれ、キーがダブルクォートされているか）、特に秘密鍵内の改行文字(\'\\n\')が文字列内で適切にエスケープされているか（\'\\\\n\'）確認してください。');
  console.error('パースエラー:', error.message);
  throw new Error('Firebase Admin SDKの認証情報が無効です。FIREBASE_SERVICE_ACCOUNT_JSON のパースまたは形式検証に失敗しました。');
}

// Validate essential fields after parsing
if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    console.error('パースされた FIREBASE_SERVICE_ACCOUNT_JSON に必要なフィールド (project_id, private_key, client_email) が不足しています。');
    console.error('実際の値を確認してください: project_id=', serviceAccount.project_id, ', private_key exists=', !!serviceAccount.private_key, ', client_email=', serviceAccount.client_email);
    throw new Error('Firebase Admin SDKの認証情報に必要なフィールドが不足しています。');
}


if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
  } catch (error: any) {
    console.error("Firebase Admin SDKの初期化に失敗しました。");
    console.error("エラーメッセージ:", error.message);
    console.error("スタックトレース:", error.stack);
    // For debugging, you might want to log parts of the serviceAccount, but be careful with secrets
    // console.error("Service Account (for debugging - check structure):", { projectId: serviceAccount.project_id, clientEmail: serviceAccount.client_email, privateKeyFirstChars: serviceAccount.private_key ? serviceAccount.private_key.substring(0, 50) : "MISSING" });
    throw error; // Initialization failure is critical
  }
}

const adminDb = admin.firestore();
export { admin, adminDb };
