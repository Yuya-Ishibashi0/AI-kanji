
'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { 
  RestaurantCriteriaSchema as RestaurantCriteriaStringDateSchema, 
  AnalyzeRestaurantReviewsOutputSchema, 
  SuggestRestaurantsOutputSchema,
  type AnalyzeRestaurantReviewsOutput
} from '@/lib/schemas';
import { analyzeRestaurantReviews, type AnalyzeRestaurantReviewsInput } from './analyze-restaurant-reviews';

const SingleRecommendationSchema = z.object({
  suggestion: SuggestRestaurantsOutputSchema, 
  analysis: AnalyzeRestaurantReviewsOutputSchema,
});

const FinalOutputSchema = z.array(SingleRecommendationSchema);
export type FinalOutput = z.infer<typeof FinalOutputSchema>;

const CandidateSchema = z.object({
  id: z.string().describe("レストランの一意のPlace ID"),
  name: z.string().describe("レストラン名"),
  reviewsText: z.string().optional().describe("レストランのレビュー概要や結合されたレビュー本文"),
  address: z.string().optional().describe("住所"),
  rating: z.number().optional().describe("評価点"),
  userRatingsTotal: z.number().optional().describe("評価数"),
});

const SelectAndAnalyzeInputSchema = z.object({
  candidates: z.array(CandidateSchema).describe("Place Details APIから取得したレストラン詳細情報の配列（レビュー本文を含む）"),
  criteria: RestaurantCriteriaStringDateSchema.describe("ユーザーが入力した希望条件、個室希望も含む"),
});

const LLMSelectionItemSchema = z.object({
  placeId: z.string().describe("選択されたレストランのPlace ID。入力候補の `id` と一致させてください。"),
  suggestion: SuggestRestaurantsOutputSchema, 
});
const LLMSelectionOutputSchema = z.array(LLMSelectionItemSchema).max(3).describe("選定されたレストラン（最大3件）とその推薦理由のリスト。");

export const selectAndAnalyzeBestRestaurants = ai.defineFlow(
  {
    name: 'selectAndAnalyzeFarewellPartyRestaurantsFlow', // New name
    inputSchema: SelectAndAnalyzeInputSchema,
    outputSchema: FinalOutputSchema,
  },
  async (input) => {
    const persona = "あなたは、会社の重要な【送別会・歓迎会】を成功させる責任を持つ、経験豊富な幹事です。";
    const selectionPrompt = `
${persona}
以下のユーザー希望条件とレストラン候補リストを注意深く分析してください。

# ユーザー希望条件
料理: ${input.criteria.cuisine}
場所: ${input.criteria.location}
予算: ${input.criteria.budget}
日時: ${input.criteria.date} ${input.criteria.time}
個室希望: ${input.criteria.privateRoomRequested ? 'はい' : 'いいえ'}

# レストラン候補リスト (各候補のレビュー(reviewsText プロパティ内のテキスト snippet)も参考にしてください)
${JSON.stringify(input.candidates.map(c => ({ id: c.id, name: c.name, rating: c.rating, reviewsTextSnippet: c.reviewsText ? c.reviewsText.substring(0, 200) + '...' : 'レビューなし' })), null, 2)}

# あなたのタスク
1.  **レストランの選定**: 候補リストの中から、送別会・歓迎会に最もふさわしいレストランを、下記の【評価の優先順位】に従って【上位3件まで】選んでください。
    *   **評価の優先順位 (高い順):**
        1.  **場の雰囲気とプライベート感**: スピーチや挨拶が問題なくできるか（特にユーザーが個室を希望している場合は個室の有無・質、店全体の静けさ）。
        2.  **サービスの質**: 団体客への対応に慣れているか、ドリンク提供速度、スタッフの配慮。
        3.  **席の配置と柔軟性**: 全員が一体感を持てる席か、参加人数の変更に対応できそうか。
        4.  **料理とコストパフォーマンス**: 予算内で参加者満足度の高いコースや食事が提供されているか。
        5.  その他ユーザーの希望条件（料理ジャンル、場所など）との合致度。
2.  **出力JSONの生成**: 選んだ各レストランについて、以下の情報を含むJSONオブジェクトを生成し、それらを配列にまとめてください。
    *   \`placeId\`: 選定したレストランの **ID (id プロパティ)** を候補リストから正確に含めてください。
    *   \`suggestion\`:
        *   \`restaurantName\`: 選定したレストランの**名前 (name プロパティ)** を候補リストから正確に含めてください。
        *   \`recommendationRationale\`: そのレストランがなぜ送別会・歓迎会におすすめなのか、上記の評価基準とユーザーの希望条件を考慮して具体的な推薦文（日本語）を作成してください。

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
      config: { temperature: 0.2 }, 
    });

    const selections = llmResponse.output;

    if (!selections || selections.length === 0) {
      console.log("AI (skilled secretary) did not select any restaurants.");
      return [];
    }

    const finalRecommendations: FinalOutput = [];

    for (const selection of selections) {
      const originalCandidate = input.candidates.find(c => c.id === selection.placeId);

      if (!originalCandidate) {
        console.warn(`Could not find original candidate in input for placeId: ${selection.placeId}. Skipping this selection.`);
        continue;
      }

      const analysisInput: AnalyzeRestaurantReviewsInput = {
        restaurantName: selection.suggestion.restaurantName,
        reviews: originalCandidate.reviewsText || "このレストランに関するレビュー情報はありません。",
      };
      
      let analysisResult: AnalyzeRestaurantReviewsOutput;
      try {
        console.log(`Calling analyzeRestaurantReviews (for Kanji) for: ${analysisInput.restaurantName}`);
        analysisResult = await analyzeRestaurantReviews(analysisInput);
      } catch (e) {
        console.error(`Error calling analyzeRestaurantReviews for ${selection.suggestion.restaurantName}:`, e);
        analysisResult = {
            overallSentiment: "レビュー分析中にエラーが発生しました",
            keyAspects: {
                food: "情報なし",
                service: "情報なし",
                ambiance: "情報なし",
            },
            groupDiningExperience: "情報なし",
            kanjiChecklist: { // Ensure fallback includes new checklist
                privateRoomQuality: "情報なし",
                noiseLevel: "情報なし",
                groupService: "情報なし",
            }
        };
      }
      
      finalRecommendations.push({
        suggestion: selection.suggestion,
        analysis: analysisResult,
      });
    }
    
    console.log(`Returning ${finalRecommendations.length} final recommendations from skilled secretary.`);
    return finalRecommendations;
  }
);
