
# AI幹事くん

## リポジトリ概要

このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターです。
AIと Google Places API を組み合わせ、レストラン検索・予約のデモ機能を提供します。

---

## システムアーキテクチャ

以下は、ユーザーがレストランを検索する際のシステムの主要な処理の流れを示す図です。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ (フロントエンド)
    participant Server as Next.jsサーバー (アクション)
    participant PlacesAPI as Google Places API
    participant GenkitAI as Genkit AIフロー

    User->>Browser: 1. 検索条件入力 & 送信
    Browser->>Server: 2. getRestaurantSuggestion(条件)
    Server->>PlacesAPI: 3. textSearchNew(条件)
    PlacesAPI-->>Server: 4. レストラン候補リスト
    Server->>GenkitAI: 5. filterRestaurantsForGroup(候補, 条件)
    GenkitAI-->>Server: 6. フィルタリングされたIDリスト
    Server->>PlacesAPI: 7. getRestaurantDetails(ID) [並列]
    PlacesAPI-->>Server: 8. レストラン詳細情報 [複数]
    Server->>GenkitAI: 9. selectAndAnalyzeBestRestaurants(詳細情報, 条件)
    GenkitAI-->>Server: 10. 推薦結果3件 (分析・推薦文)
    Server->>PlacesAPI: 11. getRestaurantPhotoUrl(ID) [並列]
    PlacesAPI-->>Server: 12. 写真URL [3件分]
    Server-->>Browser: 13. 最終推薦結果 (写真付き)
    Browser->>User: 14. 結果表示
```

### 解説

1.  **ユーザー**がブラウザで検索条件を入力し、送信します。
2.  **ブラウザ (フロントエンド)** は、入力された条件をNext.jsサーバーのサーバーアクション `getRestaurantSuggestion` に渡します。
3.  **Next.jsサーバー**は、まずGoogle Places API (`textSearchNew`) を呼び出し、条件に合うレストランの候補リストを取得します。
4.  取得した候補リストとユーザーの条件を**Genkit AIフロー** (`filterRestaurantsForGroup`) に渡し、レビュー内容などからグループ利用に適したレストランを絞り込みます（IDリストとして結果を受け取ります）。
5.  絞り込まれたレストランのIDを使い、再度**Google Places API** (`getRestaurantDetails`) で各レストランの詳細情報を取得します（写真情報を除く）。
6.  詳細情報とユーザーの条件を別の**Genkit AIフロー** (`selectAndAnalyzeBestRestaurants`) に渡し、最終的なおすすめレストラン3件を選定させ、各レストランの推薦理由とレビュー分析を生成させます。
7.  選定された3件のレストランについて、**Google Places API** (`getRestaurantPhotoUrl`) を呼び出して写真URLを取得します。
8.  最後に、すべての情報（推薦文、分析、写真URLなど）を整形し、**ブラウザ (フロントエンド)** に返却します。
9.  **ブラウザ (フロントエンド)** は受け取った情報を画面に表示します。

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

