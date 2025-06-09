# AI幹事くん

## リポジトリ概要

このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターです。
AIと Google Places API を組み合わせ、レストラン検索・予約のデモ機能を提供します。

---

## ディレクトリ構成

- `src/`
  - `app/` … ページ・レイアウト・サーバアクション
  - `components/` … UI コンポーネント
  - `hooks/` … React カスタムフック
  - `lib/` … 共有ユーティリティや Firebase 設定
  - `services/` … Google Places API など外部サービス連携
  - `ai/` … Genkit を用いた AI フロー

---

## 主要ファイル

- `src/app/page.tsx` – フロントページ。ヘッダーとレストラン検索フォームを表示
- `src/app/actions.ts` – Google Places API と AI フローを呼び出し、推薦結果を返すサーバアクション
- `src/services/google-places-service.ts` – Google Places API をラップしたユーティリティ
- `src/ai/flows/*` – Genkit で定義した AI フロー。例: レビュー分析やレストラン推薦

---

## 開発のポイント

### 環境変数の設定

以下の3種類のAPIキーが必須です。プロジェクトのルートに`.env.local`ファイルを作成して保存してください。

- **Firebaseのキー** (`NEXT_PUBLIC_FIREBASE_*`)
- **Google Places APIのキー** (`GOOGLE_PLACES_API_KEY`)
- **Gemini APIのキー** (`GEMINI_API_KEY`)

設定後、`npm run dev`で開発サーバを起動すると自動で読み込まれます。

### 依存関係・開発コマンド

- **通常のNext.js開発サーバ:** `npm run dev`
- **AIフロー開発用のGenkit:** `npm run genkit:dev` または `npm run genkit:watch`
- **型チェック:** `npm run typecheck`
- **ビルド:** `npm run build`

### コードスタイル

- **UI:** Tailwind CSS と Radix UI をベースにしたコンポーネント群 (Shadcn UI) を使用しています。
- **エイリアス:** `components.json` でエイリアスが定義されており、`@/components` や `@/lib/utils` などでインポートできます。TypeScriptのパスエイリアスは `tsconfig.json` の `paths` に対応しています。
