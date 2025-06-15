
'use server';
/**
 * @fileOverview AI flow to filter restaurants based on group suitability from their review summaries.
 *
 * - filterRestaurantsForGroup - Function to filter restaurants.
 * - FilterRestaurantsInput - Input type for filterRestaurantsForGroup.
 * - FilterRestaurantsOutput - Output type for filterRestaurantsForGroup.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { RestaurantCriteriaSchema } from '@/lib/schemas';

// Schema for individual restaurant candidate input
const RestaurantCandidateSchema = z.object({
  id: z.string().describe('The Place ID of the restaurant.'),
  name: z.string().describe('The name of the restaurant.'),
  reviewsText: z.string().optional().describe('A summary of reviews for the restaurant.'),
});

// Schema objects are NOT exported
const FilterRestaurantsInputSchema = z.object({
  restaurants: z.array(RestaurantCandidateSchema).describe('A list of restaurant candidates to filter.'),
  criteria: RestaurantCriteriaSchema.describe('The user\'s dining criteria.'),
});
export type FilterRestaurantsInput = z.infer<typeof FilterRestaurantsInputSchema>;

const FilterRestaurantsOutputSchema = z.object({
  placeIds: z.array(z.string()).describe('A list of Place IDs of the restaurants deemed suitable for group dining, up to 5.'),
});
export type FilterRestaurantsOutput = z.infer<typeof FilterRestaurantsOutputSchema>;

export async function filterRestaurantsForGroup(input: FilterRestaurantsInput): Promise<string[]> {
  const flowOutput = await filterRestaurantsForGroupFlow(input);
  return flowOutput.placeIds;
}

const filterRestaurantsPrompt = ai.definePrompt({
  name: 'filterRestaurantsPrompt',
  input: { schema: FilterRestaurantsInputSchema },
  output: { schema: FilterRestaurantsOutputSchema },
  prompt: `あなたは、レストランのレビューを分析してグループ利用に適したお店を絞り込むAIアシスタントです。
以下のユーザーの希望条件とレストラン候補リストを分析してください。

# ユーザー希望条件
料理: {{criteria.cuisine}}
場所: {{criteria.location}}
予算: {{criteria.budget}}
日時: {{criteria.date}} {{criteria.time}}

# レストラン候補リスト (各レストランのレビュー概要(reviewsText)を特に重視してください)
{{#each restaurants}}
- ID: {{this.id}}
  レストラン名: {{this.name}}
  レビュー概要: {{this.reviewsText}}
{{/each}}

# あなたのタスク
レストラン候補リストの中から、ユーザーの希望条件と照らし合わせ、特に「レビュー概要」を基にグループでの利用に適していると思われるレストランを**最大5件まで**選定してください。
グループでの利用に適しているかどうかの判断基準は、レビュー内に大人数での利用、宴会、個室、広い席、予約のしやすさなど、グループ向けの記述があるかどうかです。
選定したレストランのID（id）のみを配列で返してください。

結果は指定されたJSON形式で出力してください。
`,
});

const filterRestaurantsForGroupFlow = ai.defineFlow(
  {
    name: 'filterRestaurantsForGroupFlow',
    inputSchema: FilterRestaurantsInputSchema,
    outputSchema: FilterRestaurantsOutputSchema,
  },
  async (input: FilterRestaurantsInput) => {
    const { output } = await filterRestaurantsPrompt(input);
    if (!output) {
        console.warn('Filter restaurants prompt did not return an output.');
        return { placeIds: [] }; 
    }
    return output;
  }
);
