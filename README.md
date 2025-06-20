
# AI幹事くん

## リポジトリ概要

このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターです。
AIと Google Places API を組み合わせ、ユーザーの希望条件に合致するレストランの検索・分析・推薦を行う「AI幹事くん」アプリケーションのバックエンドおよびフロントエンドを提供します。

---

## システムアーキテクチャ

### 1. 主要コンポーネントと役割

```mermaid
graph TD
    User[ユーザー] --> Browser[ブラウザ (Next.js フロントエンド)]
    Browser --> ServerActions[Next.js サーバーアクション<br>(src/app/actions.ts)]
    ServerActions --> GooglePlacesAPI[Google Places API<br>(店舗検索・詳細・写真)]
    ServerActions --> GenkitFlows[Genkit AI フロー<br>(選定・分析・理由生成)]
    GooglePlacesAPI --> ServerActions
    GenkitFlows --> ServerActions
    ServerActions --> Firestore[Firestore<br>(店舗情報キャッシュ)]
    Firestore --> ServerActions
    SecretManager[Google Cloud Secret Manager<br>(APIキー等)] -.-> AppHostingEnv[Firebase App Hosting 環境]
    AppHostingEnv -.-> ServerActions

    subgraph "開発環境"
        EnvLocal[.env.local<br>(APIキー等)] -.-> ServerActions
    end

    style Browser fill:#f9f,stroke:#333,stroke-width:2px
    style ServerActions fill:#ccf,stroke:#333,stroke-width:2px
    style GooglePlacesAPI fill:#cfc,stroke:#333,stroke-width:2px
    style GenkitFlows fill:#ffc,stroke:#333,stroke-width:2px
    style Firestore fill:#fcc,stroke:#333,stroke-width:2px
    style SecretManager fill:#eef,stroke:#333,stroke-width:2px
    style AppHostingEnv fill:#dde,stroke:#333,stroke-width:2px
    style EnvLocal fill:#eee,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5
```

*   **ブラウザ (Next.js フロントエンド):** ユーザーインターフェースを提供し、ユーザーからの検索条件（利用目的含む）を受け付け、結果を表示します。「AIへの指示」関連の入力フィールドは開発環境でのみ表示されます。
*   **Next.js サーバーアクション (`src/app/actions.ts`):** フロントエンドからのリクエストを処理するコアロジック。Google Places APIの呼び出し、機械的な候補フィルタリング、Firestoreキャッシュの確認・更新、Genkit AI フローの呼び出し、最終結果の整形を行います。
*   **Google Places API:** レストランの検索 (`textSearchNew`)、詳細情報取得 (`getRestaurantDetails`)、写真URL生成 (`buildPhotoUrl`) を担当します。
*   **Genkit AI フロー (`src/ai/flows/`):** LLM (Gemini) を利用したAI処理を担当。
    *   `select-and-analyze.ts`: 詳細情報とユーザー条件（利用目的、開発環境ではカスタムペルソナ・優先順位も）に基づき、最終的な推薦レストラン（最大3件、最低1件）を選定し、推薦理由を生成します。内部で`analyze-restaurant-reviews.ts`を呼び出します。
    *   `analyze-restaurant-reviews.ts`: 個別レストランのレビューを詳細に分析し、総合評価、料理・サービス・雰囲気、グループ利用体験、幹事向けチェックポイントを抽出します。
*   **Firestore:** Google Places APIから取得した店舗詳細情報をキャッシュ（`shinjuku-places`コレクション）し、API呼び出し回数を削減します。`undefined`なプロパティは保存時に無視されます。
*   **Google Cloud Secret Manager:** 本番環境 (Firebase App Hosting) で使用するAPIキーや認証情報などの機密情報を安全に保管します。
*   **Firebase App Hosting 環境:** アプリケーションがデプロイされ、実行されるサーバー環境。`apphosting.yaml` を通じて Secret Manager から環境変数を読み込みます。
*   **.env.local:** ローカル開発環境でのみ使用される環境変数ファイル。

### 2. レストラン推薦処理フロー

ユーザーがレストランを検索する際のシステムの主要な処理の流れです。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ (フロントエンド)
    participant ServerAction as Next.jsサーバーアクション (actions.ts)
    participant PlacesAPI as Google Places API
    participant MechanicalFilter as 機械的フィルタリング (actions.ts内)
    participant Firestore as Firestore (キャッシュ)
    participant GenkitSelectAndAnalyze as Genkit AI (最終選定・分析 - select-and-analyze.ts)
    participant GenkitAnalyzeReviews as Genkit AI (レビュー詳細分析 - analyze-restaurant-reviews.ts)

    User->>Browser: 1. 検索条件入力 (利用目的含む) & 送信
    Browser->>ServerAction: 2. getRestaurantSuggestion(条件)

    ServerAction->>ServerAction: 3. 検索クエリ構築 (場所, ジャンル + "団体" "グループ" - "カウンターのみ"等)
    ServerAction->>PlacesAPI: 4. textSearchNew(構築クエリ) - 最大20件 (ID, 名前, 評価, レビュー数, タイプ, 価格帯)
    PlacesAPI-->>ServerAction: 5. レストラン候補リスト (最大20件)

    ServerAction->>MechanicalFilter: 6. 機械的フィルタリング適用
    MechanicalFilter-->>MechanicalFilter: 6a. 足切り (評価<3.7, レビュー数<30, 不適切タイプ除外)
    MechanicalFilter-->>MechanicalFilter: 6b. スコアリング (評価点, レビュー数, カテゴリ適合性)
    MechanicalFilter-->>ServerAction: 7. フィルタリング済みレストラン候補 (スコア>=60、上位最大5件)

    alt フィルタリング候補が0件の場合
        ServerAction-->>Browser: 8a. エラーメッセージ表示「フィルタリング条件に合うお店が見つかりませんでした...」
    end

    loop 各フィルタリング済み候補 (上位最大5件)
        ServerAction->>Firestore: 9a. IDでキャッシュ確認 (shinjuku-places)
        alt キャッシュヒット
            Firestore-->>ServerAction: 9b. キャッシュされた店舗詳細情報
        else キャッシュミス
            ServerAction->>PlacesAPI: 9c. getRestaurantDetails(ID) - 詳細情報取得 (レビュー本文含む)
            PlacesAPI-->>ServerAction: 9d. 店舗詳細情報
            ServerAction->>Firestore: 9e. 店舗詳細情報をキャッシュ保存 (undefined除外処理あり)
        end
    end
    ServerAction-->>ServerAction: 10. 詳細情報収集完了 (最大5件分)

    alt 詳細情報取得候補が0件の場合
        ServerAction-->>Browser: 11a. エラーメッセージ表示「候補レストランの詳細情報の取得・分析に失敗しました。」
    end

    ServerAction->>GenkitSelectAndAnalyze: 12. selectAndAnalyzeBestRestaurants(収集した詳細情報[最大5件], 条件[利用目的等、開発時カスタム指示])
    GenkitSelectAndAnalyze-->>GenkitSelectAndAnalyze: 13a. LLMがペルソナ・優先順位に基づき最大3店舗を選定 & 推薦理由生成
    loop 選定された各店舗 (最大3件)
      GenkitSelectAndAnalyze->>GenkitAnalyzeReviews: 13b. analyzeRestaurantReviews(店舗名, レビューテキスト)
      GenkitAnalyzeReviews-->>GenkitSelectAndAnalyze: 13c. 詳細レビュー分析結果
    end
    GenkitSelectAndAnalyze-->>ServerAction: 14. 最終推薦レストランリスト (最大3件、推薦理由、詳細分析結果含む)

    alt AI選定が0件の場合 (フォールバック処理)
        ServerAction->>ServerAction: 15a. 機械フィルタ済候補からスコア最上位1件を選択
        ServerAction->>GenkitAnalyzeReviews: 15b. analyzeRestaurantReviews(選択店舗名, レビューテキスト)
        GenkitAnalyzeReviews-->>ServerAction: 15c. 詳細レビュー分析結果
        ServerAction-->>ServerAction: 15d. 汎用推薦理由で1件の推薦リスト作成
    end

    loop 各最終推薦レストラン (最低1件、最大3件)
        ServerAction->>PlacesAPI: 16. buildPhotoUrl(写真名) - 写真URL取得
        PlacesAPI-->>ServerAction: 17. 写真URL
    end
    ServerAction-->>Browser: 18. 最終推薦結果 (店舗情報、推薦理由、分析結果、写真URLなど)
    Browser->>User: 19. 結果表示
```

**フロー解説:**

1.  **ユーザー**がブラウザで検索条件（利用目的、日付、時間、予算、料理の種類、場所、個室希望の有無など）を入力し、送信します。開発環境では、AIへのカスタム指示（ペルソナ、評価優先順位）も入力可能です。
2.  **ブラウザ (フロントエンド)** は、入力された条件をNext.jsサーバーアクション `getRestaurantSuggestion` に渡します。
3.  **サーバーアクション**は、ユーザー入力の「場所」「料理の種類」と、システムが自動で付加する「団体」「グループ」といったキーワード、および「カウンターのみ」などの除外キーワードを組み合わせて検索クエリを構築します。
4.  構築したクエリでGoogle Places APIの`textSearchNew`を呼び出し、レストラン候補を最大20件取得します。取得する情報は、ID、名前、評価、レビュー数、店舗タイプ、価格帯など、一次フィルタリングに必要な最小限のものです。
5.  取得した候補リストが**サーバーアクション**に返されます。
6.  **サーバーアクション内**で**機械的フィルタリング**が適用されます。
    *   6a. **足切り:** ユーザー評価が3.7未満、レビュー総数が30件未満、または明らかに団体利用に適さない業態（例：バー、ナイトクラブ）の店舗を除外します。
    *   6b. **スコアリング:** 残った候補に対して、「評価の高さ」「レビュー数の多さ」「業態の適合性（レストラン、居酒屋などは高評価）」を点数化し、合計スコアを算出します。
7.  合計スコアが60点以上の候補の中から、**スコア上位最大5件**が次のステップの対象として選ばれます。
8.  もしフィルタリングの結果、適切な候補が0件だった場合は、エラーメッセージをフロントエンドに返します。
9.  選ばれた上位最大5件の各レストランIDについて、まず**Firestore**の`shinjuku-places`コレクションでキャッシュされた店舗詳細情報がないか確認します。
    *   キャッシュがあればそれを使用します。
    *   キャッシュがなければ、Google Places APIの`getRestaurantDetails`を呼び出して詳細情報（レビュー本文含む）を取得し、Firestoreにキャッシュとして保存します。この際、`undefined`のプロパティは保存前に除去されます。
10. 最大5件分の店舗詳細情報（キャッシュまたはAPIから取得）の収集が完了します。
11. もし詳細情報を1件も取得できなかった場合は、エラーメッセージをフロントエンドに返します。
12. 収集した店舗詳細情報（最大5件）とユーザーの検索条件（利用目的、開発環境ではカスタム指示も含む）を、**Genkit AIフロー (`selectAndAnalyzeBestRestaurants`)** に渡します。
13. `selectAndAnalyzeBestRestaurants`フロー内部で以下の処理が行われます。
    *   13a. 大規模言語モデル(LLM)が、設定されたペルソナ（本番環境では固定、開発環境ではカスタム可）と評価優先順位に基づき、提供された候補の中から「利用目的」に最も適したレストランを**最大3件まで**選定し、それぞれの推薦理由を生成します。
    *   13b. 選定された各店舗について、別の**Genkit AIフロー (`analyzeRestaurantReviews`)** を呼び出し、レビューテキストを基に詳細な分析（総合的な感情、料理・サービス・雰囲気、グループ利用体験、幹事向けチェックポイント）を行います。
    *   13c. `analyzeRestaurantReviews`フローから詳細なレビュー分析結果が返されます。
14. `selectAndAnalyzeBestRestaurants`フローから、最終的な推薦レストランの情報（最大3件分の店舗ID、店名、推薦理由、詳細レビュー分析結果）が**サーバーアクション**に返されます。
15. もしAIが1件もレストランを選定しなかった場合（14の結果が空だった場合）、**フォールバック処理**が実行されます。
    *   15a. 機械的フィルタリングで選ばれた候補（ステップ7の結果）の中から、スコアが最も高かった1件を自動的に選択します。
    *   15b. その1件について、`analyzeRestaurantReviews`フローを呼び出し、詳細なレビュー分析を取得します。
    *   15c. 詳細なレビュー分析結果が返されます。
    *   15d. 汎用的な推薦理由（例：「ご希望の条件と評価の高い点から、こちらのレストランもご検討ください。」）と共に、この1件を推薦リストとして作成します。
16. こうして得られた最終推薦レストラン（最低1件、最大3件）それぞれについて、Google Places APIの`buildPhotoUrl`を呼び出して写真のURLを取得します。
17. 写真URLが**サーバーアクション**に返されます。
18. 全ての情報（店舗情報、推薦理由、レビュー分析結果、写真URL、その他店舗詳細）を整形し、**ブラウザ (フロントエンド)** に返却します。
19. **ブラウザ (フロントエンド)** は受け取った情報を画面に表示します。

---

## ディレクトリ構成

- `src/`
  - `app/` … Next.js App Router。ページ (`page.tsx`)、レイアウト (`layout.tsx`)、サーバーアクション (`actions.ts`)
  - `components/` … UI コンポーネント (Shadcn UI ベース)
    - `layout/` … アプリケーション全体のレイアウト関連コンポーネント (`app-header.tsx`)
    - `ui/` … Shadcn UI によって自動生成される基本UIコンポーネント群
    - `restaurant-finder.tsx` … メインの検索フォームと結果表示ロジック
    - `restaurant-info-card.tsx` … 推薦されたレストラン情報を表示するカード
    - `preference-display-card.tsx` … ユーザーの検索条件を表示するカード
  - `hooks/` … React カスタムフック (`use-toast.ts`, `use-mobile.ts`)
  - `lib/` … 共有ユーティリティ (`utils.ts`)、Firebase 設定 (`firebase.ts`, `firebase-admin.ts`)、Zod スキーマ (`schemas.ts`)
  - `services/` … 外部サービス連携 (`google-places-service.ts`)
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
    - `src/components/restaurant-finder.tsx`: 検索条件入力フォームのUIとロジック。「利用目的」が必須入力。開発環境ではAIペルソナ・優先順位のカスタム入力欄表示。`getRestaurantSuggestion` サーバーアクションを呼び出す。
    - `src/components/restaurant-info-card.tsx`: 推薦されたレストラン情報を表示するカードコンポーネント。住所、評価、カテゴリ、価格帯なども表示。
    - `src/components/preference-display-card.tsx`: ユーザーが入力した検索条件（「利用目的」含む）を表示するカード。
- **サーバーアクション (バックエンドロジック):**
    - `src/app/actions.ts`: `getRestaurantSuggestion` 関数。Google Places API との連携、機械的フィルタリング、Firestoreキャッシュ処理、AI フロー呼び出し、フォールバック処理、最終的な推薦結果の生成を行うコアロジック。
- **外部サービス連携:**
    - `src/services/google-places-service.ts`: Google Places API (Text Search, Place Details, Place Photos) を呼び出すためのラッパー関数群。Text Searchでは団体利用向けのキーワードを自動付与。
- **AIフロー (Genkit):**
    - `src/ai/flows/select-and-analyze.ts`: 詳細情報に基づいて最終的な推薦候補（最大3件、最低1件）を選定し、推薦理由とレビュー分析を行うフロー。利用目的や（開発時）カスタムAI指示を考慮。
    - `src/ai/flows/analyze-restaurant-reviews.ts`: 個別のレストランレビューを詳細に分析するフロー（`select-and-analyze` から呼び出される）。
    - `src/ai/flows/filter-restaurants.ts`: **(現在未使用)** 以前のAIベースの一次フィルタリングフロー。現在は `actions.ts` 内の機械的フィルタリングに置き換えられています。
    - `src/ai/genkit.ts`: Genkitプラグイン（Google AI）の初期化と設定。
- **Firebase 設定:**
    - `src/lib/firebase.ts`: Firebase Client SDK の初期化。
    - `src/lib/firebase-admin.ts`: Firebase Admin SDK の初期化（3変数方式の環境変数を使用）。Firestore (`adminDb`) インスタンスを提供。`ignoreUndefinedProperties: true` を設定。
- **スキーマ定義:**
    - `src/lib/schemas.ts`: アプリケーション全体で使用するデータ構造 (レストラン検索条件、AIの出力など) を Zod スキーマで定義。「利用目的」フィールドや、開発環境専用のカスタムAI指示フィールドを含む。

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
**注意:** デプロイ時にSecret Manager関連のエラーが発生した場合、シークレット名が正しいか、App Hostingのバックエンドサービスアカウントに必要なアクセス権（Secret Manager のシークレット アクセサーロールなど）が付与されているかを確認してください。Firebase CLIの `firebase apphosting:secrets:grantaccess SECRET_NAME --backend BACKEND_ID` コマンドも権限付与に役立ちます。

```
