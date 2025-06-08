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

const AnalyzeRestaurantReviewsInputSchema = z.object({
  restaurantName: z.string().describe('The name of the restaurant to analyze.'),
  reviews: z.string().describe('The reviews of the restaurant.'),
});
export type AnalyzeRestaurantReviewsInput = z.infer<
  typeof AnalyzeRestaurantReviewsInputSchema
>;

const AnalyzeRestaurantReviewsOutputSchema = z.object({
  overallSentiment: z
    .string()
    .describe('The overall sentiment towards the restaurant (positive, negative, neutral).'),
  keyAspects:
    z.object({
      food: z
        .string()
        .describe('Sentiment and details about the food, extracted from the reviews.'),
      service:
        z.string().describe('Sentiment and details about the service.'),
      ambiance: z
        .string()
        .describe('Sentiment and details about the ambiance.'),
    })
    .describe('Key aspects of the restaurant and their sentiment.'),
  groupDiningExperience:
    z
      .string()
      .describe(
        'Mentions of group dining experiences, suitability for groups, and related aspects.'
      ),
});
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
  output: {schema: AnalyzeRestaurantReviewsOutputSchema},
  prompt: `You are an AI expert in analyzing restaurant reviews. Your goal is to extract key information from the reviews to help users quickly understand if a restaurant is suitable for their group.

  Restaurant Name: {{restaurantName}}
  Reviews: {{reviews}}

  Analyze the reviews and extract the following information:

  - Overall Sentiment: Determine the overall sentiment towards the restaurant (positive, negative, or neutral).
  - Key Aspects:
    - Food: Extract sentiment and details about the food.
    - Service: Extract sentiment and details about the service.
    - Ambiance: Extract sentiment and details about the ambiance.
  - Group Dining Experience: Identify mentions of group dining experiences, suitability for groups, and related aspects.

  Format the output as a JSON object with the following keys:
  - overallSentiment: (string) The overall sentiment towards the restaurant.
  - keyAspects: (object) An object containing the food, service, and ambiance aspects.
    - food: (string) Sentiment and details about the food.
    - service: (string) Sentiment and details about the service.
    - ambiance: (string) Sentiment and details about the ambiance.
  - groupDiningExperience: (string) Mentions of group dining experiences.
  `,
});

const analyzeRestaurantReviewsFlow = ai.defineFlow(
  {
    name: 'analyzeRestaurantReviewsFlow',
    inputSchema: AnalyzeRestaurantReviewsInputSchema,
    outputSchema: AnalyzeRestaurantReviewsOutputSchema,
  },
  async input => {
    const {output} = await analyzeRestaurantReviewsPrompt(input);
    return output!;
  }
);
