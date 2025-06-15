
'use server';

/**
 * @fileOverview AI flow to analyze restaurant reviews and extract sentiment, key aspects, and mentions of group dining.
 *
 * - analyzeRestaurantReviews - Function to analyze restaurant reviews.
 * - AnalyzeRestaurantReviewsInput - Input type for analyzeRestaurantReviews.
 * - AnalyzeRestaurantReviewsOutput - Output type for analyzeRestaurantReviews.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { AnalyzeRestaurantReviewsOutputSchema } from '@/lib/schemas'; // Import from centralized location

// Input schema now expects a single string of reviews (e.g., a summary)
const AnalyzeRestaurantReviewsInputSchema = z.object({
  restaurantName: z.string().describe('The name of the restaurant to analyze.'),
  reviews: z.string().describe('A summary of reviews for the restaurant. This might be a concatenation of multiple reviews.'),
});
export type AnalyzeRestaurantReviewsInput = z.infer<
  typeof AnalyzeRestaurantReviewsInputSchema
>;

// Type is still exported for usage
export type AnalyzeRestaurantReviewsOutput = z.infer<
  typeof AnalyzeRestaurantReviewsOutputSchema
>;

export async function analyzeRestaurantReviews(
  input: AnalyzeRestaurantReviewsInput
): Promise<AnalyzeRestaurantReviewsOutput> {
  return analyzeRestaurantReviewsFlow(input);
}

const analyzeRestaurantReviewsPrompt = ai.definePrompt({
  name: 'analyzeRestaurantReviewsPrompt',
  input: {schema: AnalyzeRestaurantReviewsInputSchema},
  output: {schema: AnalyzeRestaurantReviewsOutputSchema}, // Use the imported schema
  prompt: `あなたはレストランのレビュー要約を分析するAIエキスパートです。あなたの目標は、提供された情報から重要な洞察を日本語で抽出することです。

  レストラン名: {{restaurantName}}
  レビューの要約: {{reviews}}

  このレビュー要約を分析し、以下の情報を抽出してください。**すべての出力は必ず日本語で生成してください。**

  - 全体的な感情 (Overall Sentiment): レストランに対する全体的な感情を判断してください。
  - 主要な側面 (Key Aspects):
    - 料理 (Food): 料理に関する感情と詳細を抽出してください。
    - サービス (Service): サービスに関する感情と詳細を抽出してください。
    - 雰囲気 (Ambiance): 雰囲気に関する感情と詳細を抽出してください。
  - グループでの利用体験 (Group Dining Experience): グループでの食事に関する言及、グループ利用への適性などを抽出してください。
  `,
});


const analyzeRestaurantReviewsFlow = ai.defineFlow(
  {
    name: 'analyzeRestaurantReviewsFlow',
    inputSchema: AnalyzeRestaurantReviewsInputSchema,
    outputSchema: AnalyzeRestaurantReviewsOutputSchema, // Use the imported schema
  },
  async input => {
    const {output} = await analyzeRestaurantReviewsPrompt(input);
    return output!;
  }
);
