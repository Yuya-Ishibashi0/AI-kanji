import admin from "firebase-admin";

// 環境変数から認証情報を取得
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// 必須の環境変数が設定されているかチェック
if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  throw new Error("Firebase Admin SDKの認証情報が環境変数に設定されていません。.env.localファイルを確認してください。");
}

// すでに初期化されている場合は、既存のインスタンスを使用する
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized.");
  } catch (error: any) {
    console.error("Firebase Admin SDK initialization error:", error.stack);
    throw new Error("Firebase Admin SDKの初期化に失敗しました。認証情報が正しいか確認してください。");
  }
}

export const adminDb = admin.firestore();