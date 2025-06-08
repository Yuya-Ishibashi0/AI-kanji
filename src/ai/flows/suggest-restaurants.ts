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

const SuggestRestaurantsInputSchema = z.object({
  date: z.string().describe('The date for the restaurant reservation.'),
  time: z.string().describe('The time for the restaurant reservation.'),
  budget: z.string().describe('The budget per person for the meal.'),
  cuisine: z.string().describe('The preferred cuisine for the meal.'),
  location: z.string().describe('The location where the restaurant should be located.'),
  reviewAnalysis: z.string().describe('The analyzed reviews for restaurants in the specified location.'),
});
export type SuggestRestaurantsInput = z.infer<typeof SuggestRestaurantsInputSchema>;

const SuggestRestaurantsOutputSchema = z.object({
  restaurantName: z.string().describe('The name of the recommended restaurant.'),
  recommendationRationale: z.string().describe('The detailed explanation of why the restaurant is recommended based on the analyzed reviews and criteria.'),
});
export type SuggestRestaurantsOutput = z.infer<typeof SuggestRestaurantsOutputSchema>;

export async function suggestRestaurants(input: SuggestRestaurantsInput): Promise<SuggestRestaurantsOutput> {
  return suggestRestaurantsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestRestaurantsPrompt',
  input: {schema: SuggestRestaurantsInputSchema},
  output: {schema: SuggestRestaurantsOutputSchema},
  prompt: `You are a restaurant recommendation expert. Given the following criteria and restaurant review analysis, suggest a restaurant and explain your recommendation.

Criteria:
Date: {{{date}}}
Time: {{{time}}}
Budget: {{{budget}}}
Cuisine: {{{cuisine}}}
Location: {{{location}}}

Review Analysis:
{{{reviewAnalysis}}}

Based on these criteria and the review analysis, suggest a restaurant and explain your reasoning.`,
});

const suggestRestaurantsFlow = ai.defineFlow(
  {
    name: 'suggestRestaurantsFlow',
    inputSchema: SuggestRestaurantsInputSchema,
    outputSchema: SuggestRestaurantsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
