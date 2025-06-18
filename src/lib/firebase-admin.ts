
import * as admin from 'firebase-admin';

// Read the service account JSON from an environment variable
const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJsonString) {
  console.error('Firebase Admin SDKの初期化に必要な環境変数 FIREBASE_SERVICE_ACCOUNT_JSON が設定されていません。');
  console.error('この環境変数には、サービスアカウントキーJSONファイルの内容を文字列として設定してください。');
  throw new Error('Firebase Admin SDKの認証情報が不足しています。FIREBASE_SERVICE_ACCOUNT_JSON が見つかりません。');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJsonString);
} catch (error) {
  console.error('環境変数 FIREBASE_SERVICE_ACCOUNT_JSON の内容をJSONとしてパースできませんでした。');
  console.error('JSONの形式が正しいか、特に改行文字(\'\\n\')が適切にエスケープされているか確認してください。');
  console.error('パースエラー:', error);
  throw new Error('Firebase Admin SDKの認証情報が無効です。FIREBASE_SERVICE_ACCOUNT_JSON のパースに失敗しました。');
}

// Validate essential fields after parsing
if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    console.error('パースされた FIREBASE_SERVICE_ACCOUNT_JSON に必要なフィールド (project_id, private_key, client_email) が不足しています。');
    throw new Error('Firebase Admin SDKの認証情報に必要なフィールドが不足しています。');
}


if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully from FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
  } catch (error) {
    console.error("Firebase Admin SDKの初期化に失敗しました:", error);
    console.error("エラー詳細:", error);
    throw error; // Initialization failure is critical
  }
}

const adminDb = admin.firestore();
export { admin, adminDb };
