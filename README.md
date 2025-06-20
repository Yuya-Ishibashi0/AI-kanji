# AI幹事くん

AIとGoogle Places APIを組み合わせ、ユーザーの希望条件に合致するレストランの検索・分析・推薦を行う「AI幹事くん」アプリケーションのリポジトリです。

このプロジェクトは Next.js (TypeScript) を使った Firebase Studio スターターをベースに構築されています。

---

## 1. ✨ 主な機能

- **AIによるレストラン推薦:**
  利用目的や予算、参加人数などの条件に最適なレストランをAIが提案します。
- **詳細なレビュー分析:**
  Google MapsのレビューをAIが分析し、「料理」「サービス」「雰囲気」などの項目で要約します。
- **幹事向けチェックリスト:**
  「個室の質」「店内の静かさ」「団体サービス」など、幹事が気になるポイントをAIがチェックして報告します。
- **キャッシュ機能:**
  Firestoreを利用してAPI検索結果をキャッシュし、高速な応答とAPI使用量の節約を実現します。

---

## 2. 🏛️ システムアーキテクチャ

### 全体構成図

各コンポーネントがどのように連携して動作するかを示します。

```mermaid
graph TD
    User[ユーザー] --> Browser["ブラウザ (Next.js フロントエンド)"]
    Browser --> ServerActions["Next.js サーバーアクション<br>(src/app/actions.ts)"]
    ServerActions --> GooglePlacesAPI["Google Places API<br>(店舗検索・詳細・写真)"]
    ServerActions --> GenkitFlows["Genkit AI フロー<br>(選定・分析・理由生成)"]
    GooglePlacesAPI --> ServerActions
    GenkitFlows --> ServerActions
    ServerActions --> Firestore["Firestore<br>(店舗情報キャッシュ)"]
    Firestore --> ServerActions
    SecretManager["Google Cloud Secret Manager<br>(APIキー等)"] -.-> AppHostingEnv["Firebase App Hosting 環境"]
    AppHostingEnv -.-> ServerActions

    subgraph "開発環境"
        EnvLocal[".env.local<br>(APIキー等)"] -.-> ServerActions
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

### 主要コンポーネントの役割

- **ブラウザ (Next.js フロントエンド):**
  ユーザーが検索条件を入力し、結果を閲覧するUIです。
- **Next.js サーバーアクション (`src/app/actions.ts`):**
  フロントエンドからのリクエストを受け取り、各種APIやAIフローを呼び出すコアロジックです。
- **Google Places API:**
  レストランの検索、詳細情報、写真の取得を担当します。
- **Genkit AI フロー (`src/ai/flows/`):**
  LLM (Gemini) を利用したAI処理です。候補の選定、推薦理由の生成、レビュー分析などを行います。
- **Firestore:**
  Google Places APIから取得した店舗情報をキャッシュし、API呼び出し回数を削減します。
- **Google Cloud Secret Manager / .env.local:**
  本番環境およびローカル開発環境のAPIキーなどを安全に管理します。
- **Firebase App Hosting:**
  アプリケーションの本番環境です。

---

## 3. ⚙️ レストラン推薦の処理フロー

ユーザーが検索を開始してから、おすすめのレストランが表示されるまでの処理の流れです。

### シーケンス図

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ (フロントエンド)
    participant ServerAction as Next.jsサーバーアクション
    participant PlacesAPI as Google Places API
    participant Filter as 機械的フィルタリング
    participant Firestore as Firestore (キャッシュ)
    participant GenkitAI as Genkit AI フロー

    User->>Browser: 1. 検索条件を入力して送信
    Browser->>ServerAction: 2. getRestaurantSuggestion(条件)
    ServerAction->>PlacesAPI: 3. textSearchNew(クエリ)で店舗検索
    PlacesAPI-->>ServerAction: 4. レストラン候補リスト(最大20件)
    ServerAction->>Filter: 5. 評価やレビュー数で候補を絞り込み (上位最大5件)
    Filter-->>ServerAction: フィルタリング済み候補
    
    loop 各候補
        ServerAction->>Firestore: 6. IDでキャッシュを確認
        alt キャッシュあり
            Firestore-->>ServerAction: キャッシュされた店舗情報
        else キャッシュなし
            ServerAction->>PlacesAPI: 7. getRestaurantDetails(ID)で詳細取得
            PlacesAPI-->>ServerAction: 店舗詳細情報
            ServerAction->>Firestore: 8. 詳細情報をキャッシュに保存
        end
    end

    ServerAction->>GenkitAI: 9. selectAndAnalyze (候補情報, 条件)
    GenkitAI-->>GenkitAI: 10. 利用目的に最適な店を最大3件選定
    GenkitAI-->>GenkitAI: 11. analyzeRestaurantReviewsで各店舗のレビューを詳細分析
    GenkitAI-->>ServerAction: 12. 最終推薦リスト(推薦理由、分析結果含む)
    
    alt AIが1件も選ばなかった場合
      ServerAction->>ServerAction: フォールバック処理(機械フィルタの最上位を1件選択)
    end

    loop 各最終推薦レストラン
      ServerAction->>PlacesAPI: 13. buildPhotoUrlで写真URLを取得
      PlacesAPI-->>ServerAction: 写真URL
    end
    
    ServerAction-->>Browser: 14. 最終的な推薦結果を返す
    Browser->>User: 15. 結果を表示
```

### フロー解説

1.  **検索条件の入力:** ユーザーが利用目的、場所、予算などの条件を入力します。
2.  **サーバーアクション呼び出し:** ブラウザがサーバーの`getRestaurantSuggestion`関数を呼び出します。
3.  **一次検索:** `actions.ts`はGoogle Places APIを使い、条件に合うレストランを最大20件検索します。
4.  **候補リスト取得:** Places APIからID、名前、評価、価格帯などを含むリストが返されます。
5.  **機械的フィルタリング:** 評価が低い (3.7未満)、レビューが少ない (30件未満)、または団体利用に不適切な店舗を除外し、スコアリングして上位最大5件を選びます。
6.  **キャッシュ確認:** フィルタリングされた候補について、まずFirestoreにキャッシュされた情報がないか確認します。
7.  **詳細情報取得:** キャッシュがなければ、Places APIからレビュー本文などを含む詳細な情報を取得します。
8.  **キャッシュ保存:** APIから取得した情報は、今後のためにFirestoreに保存します。
9.  **AIによる選定・分析:** 収集した最大5件の店舗情報とユーザーの利用目的をGenkit AIフロー `selectAndAnalyzeBestRestaurants` に渡します。
10. **最終候補選定:** AIが「利用目的」に最も合うレストランを最大3件まで選定し、推薦理由を生成します。
11. **レビュー詳細分析:** AIが選んだ各店舗のレビューをさらに深く分析し、幹事向けチェックポイントなどを抽出します。
12. **AIからの結果返却:** AIが選定した店舗ID、推薦理由、詳細な分析結果がサーバーアクションに返されます。
13. **写真URL取得:** 最終的に推薦する各店舗の写真URLをPlaces APIから取得します。
14. **フロントエンドへ返却:** 全ての情報を整形し、ブラウザに返します。
15. **結果表示:** ブラウザが推薦レストランの情報を画面に表示します。

---

## 4. 🚀 セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
プロジェクトルートに `.env.local` ファイルを作成し、以下の内容を記述します。このファイルはGit管理されません。

- **Firebase Admin SDK用 (`src/lib/firebase-admin.ts`)**
    - `FIREBASE_PROJECT_ID`: あなたの Firebase プロジェクトID
    - `FIREBASE_CLIENT_EMAIL`: あなたのサービスアカウントのクライアントメールアドレス
    - `FIREBASE_PRIVATE_KEY`: あなたのサービスアカウントの秘密鍵。**`\n` を実際の改行として含めず、文字列として `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` のようにダブルクォーテーションで囲んでください。**

- **Firebase Client SDK用 (`src/lib/firebase.ts`)**
    - `NEXT_PUBLIC_FIREBASE_API_KEY`
    - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
    - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
    - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
    - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
    - `NEXT_PUBLIC_FIREBASE_APP_ID`

- **Google Places API用 (`src/services/google-places-service.ts`)**
    - `GOOGLE_PLACES_API_KEY`: あなたの Google Places API キー

- **Gemini API用 (Genkitが使用)**
    - `GEMINI_API_KEY`: あなたの Gemini API キー

---

## 5. 💻 開発コマンド

- **Next.js開発サーバー:**
  ```bash
  npm run dev
  ```
  (ポート: 9002)

- **Genkit AI開発用UI:**
  ```bash
  npm run genkit:dev
  ```
  (ポート: 4000)

- **ビルド:**
  ```bash
  npm run build
  ```

- **本番モード起動:**
  ```bash
  npm run start
  ```

- **Lint:**
  ```bash
  npm run lint
  ```

- **型チェック:**
  ```bash
  npm run typecheck
  ```
---

## 6. ☁️ デプロイ (Firebase App Hosting)

このアプリケーションは Firebase App Hosting へのデプロイを想定しています。本番環境で必要なAPIキーは、`.env.local` ではなく **Google Cloud Secret Manager** を使って設定します。

設定方法は `apphosting.yaml` ファイル内の `secretEnvironmentVariables` セクションに記述されています。デプロイ時にSecret Manager関連のエラーが出た場合は、シークレット名が正しいか、サービスアカウントに適切な権限（Secret Managerのシークレットアクセサーロールなど）が付与されているかを確認してください。

---

## 7. 📁 ディレクトリ構成

- `src/`
  - `app/` … Next.js App Router。ページ (`page.tsx`)、レイアウト (`layout.tsx`)、サーバーアクション (`actions.ts`)
  - `components/` … UI コンポーネント (Shadcn UI ベース)
  - `hooks/` … React カスタムフック
  - `lib/` … 共有ユーティリティ、Firebase 設定、Zod スキーマ
  - `services/` … 外部サービス連携 (Google Places API)
  - `ai/` … Genkit を用いた AI フローと設定
- `docs/` … ドキュメント関連
- `public/` … 静的ファイル
- `apphosting.yaml` … Firebase App Hosting の設定ファイル
- `next.config.ts` … Next.js の設定ファイル

