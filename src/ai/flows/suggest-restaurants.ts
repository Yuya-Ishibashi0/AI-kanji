
// src/ai/flows/suggest-restaurants.ts
'use server';
/**
 * @fileOverview A restaurant suggestion AI agent.
 *
 * - suggestRestaurants - A function that suggests restaurants based on criteria.
 * - SuggestRestaurantsInput - The input type for the suggestRestaurants function.
 * - SuggestRestaurantsOutput - The return type for the suggestRestaurants function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { SuggestRestaurantsOutputSchema } from '@/lib/schemas'; // Import from centralized location

const SuggestRestaurantsInputSchema = z.object({
  date: z.string().describe('The date for the restaurant reservation.'),
  time: z.string().describe('The time for the restaurant reservation.'),
  budget: z.string().describe('The budget per person for the meal.'),
  cuisine: z.string().describe('The preferred cuisine for the meal.'),
  location: z.string().describe('The location where the restaurant should be located.'),
  reviewAnalysis: z.string().describe('The analyzed reviews for restaurants in the specified location.'),
});
export type SuggestRestaurantsInput = z.infer<typeof SuggestRestaurantsInputSchema>;

// Type is still exported for usage
export type SuggestRestaurantsOutput = z.infer<typeof SuggestRestaurantsOutputSchema>;

export async function suggestRestaurants(input: SuggestRestaurantsInput): Promise<SuggestRestaurantsOutput> {
  return suggestRestaurantsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestRestaurantsPrompt',
  input: {schema: SuggestRestaurantsInputSchema},
  output: {schema: SuggestRestaurantsOutputSchema}, // Use the imported schema
  prompt: `あなたはレストラン推薦のエキスパートです。以下の基準とレストランのレビュー分析を考慮して、レストランを提案し、その推薦理由を説明してください。推薦理由は必ず日本語で記述してください。

基準:
日付: {{{date}}}
時間: {{{time}}}
予算: {{{budget}}}
料理の種類: {{{cuisine}}}
場所: {{{location}}}

レビュー分析:
{{{reviewAnalysis}}}

これらの基準とレビュー分析に基づいて、レストランを提案し、その推薦理由を日本語で詳しく説明してください。レストラン名も日本語で記述してください。`,
});

const suggestRestaurantsFlow = ai.defineFlow(
  {
    name: 'suggestRestaurantsFlow',
    inputSchema: SuggestRestaurantsInputSchema,
    outputSchema: SuggestRestaurantsOutputSchema, // Use the imported schema
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
