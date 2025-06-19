
'use server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { 
  RestaurantCriteriaSchema as RestaurantCriteriaStringDateSchema, 
  AnalyzeRestaurantReviewsOutputSchema, 
  SuggestRestaurantsOutputSchema,
  type AnalyzeRestaurantReviewsOutput,
} from '@/lib/schemas';
import { analyzeRestaurantReviews, type AnalyzeRestaurantReviewsInput } from './analyze-restaurant-reviews';

const SingleLLMSuggestionSchema = SuggestRestaurantsOutputSchema.extend({
  placeId: z.string().describe("選択されたレストランのPlace ID。入力候補の `id` と一致させてください。"),
});

const SingleRecommendationSchema = z.object({
  suggestion: SingleLLMSuggestionSchema, 
  analysis: AnalyzeRestaurantReviewsOutputSchema,
});

const FinalOutputSchema = z.array(SingleRecommendationSchema);
export type FinalOutput = z.infer<typeof FinalOutputSchema>;

const CandidateForAISchema = z.object({
  id: z.string().describe("レストランの一意のPlace ID"),
  name: z.string().describe("レストラン名"),
  reviewsText: z.string().optional().describe("レストランのレビュー概要や結合されたレビュー本文"),
  address: z.string().optional().describe("住所"),
  rating: z.number().optional().describe("評価点"),
  userRatingsTotal: z.number().optional().describe("評価数"),
  websiteUri: z.string().optional().describe("レストランのウェブサイトURI"),
  googleMapsUri: z.string().optional().describe("レストランのGoogle Maps URI"),
  types: z.array(z.string()).optional().describe("レストランのカテゴリタイプ（例: restaurant, cafe）"),
  priceLevel: z.string().optional().describe("レストランの価格帯"),
});
type CandidateForAI = z.infer<typeof CandidateForAISchema>;


const SelectAndAnalyzeInputSchema = z.object({
  candidates: z.array(CandidateForAISchema).describe("整形されたレストラン候補情報の配列（レビューテキスト要約、タイプ、価格レベルを含む）"),
  criteria: RestaurantCriteriaStringDateSchema.extend({
    purposeOfUse: z.string().describe("The purpose of the gathering, e.g., farewell party, welcome party."),
  }).describe("ユーザーが入力した希望条件、個室希望、利用目的、カスタムプロンプトも含む"),
});


const LLMSelectionOutputSchema = z.array(SingleLLMSuggestionSchema).max(3).describe("選定されたレストラン（最大3件）とその推薦理由、Place IDのリスト。");

const newDefaultPersona = `あなたは、企業の重要な会合を数多く成功させてきた、極めて優秀で経験豊富な幹事です。あなたの使命は、単にレストランの情報を要約することではありません。提示された全ての情報源を駆使し、会の目的や参加者の背景を深く理解した上で、潜在的なリスクを洗い出し、成功を確信できる最高の店を推薦することです。あなたの分析と提案が、会の成否を左右します。`;

const defaultEvaluationPriorities = `
1.  **場の雰囲気とプライベート感**: スピーチや挨拶が問題なくできるか（特にユーザーが個室を希望している場合は個室の有無・質、店全体の静けさ）。
2.  **サービスの質**: 団体客への対応に慣れているか、ドリンク提供速度、スタッフの配慮。
3.  **席の配置と柔軟性**: 全員が一体感を持てる席か、参加人数の変更に対応できそうか。
4.  **料理とコストパフォーマンス**: 予算内で参加者満足度の高いコースや食事が提供されているか。
5.  その他ユーザーの希望条件（料理ジャンル、場所など）との合致度。`;

export const selectAndAnalyzeBestRestaurants = ai.defineFlow(
  {
    name: 'selectAndAnalyzeFarewellPartyRestaurantsFlow', 
    inputSchema: SelectAndAnalyzeInputSchema,
    outputSchema: FinalOutputSchema,
  },
  async (input) => {
    // Use the new default persona if customPromptPersona is not provided (e.g., in production)
    const persona = input.criteria.customPromptPersona || newDefaultPersona;
    // Use default priorities if customPromptPriorities is not provided
    const evaluationPriorities = input.criteria.customPromptPriorities || defaultEvaluationPriorities;
    
    const candidatesForPrompt = input.candidates.map(c => ({ 
        id: c.id, 
        name: c.name, 
        rating: c.rating, 
        userRatingsTotal: c.userRatingsTotal,
        types: c.types,
        priceLevel: c.priceLevel,
        reviewsTextSnippet: c.reviewsText ? c.reviewsText.substring(0, 200) + '...' : 'レビューなし' 
    }));

    const selectionPrompt = `
${persona}
以下のユーザー希望条件とレストラン候補リストを注意深く分析してください。候補リストには、評価点、レビュー数、店舗タイプ、価格帯、レビューの冒頭部分が含まれています。

# ユーザー希望条件
利用目的: ${input.criteria.purposeOfUse}
料理: ${input.criteria.cuisine}
場所: ${input.criteria.location}
予算: ${input.criteria.budget}
日時: ${input.criteria.date} ${input.criteria.time}
個室希望: ${input.criteria.privateRoomRequested ? 'はい' : 'いいえ'}

# レストラン候補リスト (各候補の評価点、レビュー数、店舗タイプ、価格帯、レビュー(reviewsTextSnippet)も参考にしてください)
${JSON.stringify(candidatesForPrompt, null, 2)}

# あなたのタスク
1.  **レストランの選定**: 「利用目的: ${input.criteria.purposeOfUse}」という目的を最優先に考慮し、候補リストの中から送別会・歓迎会等、その目的に最もふさわしいレストランを、下記の【評価の優先順位】に従って【上位3件まで】選んでください。
    *   **評価の優先順位 (高い順):**
${evaluationPriorities}
2.  **出力JSONの生成**: 選んだ各レストランについて、以下の情報を含むJSONオブジェクトを生成し、それらを配列にまとめてください。
    *   \`placeId\`: 選定したレストランの **ID (id プロパティ)** を候補リストから正確に含めてください。
    *   \`restaurantName\`: 選定したレストランの**名前 (name プロパティ)** を候補リストから正確に含めてください。
    *   \`recommendationRationale\`: そのレストランがなぜ「利用目的: ${input.criteria.purposeOfUse}」に、そして他のユーザー希望条件に照らしておすすめなのか、上記の評価基準を考慮して具体的な推薦文（日本語）を作成してください。

# 出力形式
必ず指示されたJSONスキーマ（LLMSelectionOutputSchema の SingleLLMSuggestionSchema 部分）に従い、【最大3件分のオブジェクトを持つ配列】として出力してください。
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

    const llmSelections = llmResponse.output;

    if (!llmSelections || llmSelections.length === 0) {
      console.log("AI (skilled secretary) did not select any restaurants.");
      return [];
    }

    const finalRecommendations: FinalOutput = [];

    for (const selection of llmSelections) {
      const originalCandidate = input.candidates.find(c => c.id === selection.placeId);

      if (!originalCandidate) {
        console.warn(`Could not find original candidate in input.candidates for placeId: ${selection.placeId}. Skipping this selection.`);
        continue;
      }

      const analysisInput: AnalyzeRestaurantReviewsInput = {
        restaurantName: selection.restaurantName,
        reviews: originalCandidate.reviewsText || "このレストランに関するレビュー情報はありません。",
      };
      
      let analysisResult: AnalyzeRestaurantReviewsOutput;
      try {
        console.log(`Calling analyzeRestaurantReviews (for Kanji) for: ${analysisInput.restaurantName}`);
        analysisResult = await analyzeRestaurantReviews(analysisInput);
      } catch (e) {
        console.error(`Error calling analyzeRestaurantReviews for ${selection.restaurantName}:`, e);
        analysisResult = {
            overallSentiment: "レビュー分析中にエラーが発生しました",
            keyAspects: { food: "情報なし", service: "情報なし", ambiance: "情報なし" },
            groupDiningExperience: "情報なし",
            kanjiChecklist: { privateRoomQuality: "情報なし", noiseLevel: "情報なし", groupService: "情報なし" }
        };
      }
      
      finalRecommendations.push({
        suggestion: selection,
        analysis: analysisResult,
      });
    }
    
    console.log(`Returning ${finalRecommendations.length} final recommendations from skilled secretary.`);
    return finalRecommendations;
  }
);

