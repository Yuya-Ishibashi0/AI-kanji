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
- **人気のお店の表示:**
  ユーザーが選択したお店を記録し、人気のあるお店をトップページに表示します。

---

## 2. 🏛️ システムアーキテクチャ

### 全体構成図

各コンポーネントがどのように連携して動作するかを示します。

```mermaid
graph TD
    User[ユーザー] --> Browser["ブラウザ (Next.js フロントエンド)"]
    Browser --> ServerActions["Next.js サーバーアクション<br>src/app/actions.ts<br>(getRestaurantSuggestion)"]
    
    subgraph "バックエンド処理"
        ServerActions --> GooglePlacesAPI["Google Places API<br>(店舗検索・詳細・写真取得)"]
        ServerActions --> GenkitFlows["Genkit AI フロー<br>src/ai/flows/select-and-analyze.ts<br>(候補選定・理由生成・レビュー分析)"]
        ServerActions --> FirestoreCache["Firestore (キャッシュ)<br>restaurantCache"]
        ServerActions --> FirestoreLog["Firestore (ログ)<br>userChoices"]
    end
    
    GooglePlacesAPI --> ServerActions
    GenkitFlows --> ServerActions
    FirestoreCache --> ServerActions
    FirestoreLog --> ServerActions

    subgraph "実行環境と設定"
      SecretManager["Google Cloud Secret Manager<br>(本番用のAPIキー等)"] -.-> AppHostingEnv["Firebase App Hosting 環境"]
      AppHostingEnv -.-> ServerActions
      EnvLocal[".env.local<br>(開発用のAPIキー等)"] -.-> ServerActions
    end

    style Browser fill:#f9f,stroke:#333,stroke-width:2px
    style ServerActions fill:#ccf,stroke:#333,stroke-width:2px
    style GooglePlacesAPI fill:#cfc,stroke:#333,stroke-width:2px
    style GenkitFlows fill:#ffc,stroke:#333,stroke-width:2px
    style FirestoreCache fill:#fcc,stroke:#333,stroke-width:2px
    style FirestoreLog fill:#fcc,stroke:#333,stroke-width:2px
    style SecretManager fill:#eef,stroke:#333,stroke-width:2px
    style AppHostingEnv fill:#dde,stroke:#333,stroke-width:2px
    style EnvLocal fill:#eee,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5
```

---

## 3. 💾 Firestoreデータモデル

このアプリケーションでは、データベースとしてFirestoreを使用しています。以下のようなコレクション構造になっています。

### `restaurantCache` (キャッシュ用コレクション)
Google Places APIから取得したレストランの詳細情報をキャッシュとして保存します。これにより、APIの呼び出し回数を減らし、コストと応答時間を削減します。

- **ドキュメントID**: `placeId` (Google Places のユニークID)
- **フィールド**:
    - `id`: placeId
    - `name`: レストラン名
    - `formattedAddress`: 整形済み住所
    - `rating`: 評価点
    - `userRatingCount`: レビュー数
    - `photos`: 写真情報の配列
    - `reviews`: レビュー情報の配列
    - `websiteUri`: ウェブサイトURL
    - `googleMapsUri`: GoogleマップURL
    - `priceLevel`: 価格帯
    - ... その他、Google Places APIから取得した詳細情報
    - `cachedAt`: このドキュメントがキャッシュされた日時 (Timestamp)

### `userChoices` (ログ用コレクション)
ユーザーが検索結果から「Google Mapsで見る」や「ウェブサイト」ボタンをクリックした際に、そのレストランの`placeId`を記録します。このログは「みんなが選んだお店」機能で利用されます。

- **ドキュメントID**: 自動生成ID
- **フィールド**:
    - `placeId`: ユーザーが選択したレストランの `placeId`
    - `selectedAt`: 選択された日時 (Timestamp)

---

## 4. ⚙️ レストラン推薦の処理フロー

ユーザーが検索を開始してから、おすすめのレストランが表示されるまでの処理の流れです。

### シーケンス図

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ (フロントエンド)
    participant ServerAction as Next.jsサーバーアクション<br>(actions.ts)
    participant PlacesAPI as Google Places API
    participant Firestore as Firestore (キャッシュ)
    participant GenkitAI as Genkit AI フロー<br>(select-and-analyze.ts)

    User->>Browser: 1. 検索条件を入力して送信
    Browser->>ServerAction: 2. getRestaurantSuggestion(条件)
    
    ServerAction->>PlacesAPI: 3. textSearchNew(クエリ)で一次検索 (最大20件)
    PlacesAPI-->>ServerAction: レストラン候補リスト
    
    ServerAction->>ServerAction: 4. filterAndScoreCandidates で<br>機械的に絞り込み (最大5件)
    
    loop 各候補
        ServerAction->>Firestore: 5. IDでキャッシュを確認
        alt キャッシュあり
            Firestore-->>ServerAction: キャッシュされた店舗情報
        else キャッシュなし
            ServerAction->>PlacesAPI: 6. getRestaurantDetails(ID)で詳細取得
            PlacesAPI-->>ServerAction: 店舗詳細情報
            ServerAction->>Firestore: 7. 詳細情報をキャッシュに保存
        end
    end
    
    ServerAction->>GenkitAI: 8. selectAndAnalyzeBestRestaurants(候補, 条件)<br>AIが選定と分析を同時に実行
    GenkitAI-->>ServerAction: 9. 最終推薦リスト (推薦理由、分析結果含む)
    
    alt AIが1件も選ばなかった場合
      ServerAction->>ServerAction: 10. createFallbackRecommendation で<br>フォールバックを作成
    end
    
    ServerAction->>ServerAction: 11. assembleFinalResults で<br>最終結果を整形 (写真URL取得など)
    
    ServerAction-->>Browser: 12. 最終的な推薦結果を返す
    Browser->>User: 13. 結果を表示
```

### フロー解説

`src/app/actions.ts`内の`getRestaurantSuggestion`関数が中心となり、以下のヘルパー関数を順に呼び出します。

1.  **検索条件の入力:** ユーザーが利用目的、場所、予算などの条件を入力します。
2.  **サーバーアクション呼び出し:** ブラウザがサーバーの`getRestaurantSuggestion`関数を呼び出します。
3.  **一次検索 (`textSearchNew`):** Google Places APIを使い、条件に合うレストランを最大20件検索します。
4.  **機械的フィルタリング (`filterAndScoreCandidates`):** 評価が低い、レビューが少ない等の店舗を除外し、スコアリングして上位最大5件を選びます。
5.  **キャッシュ確認 (`fetchAndCacheDetails`):** フィルタリングされた候補についてFirestoreにキャッシュがないか確認します。
6.  **詳細情報取得:** キャッシュがなければ、Places APIからレビュー本文などを含む詳細な情報を取得します。
7.  **キャッシュ保存:** APIから取得した情報は、今後のためにFirestoreに保存されます。
8.  **AIによる選定・分析 (`selectAndAnalyzeBestRestaurants`):** 収集した最大5件の店舗情報とユーザーの利用目的を単一のGenkit AIフローに渡します。このフローが「利用目的に最適な店の選定」「推薦理由の生成」「レビューの詳細分析」をすべて実行します。
9.  **AIからの結果返却:** AIが選定した店舗ID、推薦理由、詳細な分析結果がサーバーアクションに返されます。
10. **フォールバック処理 (`createFallbackRecommendation`):** もしAIが適切な店舗を選べなかった場合、機械フィルタリングで最上位だった候補を元に、代替の推薦情報を作成します。
11. **最終結果の整形 (`assembleFinalResults`):** AIからの推薦情報（またはフォールバック情報）に、写真URLやGoogleマップのリンクなどを追加し、フロントエンドが扱いやすい最終的な形式にまとめます。
12. **フロントエンドへ返却:** 全ての情報を整形し、ブラウザに返します。
13. **結果表示:** ブラウザが推薦レストランの情報を画面に表示します。

---

## 5. 🚀 セットアップ

### 前提条件
このプロジェクトを実行するには、以下の環境が必要です。

- **Node.js**: `v20.x` (推奨)
- **npm**: `v10.x` (Node.jsに同梱)

### 依存関係のインストール
```bash
npm install
```

### 環境変数の設定
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

## 6. 💻 開発コマンド

- **Next.js開発サーバー:**
  ```bash
  npm run dev
  ```

- **Genkit AI開発用UI:**
  ```bash
  npm run genkit:dev
  ```

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

## 7. ☁️ デプロイ (Firebase App Hosting)

このアプリケーションは Firebase App Hosting へのデプロイを想定しています。本番環境で必要なAPIキーは、`.env.local` ではなく **Google Cloud Secret Manager** を使って設定します。

設定方法は `apphosting.yaml` ファイル内の `secretEnvironmentVariables` セクションに記述されています。デプロイ時にSecret Manager関連のエラーが出た場合は、シークレット名が正しいか、サービスアカウントに適切な権限（Secret Managerのシークレットアクセサーロールなど）が付与されているかを確認してください。

---

## 8. 📁 ディレクトリ構成

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

---

## 10. ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。
