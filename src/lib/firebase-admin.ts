
import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";

// アプリがすでに初期化されている場合に、再度初期化しないための安全装置
if (!admin.apps.length) {
  // 環境変数から認証情報を取得し、SDKが要求する形式のオブジェクトを作成
  // ▼▼▼ データベースの場所は、この FIREBASE_PROJECT_ID 環境変数で決まります ▼▼▼
  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // privateKeyの改行コード `\n` が文字列 `\\n` として扱われる場合に対応
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  try {
    // Admin SDKを初期化
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully.");

    // Firestoreの設定でundefinedのプロパティを無視するようにする
    admin.firestore().settings({
      ignoreUndefinedProperties: true,
    });
    console.log("Firestore ignoreUndefinedProperties set to true.");

  } catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
    // 本番環境では、初期化の失敗は致命的なエラーとして扱う
  }
}

// 初期化されたFirestoreインスタンスをエクスポート
export const adminDb = admin.firestore();
