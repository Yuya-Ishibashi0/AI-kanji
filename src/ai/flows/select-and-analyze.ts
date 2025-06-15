
'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
// Import the version of RestaurantCriteriaSchema that expects date as string
import { 
  RestaurantCriteriaSchema as RestaurantCriteriaStringDateSchema, 
  AnalyzeRestaurantReviewsOutputSchema, 
  SuggestRestaurantsOutputSchema,
  type AnalyzeRestaurantReviewsOutput // Import the type
} from '@/lib/schemas';
import { analyzeRestaurantReviews, type AnalyzeRestaurantReviewsInput } from './analyze-restaurant-reviews'; // Import the function and input type

/**
 * 最終的にフロントエンドに返す、レストラン1件あたりの推薦結果の型スキーマ
 */
const SingleRecommendationSchema = z.object({
  suggestion: SuggestRestaurantsOutputSchema, // Contains restaurantName, recommendationRationale
  analysis: AnalyzeRestaurantReviewsOutputSchema,
});

/**
 * このAIフローの最終的な出力形式。推薦結果の配列となる。
 */
const FinalOutputSchema = z.array(SingleRecommendationSchema);
export type FinalOutput = z.infer<typeof FinalOutputSchema>;


/**
 * このAIフローへの入力候補レストランの型スキーマ (より具体的に)
 */
const CandidateSchema = z.object({
  id: z.string().describe("レストランの一意のPlace ID"),
  name: z.string().describe("レストラン名"),
  reviewsText: z.string().optional().describe("レストランのレビュー概要や結合されたレビュー本文"),
  // AIが選定に利用する可能性のあるその他のフィールド
  address: z.string().optional().describe("住所"),
  rating: z.number().optional().describe("評価点"),
  userRatingsTotal: z.number().optional().describe("評価数"),
});

/**
 * このAIフローへの入力の型スキーマ
 */
const SelectAndAnalyzeInputSchema = z.object({
  candidates: z.array(CandidateSchema).describe("Place Details APIから取得したレストラン詳細情報の配列（レビュー本文を含む）"),
  criteria: RestaurantCriteriaStringDateSchema.describe("ユーザーが入力した希望条件, with date as string"),
});


/**
 * LLMによる選定ステップの出力スキーマ (中間スキーマ)
 */
const LLMSelectionItemSchema = z.object({
  placeId: z.string().describe("選択されたレストランのPlace ID。入力候補の `id` と一致させてください。"),
  suggestion: SuggestRestaurantsOutputSchema, // restaurantName と recommendationRationale を含む
});
const LLMSelectionOutputSchema = z.array(LLMSelectionItemSchema).max(3).describe("選定されたレストラン（最大3件）とその推薦理由のリスト。");


/**
 * 複数の候補から最適なものを【最大3件】選び、それぞれ推薦文を生成し、
 * その後、各選定レストランについて analyzeRestaurantReviews フローを呼び出してレビュー分析を行うAIフロー
 */
export const selectAndAnalyzeBestRestaurants = ai.defineFlow(
  {
    name: 'selectAndAnalyzeBestRestaurantsFlow',
    inputSchema: SelectAndAnalyzeInputSchema,
    outputSchema: FinalOutputSchema,
  },
  async (input) => {
    // ステップ1: LLMにレストランを選定させ、推薦理由を生成させる
    const selectionPrompt = `あなたは、ユーザーの希望に最適なレストランを提案する、経験豊富なレストランコンシェルジュです。
以下のユーザー希望条件とレストラン候補リストを注意深く分析してください。

# ユーザー希望条件
${JSON.stringify(input.criteria, null, 2)}

# レストラン候補リスト (各候補のレビュー(reviewsText プロパティ内のテキスト snippet)も参考にしてください)
${JSON.stringify(input.candidates.map(c => ({ id: c.id, name: c.name, rating: c.rating, reviewsTextSnippet: c.reviewsText ? c.reviewsText.substring(0, 200) + '...' : 'レビューなし' })), null, 2)}

# あなたのタスク
1.  **レストランの選定**: 候補リストの中から、ユーザーの希望条件に最も合致するレストランを【上位3件まで】選んでください。
2.  **出力JSONの生成**: 選んだ各レストランについて、以下の情報を含むJSONオブジェクトを生成し、それらを配列にまとめてください。
    *   \`placeId\`: 選定したレストランの **ID (id プロパティ)** を候補リストから正確に含めてください。
    *   \`suggestion\`:
        *   \`restaurantName\`: 選定したレストランの**名前 (name プロパティ)** を候補リストから正確に含めてください。
        *   \`recommendationRationale\`: そのレストランがなぜおすすめなのか、具体的な推薦文（日本語）を作成してください。レビューの概要やユーザーの希望条件を考慮してください。

# 出力形式
必ず指示されたJSONスキーマ（LLMSelectionOutputSchema）に従い、【最大3件分のオブジェクトを持つ配列】として出力してください。
適切なレストランが見つからない場合は、空の配列 [] を返してください。`;

    const llmResponse = await ai.generate({
      prompt: selectionPrompt,
      model: 'googleai/gemini-1.5-flash',
      output: {
        format: 'json',
        schema: LLMSelectionOutputSchema,
      },
      config: { temperature: 0.3 },
    });

    const selections = llmResponse.output;

    if (!selections || selections.length === 0) {
      console.log("AI did not select any restaurants.");
      return [];
    }

    const finalRecommendations: FinalOutput = [];

    // ステップ2: 選定された各レストランについて、analyzeRestaurantReviews フローを呼び出す
    for (const selection of selections) {
      const originalCandidate = input.candidates.find(c => c.id === selection.placeId);

      if (!originalCandidate) {
        console.warn(`Could not find original candidate in input for placeId: ${selection.placeId}. Skipping this selection.`);
        continue;
      }

      const analysisInput: AnalyzeRestaurantReviewsInput = {
        restaurantName: selection.suggestion.restaurantName, // AIが選定したレストラン名を使用
        reviews: originalCandidate.reviewsText || "このレストランに関するレビュー情報はありません。", // 元の候補からレビュー全文を取得
      };
      
      let analysisResult: AnalyzeRestaurantReviewsOutput;
      try {
        console.log(`Calling analyzeRestaurantReviews for: ${analysisInput.restaurantName}`);
        analysisResult = await analyzeRestaurantReviews(analysisInput);
      } catch (e) {
        console.error(`Error calling analyzeRestaurantReviews for ${selection.suggestion.restaurantName}:`, e);
        // フォールバックとして、分析エラーを示すオブジェクトを設定
        analysisResult = {
            overallSentiment: "レビュー分析中にエラーが発生しました",
            keyAspects: {
                food: "情報なし",
                service: "情報なし",
                ambiance: "情報なし",
            },
            groupDiningExperience: "情報なし",
        };
      }
      
      finalRecommendations.push({
        suggestion: selection.suggestion,
        analysis: analysisResult,
      });
    }
    
    console.log(`Returning ${finalRecommendations.length} final recommendations.`);
    return finalRecommendations;
  }
);

    
