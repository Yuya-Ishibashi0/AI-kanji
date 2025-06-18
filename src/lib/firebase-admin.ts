
import * as admin from 'firebase-admin';

// 環境変数からFirebaseサービスアカウントの情報を読み込む
const projectId = process.env.FIREBASE_PROJECT_ID;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'); // 改行文字を適切に処理
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !privateKey || !clientEmail) {
  console.error('Firebase Admin SDKの初期化に必要な環境変数が設定されていません。');
  console.error('必要な環境変数: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  // アプリケーションの起動を妨げるためにエラーをスローするか、適切に処理する
  // ここではFirestoreインスタンスをエクスポートする前にエラーを示すため、
  // adminDbがundefinedになる可能性があることを示すか、あるいはエラーをスローする
  throw new Error('Firebase Admin SDKの認証情報が不足しています。');
}

const serviceAccount = {
  projectId: projectId,
  privateKey: privateKey,
  clientEmail: clientEmail,
};

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully from environment variables.");
  } catch (error) {
    console.error("Firebase Admin SDKの初期化に失敗しました:", error);
    throw error; // 初期化失敗は致命的なのでエラーをスロー
  }
}

const adminDb = admin.firestore();
export { admin, adminDb };
