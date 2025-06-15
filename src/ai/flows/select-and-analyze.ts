
'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { RestaurantCriteriaSchema, AnalyzeRestaurantReviewsOutputSchema, SuggestRestaurantsOutputSchema } from '@/lib/schemas'; // Import from centralized location


/**
 * 最終的にフロントエンドに返す結果の型スキーマ
 * 複数のコンポーネントで利用されるため、ここで一元管理するのが望ましい
 */
const FinalRecommendationSchema = z.object({
  suggestion: SuggestRestaurantsOutputSchema,
  analysis: AnalyzeRestaurantReviewsOutputSchema,
  criteria: RestaurantCriteriaSchema,
  photoUrl: z.string().optional().describe("選定したレストランの写真URL"),
});
export type FinalRecommendation = z.infer<typeof FinalRecommendationSchema>;

/**
 * このAIフローへの入力の型スキーマ
 * 複数のレストラン候補とユーザーの希望条件を含む
 */
const SelectAndAnalyzeInputSchema = z.object({
  // any型ではなく、getRestaurantDetailsの返り値の型（RestaurantDetails）を
  // zodスキーマで定義して使うのがより堅牢です。
  candidates: z.array(z.any()).describe("Place Details APIから取得したレストラン詳細情報の配列"),
  criteria: RestaurantCriteriaSchema.describe("ユーザーが入力した希望条件"),
});

/**
 * 複数の候補から最適な1件を選び、そのレビュー分析と推薦文を生成するAIフロー
 */
export const selectAndAnalyzeBestRestaurant = ai.defineFlow(
  {
    name: 'selectAndAnalyzeBestRestaurantFlow',
    inputSchema: SelectAndAnalyzeInputSchema,
    outputSchema: FinalRecommendationSchema,
  },
  async (input) => {

    const prompt = `あなたは、ユーザーの希望に最適なレストランを提案する、経験豊富なレストランコンシェルジュです。
以下のユーザー希望条件とレストラン候補リストを注意深く分析してください。

# ユーザー希望条件
${JSON.stringify(input.criteria, null, 2)}

# レストラン候補リスト (各候補には name, reviewsText, photoUrl などの詳細情報が含まれています)
${JSON.stringify(input.candidates, null, 2)}

# あなたのタスク
1.  **レストランの選定**: 提供された「レストラン候補リスト」の中から、「ユーザー希望条件」に最も合致する**最高のレストランを1つだけ**選んでください。
2.  **出力JSONの生成**: あなたが選んだその1つのレストランの情報を基に、以下の指示に従ってJSONオブジェクトを生成してください。
    *   \`suggestion\` オブジェクト内:
        *   \`restaurantName\` フィールドには、選定したレストランの**名前 (name プロパティ)** を正確に含めてください。
        *   \`recommendationRationale\` フィールドには、そのレストランがユーザーの希望に最適な理由を具体的に説明する推薦文（日本語）を作成してください。
    *   \`analysis\` オブジェクト内 (選定したレストランのレビュー分析結果):
        *   \`overallSentiment\`: 全体的な感情。
        *   \`keyAspects\` (food, service, ambiance): 各側面に関する感情と詳細。
        *   \`groupDiningExperience\`: グループ利用に関する言及。
    *   \`photoUrl\` フィールドには、選定したレストランの**写真URL (photoUrl プロパティ)** を含めてください。候補に \`photoUrl\` がない場合は、このフィールドを省略するか \`null\` に設定してください。
    *   \`criteria\` フィールドには、入力された「ユーザー希望条件」オブジェクトをそのまま含めてください。

# 出力形式
必ず指示されたJSONスキーマ（FinalRecommendationSchema）に従い、上記の指示内容を反映したJSONオブジェクトを生成してください。特に \`suggestion.restaurantName\` と \`photoUrl\` は、選定した候補の情報から正確に引用してください。
`;
    
    // AIにプロンプトと期待する出力形式を渡して実行
    const llmResponse = await ai.generate({
      prompt: prompt,
      // 長いコンテキストを扱い、JSON出力が得意なモデルを選択するのが望ましい
      model: 'googleai/gemini-1.5-flash', 
      output: {
        format: 'json',
        schema: FinalRecommendationSchema, // 出力スキーマを厳密に指定
      },
      // 創造性よりも一貫性を重視するため、temperatureを低めに設定
      config: { temperature: 0.1 }, 
    });

    // AIからの出力を返す（nullの場合は空のオブジェクトを返すなどのフォールバックも検討）
    return llmResponse.output()!;
  }
);

