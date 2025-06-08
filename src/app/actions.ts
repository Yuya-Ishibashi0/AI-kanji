"use server";
import type { AnalyzeRestaurantReviewsOutput } from "@/ai/flows/analyze-restaurant-reviews";
import type { SuggestRestaurantsOutput } from "@/ai/flows/suggest-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";

export interface RecommendationResult {
  suggestion: SuggestRestaurantsOutput;
  analysis: AnalyzeRestaurantReviewsOutput;
  criteria: RestaurantCriteria;
}

export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult; error?: string }> {
  try {
    // In a real app, you might fetch reviews based on location/cuisine,
    // or have a database of restaurants and their reviews.
    // For now, using a descriptive mocked restaurant name and reviews.
    const MOCKED_RESTAURANT_NAME = `${criteria.location}の${criteria.cuisine}の名店`;
    const MOCKED_REVIEWS = `
      この${criteria.cuisine}レストランは${criteria.location}で非常に人気があります。
      料理は本格的で、特に${criteria.cuisine}好きにはたまらないでしょう。価格帯は${criteria.budget}程度で、コストパフォーマンスも良いです。
      サービスは丁寧で、グループでの利用にも快く対応してくれました。店の雰囲気も落ち着いており、会話も楽しめます。
      大人数での予約も可能ですが、週末は混み合うため早めの予約がおすすめです。
      接待や記念日など、特別な日の利用にも向いていると思います。
    `;

    const analysisInput = {
      restaurantName: MOCKED_RESTAURANT_NAME,
      reviews: MOCKED_REVIEWS,
    };
    const analysisResult = await analyzeRestaurantReviews(analysisInput);

    const suggestionInput = {
      date: criteria.date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: criteria.time,
      budget: criteria.budget,
      cuisine: criteria.cuisine,
      location: criteria.location,
      reviewAnalysis: JSON.stringify(analysisResult),
    };

    const suggestionResult = await suggestRestaurants(suggestionInput);
    
    // If AI suggests a different name, the analysis might not perfectly match.
    // For this demo, we use the initial analysis with the suggested restaurant.
    // A more advanced system might re-analyze if the name changes significantly.
    const finalAnalysis = {
        ...analysisResult,
        // Potentially update restaurantName in analysis if needed, though GenAI flow for analysis takes restaurantName as input
    };


    return {
      data: {
        suggestion: suggestionResult,
        analysis: finalAnalysis,
        criteria: criteria,
      },
    };
  } catch (e) {
    console.error("Error in getRestaurantSuggestion:", e);
    const errorMessage = e instanceof Error ? e.message : "AIの処理中に不明なエラーが発生しました。";
    if (errorMessage.includes("deadline")) {
       return { error: "AIの応答時間が長すぎました。しばらくしてからもう一度お試しください。"};
    }
    return { error: `AIの処理中にエラーが発生しました: ${errorMessage}` };
  }
}
