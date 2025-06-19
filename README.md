
# AI幹事くん

## リポジトリ概要

このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターです。
AIと Google Places API を組み合わせ、ユーザーの希望条件に合致するレストランの検索・分析・推薦を行う「AI幹事くん」アプリケーションのバックエンドおよびフロントエンドを提供します。

---

## システムアーキテクチャ

### 1. 主要コンポーネントと役割

```mermaid
graph TD
    A[ユーザー] --> B(ブラウザ - Next.js フロントエンド)
    B --> C{Next.js サーバーアクション};
    C --> D[Google Places API];
    C --> E[Genkit AI フロー];
    D --> C;
    E --> C;
    C --> F(Firestore - キャッシュ/データストア);
    F --> C;
    G[Google Cloud Secret Manager] -.-> H(Firebase App Hosting 環境);
    H -.-> C;

    subgraph "開発環境"
        I[.env.local] -.-> C
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#ccf,stroke:#333,stroke-width:2px
    style D fill:#cfc,stroke:#333,stroke-width:2px
    style E fill:#ffc,stroke:#333,stroke-width:2px
    style F fill:#fcc,stroke:#333,stroke-width:2px
    style G fill:#eef,stroke:#333,stroke-width:2px
    style H fill:#dde,stroke:#333,stroke-width:2px
    style I fill:#eee,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5
```

*   **ブラウザ (Next.js フロントエンド):** ユーザーインターフェースを提供し、ユーザーからの検索条件を受け付け、結果を表示します。
*   **Next.js サーバーアクション:** フロントエンドからのリクエストを処理し、Google Places API や Genkit AI フローを呼び出し、ビジネスロジックを実行します。
*   **Google Places API:** レストランの検索、詳細情報取得、写真URL取得など、店舗情報を提供します。
*   **Genkit AI フロー:** LLM (Gemini) を利用して、レストランのレビュー分析、ユーザーの嗜好に合わせたフィルタリング、推薦理由の生成など、AIによる高度な処理を行います。
*   **Firestore:** Google Places APIから取得した店舗詳細情報をキャッシュし、API呼び出し回数を削減します。将来的には予約情報などの永続化にも利用可能です。
*   **Google Cloud Secret Manager:** 本番環境 (Firebase App Hosting) で使用するAPIキーや認証情報などの機密情報を安全に保管します。
*   **Firebase App Hosting 環境:** アプリケーションがデプロイされ、実行されるサーバー環境。`apphosting.yaml` を通じて Secret Manager から環境変数を読み込みます。
*   **.env.local:** ローカル開発環境でのみ使用される環境変数ファイル。

### 2. レストラン推薦処理フロー

以下は、ユーザーがレストランを検索する際のシステムの主要な処理の流れを示すシーケンス図です。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ (フロントエンド)
    participant ServerAction as Next.jsサーバーアクション
    participant PlacesAPI as Google Places API
    participant GenkitFilter as Genkit AI (一次フィルタリング)
    participant Firestore as Firestore (キャッシュ)
    participant GenkitSelect as Genkit AI (最終選定・分析)

    User->>Browser: 1. 検索条件入力 & 送信
    Browser->>ServerAction: 2. getRestaurantSuggestion(条件)

    ServerAction->>PlacesAPI: 3. textSearchNew(条件) - 料理・場所・個室有無で検索
    PlacesAPI-->>ServerAction: 4. レストラン候補リスト (ID, 名前, レビュー概要)

    ServerAction->>GenkitFilter: 5. filterRestaurantsForGroup(候補リスト, 条件) - レビュー概要と条件で絞り込み
    GenkitFilter-->>ServerAction: 6. フィルタリングされたレストランIDリスト (最大5件)

    loop 各フィルタリングされたID
        ServerAction->>Firestore: 7a. IDでキャッシュ確認 (shinjuku-places)
        alt キャッシュヒット
            Firestore-->>ServerAction: 7b. キャッシュされた店舗詳細情報
        else キャッシュミス
            ServerAction->>PlacesAPI: 7c. getRestaurantDetails(ID) - 詳細情報取得
            PlacesAPI-->>ServerAction: 7d. 店舗詳細情報 (レビュー本文含む)
            ServerAction->>Firestore: 7e. 店舗詳細情報をキャッシュ保存
        end
    end
    ServerAction-->>ServerAction: 8. 詳細情報収集完了

    ServerAction->>GenkitSelect: 9. selectAndAnalyzeBestRestaurants(収集した詳細情報, 条件)
    GenkitSelect-->>GenkitSelect: 10. 推薦ロジック実行 & 各店舗レビュー分析 (analyzeRestaurantReviews呼び出し)
    GenkitSelect-->>ServerAction: 11. 最終推薦レストランリスト (最大3件、推薦理由、分析結果含む)

    loop 各最終推薦レストラン
        ServerAction->>PlacesAPI: 12. getRestaurantPhotoUrl(ID) - 写真URL取得
        PlacesAPI-->>ServerAction: 13. 写真URL
    end
    ServerAction-->>Browser: 14. 最終推薦結果 (店舗情報、推薦理由、分析結果、写真URL)
    Browser->>User: 15. 結果表示
```

**フロー解説:**

1.  **ユーザー**がブラウザで検索条件（日付、時間、予算、料理の種類、場所、個室希望の有無など）を入力し、送信します。
2.  **ブラウザ (フロントエンド)** は、入力された条件をNext.jsサーバーアクション `getRestaurantSuggestion` に渡します。
3.  **Next.jsサーバーアクション**は、まずGoogle Places APIの`textSearchNew`を呼び出し、条件（料理、場所、個室希望）に合うレストランの候補リスト（ID、名前、レビュー概要）を取得します。
4.  取得した候補リストとユーザーの条件を**Genkit AIフロー (`filterRestaurantsForGroup`)** に渡し、レビュー概要や個室希望などを考慮してグループ利用に適したレストランを最大5件まで絞り込み、そのIDリストを受け取ります。
5.  絞り込まれた各レストランIDについて、まず**Firestore**の`shinjuku-places`コレクションでキャッシュされた店舗詳細情報がないか確認します。
    *   キャッシュがあればそれを使用します。
    *   キャッシュがなければ、Google Places APIの`getRestaurantDetails`を呼び出して詳細情報（レビュー本文含む）を取得し、Firestoreにキャッシュとして保存します。
6.  収集した全候補の詳細情報とユーザーの条件を、別の**Genkit AIフロー (`selectAndAnalyzeBestRestaurants`)** に渡します。
7.  このフロー内で、最終的なおすすめレストラン最大3件が選定され、各レストランの推薦理由が生成されます。また、内部で `analyzeRestaurantReviews` フローが呼び出され、各レストランのレビュー（料理、サービス、雰囲気、グループ利用体験、幹事向けチェックポイント）が詳細に分析されます。
8.  選定された最大3件のレストランについて、Google Places APIの`getRestaurantPhotoUrl`を呼び出して写真URLを取得します。
9.  最後に、すべての情報（店舗情報、推薦理由、レビュー分析結果、写真URL）を整形し、**ブラウザ (フロントエンド)** に返却します。
10. **ブラウザ (フロントエンド)** は受け取った情報を画面に表示します。

---

## ディレクトリ構成

- `src/`
  - `app/` … Next.js App Router。ページ、レイアウト、サーバーアクション (`actions.ts`)
  - `components/` … UI コンポーネント (Shadcn UI ベース)
    - `layout/` … アプリケーション全体のレイアウト関連コンポーネント
    - `ui/` … Shadcn UI によって自動生成される基本UIコンポーネント
  - `hooks/` … React カスタムフック (例: `useToast.ts`, `use-mobile.ts`)
  - `lib/` … 共有ユーティリティ、Firebase 設定 (`firebase.ts`, `firebase-admin.ts`)、Zod スキーマ (`schemas.ts`)
  - `services/` … 外部サービス連携 (例: `google-places-service.ts`)
  - `ai/` … Genkit を用いた AI フローと設定
    - `flows/` … 各AI処理のフロー定義ファイル
    - `genkit.ts` … Genkit の初期化・設定
    - `dev.ts` … Genkit UI 開発サーバー用のエントリーポイント
- `docs/` … ドキュメント関連 (例: `PROMPTS.md`)
- `public/` … 静的ファイル
- `.env.local` … ローカル開発用の環境変数ファイル (Git管理外)
- `apphosting.yaml` … Firebase App Hosting の設定ファイル (環境変数参照など)
- `next.config.ts` … Next.js の設定ファイル
- `tailwind.config.ts` … Tailwind CSS の設定ファイル
- `tsconfig.json` … TypeScript の設定ファイル
- `package.json` … プロジェクトの依存関係とスクリプト

---

## 主要ファイル

- **フロントエンド & フォーム処理:**
    - `src/app/page.tsx`: メインページ。レストラン検索フォーム (`RestaurantFinder`) を表示。
    - `src/components/restaurant-finder.tsx`: 検索条件入力フォームのUIとロジック。`getRestaurantSuggestion` サーバーアクションを呼び出す。
    - `src/components/restaurant-info-card.tsx`: 推薦されたレストラン情報を表示するカードコンポーネント。
    - `src/components/preference-display-card.tsx`: ユーザーが入力した検索条件を表示するカード。
- **サーバーアクション (バックエンドロジック):**
    - `src/app/actions.ts`: `getRestaurantSuggestion` 関数。Google Places API と AI フローを連携させ、最終的な推薦結果を生成するコアロジック。
- **外部サービス連携:**
    - `src/services/google-places-service.ts`: Google Places API (Text Search, Place Details, Place Photos) を呼び出すためのラッパー関数群。
- **AIフロー (Genkit):**
    - `src/ai/flows/filter-restaurants.ts`: Places APIの検索結果をレビュー概要に基づいて一次フィルタリングするフロー。
    - `src/ai/flows/select-and-analyze.ts`: 詳細情報に基づいて最終的な推薦候補3件を選定し、推薦理由とレビュー分析を行うフロー。
    - `src/ai/flows/analyze-restaurant-reviews.ts`: 個別のレストランレビューを詳細に分析するフロー（`select-and-analyze` から呼び出される）。
    - `src/ai/genkit.ts`: Genkitプラグイン（Google AI）の初期化と設定。
- **Firebase 設定:**
    - `src/lib/firebase.ts`: Firebase Client SDK の初期化。
    - `src/lib/firebase-admin.ts`: Firebase Admin SDK の初期化（3変数方式の環境変数を使用）。Firestore (`adminDb`) インスタンスを提供。
- **スキーマ定義:**
    - `src/lib/schemas.ts`: アプリケーション全体で使用するデータ構造 (レストラン検索条件、AIの出力など) を Zod スキーマで定義。

---

## 開発のポイント

### 環境変数の設定

#### ローカル開発環境 (`.env.local`)

ローカルでの開発時には、プロジェクトのルートに`.env.local`ファイルを作成し、以下の環境変数を設定します。このファイルは `.gitignore` によりリポジトリにはコミットされません。

- **Firebase Admin SDK用 (3変数方式):** (`src/lib/firebase-admin.ts` で使用)
    - `FIREBASE_PROJECT_ID`: あなたの Firebase プロジェクトID
    - `FIREBASE_CLIENT_EMAIL`: あなたのサービスアカウントのクライアントメールアドレス
    - `FIREBASE_PRIVATE_KEY`: あなたのサービスアカウントの秘密鍵。秘密鍵の改行は `\n` として文字列内に含めてください (例: `"-----BEGIN PRIVATE KEY-----\nYOUR_KEY_LINE_1\nYOUR_KEY_LINE_2\n-----END PRIVATE KEY-----\n"`)。必ずダブルクォーテーションで囲ってください。

- **Firebase Client SDK用:** (`src/lib/firebase.ts` で使用。これらはブラウザからもアクセスされるため `NEXT_PUBLIC_` が必要です)
    - `NEXT_PUBLIC_FIREBASE_API_KEY`
    - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
    - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
    - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
    - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
    - `NEXT_PUBLIC_FIREBASE_APP_ID`

- **Google Places API用 (サーバーサイド):** (`src/services/google-places-service.ts` で使用)
    - `GOOGLE_PLACES_API_KEY`: あなたの Google Places API キー

- **Gemini API用 (サーバーサイド):** (Genkitが使用)
    - `GEMINI_API_KEY`: あなたの Gemini API キー

ローカル開発では、これらの値を`.env.local`に直接記述します。設定後、`npm run dev`で開発サーバを起動すると自動で読み込まれます。

#### Firebase App Hosting 環境 (本番/プレビュー)

Firebase App Hosting へデプロイする際は、`.env.local` ファイルは使用されません。代わりに、環境変数は **Google Cloud Secret Manager** を介して安全に設定し、`apphosting.yaml` ファイルで参照します。

1.  **Google Cloud Secret Manager にシークレットを作成:**
    Firebase プロジェクトに関連付けられた Google Cloud プロジェクトの Secret Manager で、以下の名前でシークレットを作成し、それぞれの値を設定します。（シークレット名は `apphosting.yaml` の `secretEnvironmentVariables` の `secret` フィールドと一致させます。）
    *   `FIREBASE_PROJECT_ID`: (値: あなたの Firebase プロジェクトID)
    *   `FIREBASE_CLIENT_EMAIL`: (値: あなたのサービスアカウントのクライアントメール)
    *   `FIREBASE_PRIVATE_KEY`: (値: サービスアカウントの秘密鍵文字列。`.env.local` のダブルクォーテーションは含めず、`\n` は実際の改行として、`-----BEGIN PRIVATE KEY-----` から `-----END PRIVATE KEY-----\n` まで全てを「シークレットの値」フィールドに貼り付けてください。)
    *   `GOOGLE_PLACES_API_KEY`: (値: あなたの Google Places API キー)
    *   `GEMINI_API_KEY`: (値: あなたの Gemini API キー)
    *   `NEXT_PUBLIC_FIREBASE_API_KEY`
    *   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
    *   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
    *   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
    *   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
    *   `NEXT_PUBLIC_FIREBASE_APP_ID`

2.  **`apphosting.yaml` でシークレットを参照:**
    プロジェクトルートの `apphosting.yaml` ファイルに、上記で作成したシークレットを参照する設定を記述します (詳細は `apphosting.yaml` の `secretEnvironmentVariables` セクションを参照)。これにより、App Hosting のビルド時および実行時に、これらのシークレットの値が環境変数としてアプリケーションに安全に提供されます。

    **注意:** `NEXT_PUBLIC_` で始まる変数は、ビルド時にクライアントサイドのコードに埋め込まれるため、Secret Manager経由で設定する場合でもビルドプロセスからアクセス可能である必要があります。`apphosting.yaml` の `secretEnvironmentVariables` はビルド環境と実行環境の両方に変数を公開します。

### 依存関係・開発コマンド

- **通常のNext.js開発サーバ:** `npm run dev` (デフォルトポート: 9002)
- **AIフロー開発用のGenkit UI:** `npm run genkit:dev` または `npm run genkit:watch` (Genkit UI は通常 `http://localhost:4000` で起動)
- **型チェック:** `npm run typecheck`
- **ビルド:** `npm run build`
- **Next.js本番モード起動:** `npm run start`
- **Lint:** `npm run lint`

### コードスタイル

- **UI:** Tailwind CSS と Radix UI をベースにしたコンポーネント群 (Shadcn UI) を使用しています。
- **エイリアス:** `components.json` でエイリアスが定義されており、`@/components` や `@/lib/utils` などでインポートできます。TypeScriptのパスエイリアスは `tsconfig.json` の `paths` に対応しています。

---

## デプロイについて (Firebase App Hosting)

このアプリケーションは Firebase App Hosting にデプロイされることを想定しています。
デプロイ設定は `apphosting.yaml` ファイルに記述されています。
GitHub リポジトリを Firebase App Hosting に連携すると、指定したブランチへのプッシュをトリガーに自動でビルドとデプロイが実行されます。

本番環境で必要な API キーや認証情報などの機密データは、上記「Firebase App Hosting 環境」セクションで説明されている通り、Google Cloud Secret Manager に保存し、`apphosting.yaml` を介して安全にアプリケーションに提供されます。

```
