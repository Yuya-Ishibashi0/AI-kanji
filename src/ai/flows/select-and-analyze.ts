'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { RestaurantCriteriaSchema, AnalyzeRestaurantReviewsOutputSchema, SuggestRestaurantsOutputSchema } from '@/lib/schemas';


/**
 * 最終的にフロントエンドに返す、レストラン1件あたりの推薦結果の型スキーマ
 */
const SingleRecommendationSchema = z.object({
  suggestion: SuggestRestaurantsOutputSchema,
  analysis: AnalyzeRestaurantReviewsOutputSchema,
  // criteria と photoUrl は後から追加するため、ここでは含めない
});

/**
 * このAIフローの最終的な出力形式。推薦結果の配列となる。
 */
const FinalOutputSchema = z.array(SingleRecommendationSchema);
export type FinalOutput = z.infer<typeof FinalOutputSchema>;


/**
 * このAIフローへの入力の型スキーマ
 */
const SelectAndAnalyzeInputSchema = z.object({
  // anyの代わりに、より具体的な型を定義することが望ましい
  candidates: z.array(z.any()).describe("Place Details APIから取得したレストラン詳細情報の配列（写真URLは含まない）"),
  criteria: RestaurantCriteriaSchema.describe("ユーザーが入力した希望条件"),
});

/**
 * 複数の候補から最適なものを【3件】選び、それぞれレビュー分析と推薦文を生成するAIフロー
 */
export const selectAndAnalyzeBestRestaurants = ai.defineFlow(
  {
    name: 'selectAndAnalyzeBestRestaurantsFlow', // フロー名を複数形に
    inputSchema: SelectAndAnalyzeInputSchema,
    outputSchema: FinalOutputSchema, // 出力スキーマを配列に変更
  },
  async (input) => {

    const prompt = `あなたは、ユーザーの希望に最適なレストランを提案する、経験豊富なレストランコンシェルジュです。
以下のユーザー希望条件とレストラン候補リストを注意深く分析してください。

# ユーザー希望条件
${JSON.stringify(input.criteria, null, 2)}

# レストラン候補リスト
${JSON.stringify(input.candidates, null, 2)}

# あなたのタスク
1.  **レストランの選定**: 候補リストの中から、ユーザーの希望条件に最も合致するレストランを【上位3件】、順位付けして選んでください。
2.  **出力JSONの生成**: 選んだ3件それぞれについて、以下の指示に従ってJSONオブジェクトを生成し、それらを配列にまとめてください。
    * 各オブジェクトは \`suggestion\` と \`analysis\` の2つのプロパティを持つ必要があります。
    * \`suggestion.restaurantName\` には、選定したレストランの**名前 (name プロパティ)** を正確に含めてください。
    * \`suggestion.recommendationRationale\` には、そのレストランがなぜおすすめなのか、具体的な推薦文（日本語）を作成してください。
    * \`analysis\` オブジェクトには、選定したレストランのレビュー分析結果を格納してください。

# 出力形式
必ず指示されたJSONスキーマ（FinalOutputSchema）に従い、【3件分のオブジェクトを持つ配列】として出力してください。
`;
    
    // AIにプロンプトと期待する出力形式を渡して実行
    const llmResponse = await ai.generate({
      prompt: prompt,
      model: 'googleai/gemini-1.5-flash',
      output: {
        format: 'json',
        schema: FinalOutputSchema, // 出力スキーマを配列形式に指定
      },
      config: { temperature: 0.2 },
    });

    // AIからの出力を返す（nullの場合は空の配列を返す）
    return llmResponse.output() || [];
  }
);
