リポジトリ概要
このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターです。
AIと Google Places API を組み合わせ、レストラン検索・予約のデモ機能を提供します。

ディレクトリ構成
src/
├── app/           … ページ・レイアウト・サーバアクション
├── components/    … UI コンポーネント
├── hooks/         … React カスタムフック
├── lib/           … 共有ユーティリティや Firebase 設定
├── services/      … Google Places API など外部サービス連携
└── ai/            … Genkit を用いた AI フロー

主要ファイル
src/app/page.tsx – フロントページ。ヘッダーとレストラン検索フォームを表示

src/app/actions.ts – Google Places API と AI フローを呼び出し、推薦結果を返すサーバアクション

src/services/google-places-service.ts – Google Places API をラップしたユーティリティ

src/ai/flows/* – Genkit で定義した AI フロー。例: レビュー分析やレストラン推薦

ドキュメント
docs/blueprint.md にアプリのコンセプトやスタイル指針がまとまっています。

開発のポイント
環境変数の設定

Firebase (NEXT_PUBLIC_FIREBASE_*) と Google Places API (GOOGLE_PLACES_API_KEY) のキーが必須です。

.env などに保存し、npm run dev で読み込むようにします。

依存関係・開発コマンド

通常の Next.js 開発サーバ: npm run dev

AI フロー開発用の Genkit: npm run genkit:dev または npm run genkit:watch

型チェック: npm run typecheck

ビルド: npm run build

コードスタイル

Tailwind CSS と Radix UI をベースにしたコンポーネント群 (Shadcn UI)。

components.json でエイリアスが定義されており、@/components や @/lib/utils などで import できます。

TypeScript のパスエイリアスは tsconfig の @/* に対応。

学習の指針

src/app/restaurant-finder.tsx を読むことでフォーム処理やサーバアクションの呼び出し方を理解できます。

AI フロー (src/ai/flows) は Genkit の例としてシンプルに書かれているため、独自の AI 連携を追加する際の参考になります。

Firebase や Google Places API のレスポンス処理は src/services/google-places-service.ts を参照してください。

今後学ぶとよいこと
Next.js のサーバアクション/サーバコンポーネント
実装の多くはサーバ上で動作します。データ取得や外部 API との連携方法を理解しておくと拡張しやすいです。

Genkit (AI フロー)
src/ai 配下のフロー定義や dev.ts の起動方法から、AI 連携の仕組みを学びましょう。

Firebase + App Hosting
firebase.ts や apphosting.yaml を読むことで Firebase App Hosting へのデプロイや Firestore 利用方法がわかります。

