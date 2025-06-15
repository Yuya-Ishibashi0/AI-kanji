
'use server';

/**
 * @fileOverview AI flow to analyze restaurant reviews and extract sentiment, key aspects, 
 * group dining mentions, and specific "Kanji Checklist" items.
 *
 * - analyzeRestaurantReviews - Function to analyze restaurant reviews.
 * - AnalyzeRestaurantReviewsInput - Input type for analyzeRestaurantReviews.
 * - AnalyzeRestaurantReviewsOutput - Output type for analyzeRestaurantReviews.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { AnalyzeRestaurantReviewsOutputSchema } from '@/lib/schemas'; 

const AnalyzeRestaurantReviewsInputSchema = z.object({
  restaurantName: z.string().describe('The name of the restaurant to analyze.'),
  reviews: z.string().describe('A summary or concatenation of reviews for the restaurant.'),
});
export type AnalyzeRestaurantReviewsInput = z.infer<
  typeof AnalyzeRestaurantReviewsInputSchema
>;

export type AnalyzeRestaurantReviewsOutput = z.infer<
  typeof AnalyzeRestaurantReviewsOutputSchema
>;

export async function analyzeRestaurantReviews(
  input: AnalyzeRestaurantReviewsInput
): Promise<AnalyzeRestaurantReviewsOutput> {
  return analyzeRestaurantReviewsFlow(input);
}

const analyzeRestaurantReviewsPrompt = ai.definePrompt({
  name: 'analyzeRestaurantReviewsForKanjiPrompt', // New name
  input: {schema: AnalyzeRestaurantReviewsInputSchema},
  output: {schema: AnalyzeRestaurantReviewsOutputSchema}, 
  prompt: `あなたはレストランのレビューを分析するAIエキスパートで、特に重要な会合（例：送別会、歓迎会）の幹事の視点を持っています。
  あなたの目標は、提供されたレビュー情報から重要な洞察を日本語で抽出し、以下の構造化データとして出力することです。

  レストラン名: {{restaurantName}}
  レビュー情報: {{reviews}}

  このレビュー情報を徹底的に分析し、以下の各項目について情報を抽出してください。**すべての出力は必ず日本語で生成してください。**
  該当する情報が見つからない場合は、各項目に「情報なし」と記述してください。

  - overallSentiment: レストランに対する全体的な感情（例：高評価、賛否両論、不評など）。
  - keyAspects:
    - food: 料理に関する感情と具体的な言及（例：「ピザが特に好評」「値段の割に味は普通」など）。
    - service: サービスに関する感情と具体的な言及（例：「店員の対応が丁寧」「提供が遅い」など）。
    - ambiance: 雰囲気に関する感情と具体的な言及（例：「個室があり落ち着ける」「店内は活気がある」など）。
  - groupDiningExperience: グループでの食事体験、グループ利用への適性に関する言及（例：「大人数での予約がしやすい」「宴会には不向き」など）。
  - kanjiChecklist: 幹事視点での重要なチェック項目。
    - privateRoomQuality: 個室の質（例：「完全個室で静かだった」「半個室で隣の声が聞こえる」など、具体的な記述や防音性に関する情報）。
    - noiseLevel: 店内の静かさ、騒がしさ、会話のしやすさに関する具体的な言及（例：「店内は落ち着いていて会話が弾んだ」「かなり騒がしく、声が通りにくかった」など）。
    - groupService: 団体利用時のドリンク提供のスムーズさ、注文の取りやすさ、スタッフの対応（例：「大人数だったがドリンク提供は早かった」「団体客に慣れていない印象だった」など）。
  `,
});


const analyzeRestaurantReviewsFlow = ai.defineFlow(
  {
    name: 'analyzeRestaurantReviewsForKanjiFlow', // New name
    inputSchema: AnalyzeRestaurantReviewsInputSchema,
    outputSchema: AnalyzeRestaurantReviewsOutputSchema, 
  },
  async input => {
    const {output} = await analyzeRestaurantReviewsPrompt(input);
    // Ensure kanjiChecklist is present, even if AI fails to provide it, to match schema
    const defaultKanjiChecklist = {
        privateRoomQuality: "情報なし",
        noiseLevel: "情報なし",
        groupService: "情報なし",
    };
    
    if (output) {
        return {
            ...output,
            kanjiChecklist: output.kanjiChecklist || defaultKanjiChecklist,
        };
    }
    // Fallback if AI output is entirely missing
    return {
        overallSentiment: "情報なし",
        keyAspects: { food: "情報なし", service: "情報なし", ambiance: "情報なし" },
        groupDiningExperience: "情報なし",
        kanjiChecklist: defaultKanjiChecklist,
    };
  }
);
