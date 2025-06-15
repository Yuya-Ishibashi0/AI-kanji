
'use server';
/**
 * @fileOverview AI flow to filter restaurants based on group suitability from their review summaries,
 * specifically for farewell/welcome parties.
 *
 * - filterRestaurantsForGroup - Function to filter restaurants.
 * - FilterRestaurantsInput - Input type for filterRestaurantsForGroup.
 * - FilterRestaurantsOutput - Output type for filterRestaurantsForGroup.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { RestaurantCriteriaSchema as RestaurantCriteriaStringDateSchema } from '@/lib/schemas';

const RestaurantCandidateSchema = z.object({
  id: z.string().describe('The Place ID of the restaurant.'),
  name: z.string().describe('The name of the restaurant.'),
  // The field from google-places-service.ts is `reviewSummary`
  reviewSummary: z.string().optional().describe('A summary of reviews for the restaurant (from Google).'),
});

const FilterRestaurantsInputSchema = z.object({
  restaurants: z.array(RestaurantCandidateSchema).describe('A list of restaurant candidates to filter.'),
  criteria: RestaurantCriteriaStringDateSchema.describe("The user's dining criteria, including private room preference."),
});
export type FilterRestaurantsInput = z.infer<typeof FilterRestaurantsInputSchema>;

const FilterRestaurantsOutputSchema = z.object({
  placeIds: z.array(z.string()).describe('A list of Place IDs of restaurants suitable for a farewell/welcome party, up to 5.'),
});
export type FilterRestaurantsOutput = z.infer<typeof FilterRestaurantsOutputSchema>;

export async function filterRestaurantsForGroup(input: FilterRestaurantsInput): Promise<string[]> {
  const flowOutput = await filterRestaurantsForGroupFlow(input);
  return flowOutput.placeIds;
}

const filterRestaurantsPrompt = ai.definePrompt({
  name: 'filterFarewellWelcomePartyRestaurantsPrompt', // New name to reflect specificity
  input: { schema: FilterRestaurantsInputSchema },
  output: { schema: FilterRestaurantsOutputSchema },
  prompt: `あなたは優秀な幹事です。これから会社の【送別会・歓迎会】で利用するレストランの候補を絞り込みます。
以下のユーザーの希望条件とレストラン候補リストのレビュー概要（reviewSummary）を注意深く読み、「送別会・歓迎会」に適した店舗を最大5件まで選んでください。

# ユーザー希望条件:
料理: {{criteria.cuisine}}
場所: {{criteria.location}}
予算: {{criteria.budget}}
日時: {{criteria.date}} {{criteria.time}}
個室希望: {{#if criteria.privateRoomRequested}}はい{{else}}いいえ{{/if}}

# レストラン候補リスト (各レストランのレビュー概要(reviewSummary)を特に重視してください):
{{#each restaurants}}
- ID: {{this.id}}
  レストラン名: {{this.name}}
  レビュー概要: {{this.reviewSummary}}
{{/each}}

# 特に重視する評価基準：
- 【最重要】ユーザーが「個室希望: はい」の場合、レビュー概要に「個室」に関する肯定的な記述があるか、または否定的な記述がないこと。個室がない、または個室に関する情報が全くない店舗は、ユーザーが個室を希望している場合は選定しないでください。
- 【重要】レビュー概要から、「静か」「落ち着いた雰囲気」「会話がしやすい」など、スピーチや参加者同士の会話がしやすい環境であると推測できるか。
- 【重要】「ドリンク提供がスムーズ」「スタッフの対応が良い」「団体慣れしている」など、大人数での会食運営に慣れていると推測できるか。
- 【リスク】レビュー概要に「騒がしい」「隣がうるさい」「席が分かれた」「個室が期待外れ」「ドリンクが遅い」「店員の態度が悪い」といった記述がある店舗は評価を大幅に下げてください。

上記の基準に基づき、ユーザーの希望条件（特に個室の希望がある場合はそれを満たすこと）を考慮し、送別会・歓迎会に最も適していると思われるレストランのIDを5件まで選んで、配列として返してください。
適切な店舗がなければ空の配列を返してください。
`,
});

const filterRestaurantsForGroupFlow = ai.defineFlow(
  {
    name: 'filterRestaurantsForFarewellWelcomePartyFlow', // New name
    inputSchema: FilterRestaurantsInputSchema,
    outputSchema: FilterRestaurantsOutputSchema,
  },
  async (input: FilterRestaurantsInput) => {
    // Rename reviewSummary to reviewsText if the prompt expects reviewsText
    // For now, the prompt is updated to use reviewSummary
    const mappedInput = {
        ...input,
        restaurants: input.restaurants.map(r => ({
            ...r,
            // The prompt now uses `reviewSummary`, so no mapping needed here if `RestaurantCandidateSchema` uses `reviewSummary`
        }))
    };
    const { output } = await filterRestaurantsPrompt(mappedInput);
    if (!output) {
        console.warn('Filter restaurants prompt did not return an output.');
        return { placeIds: [] }; 
    }
    return output;
  }
);
