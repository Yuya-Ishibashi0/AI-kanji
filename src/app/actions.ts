
"use server";
import type { AnalyzeRestaurantReviewsOutput } from "@/ai/flows/analyze-restaurant-reviews";
import { analyzeRestaurantReviews } from "@/ai/flows/analyze-restaurant-reviews";
import type { SuggestRestaurantsOutput } from "@/ai/flows/suggest-restaurants";
import { suggestRestaurants } from "@/ai/flows/suggest-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { findRestaurantsByCriteria, getRestaurantDetails, type RestaurantDetails as ApiRestaurantDetails } from "@/services/google-places-service";


export interface RecommendationResult {
  suggestion: SuggestRestaurantsOutput;
  analysis: AnalyzeRestaurantReviewsOutput;
  criteria: RestaurantCriteria;
  photoUrl?: string; 
}


export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult; error?: string }> {
  try {
    const potentialRestaurants = await findRestaurantsByCriteria(criteria.location, criteria.cuisine);

    if (potentialRestaurants.length === 0) {
      return { error: `指定された条件（場所: ${criteria.location}, 料理: ${criteria.cuisine}）に一致するレストランが見つかりませんでした。Google Places APIからの結果です。` };
    }
    
    // For simplicity, let's pick the first potential restaurant.
    // A real app might let the AI choose, present multiple options, or filter further.
    const foundRestaurantSummary = potentialRestaurants[0];
    const restaurantDetails = await getRestaurantDetails(foundRestaurantSummary.id);

    if (!restaurantDetails) {
        return { error: `レストラン「${foundRestaurantSummary.name}」の詳細情報を取得できませんでした。`};
    }

    const reviewForAnalysis = restaurantDetails.reviewsText || 
      `${restaurantDetails.name}は${restaurantDetails.address || criteria.location}にある人気の${criteria.cuisine}レストランです。素晴らしい雰囲気と料理で知られています。`;

    const analysisInput = {
      restaurantName: restaurantDetails.name,
      reviews: reviewForAnalysis,
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
    
    // Ensure the restaurant name in the suggestion output is consistent with the one from API
    const finalSuggestion = {
        ...suggestionResult,
        restaurantName: restaurantDetails.name 
    };

    return {
      data: {
        suggestion: finalSuggestion,
        analysis: analysisResult,
        criteria: criteria,
        photoUrl: restaurantDetails.photoUrl,
      },
    };
  } catch (e) {
    console.error("Error in getRestaurantSuggestion:", e);
    let errorMessage = e instanceof Error ? e.message : "AIの処理またはGoogle Places APIの呼び出し中に不明なエラーが発生しました。";
     if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        errorMessage = "Google Places APIキーが無効です。設定を確認してください。";
    } else if (errorMessage.includes("Quota exceeded") || errorMessage.includes("OVER_QUERY_LIMIT")) {
        errorMessage = "Google Places APIの利用上限を超えました。しばらくしてから再試行するか、利用枠を確認してください。";
    } else if (errorMessage.includes("REQUEST_DENIED")) {
        errorMessage = "Google Places APIへのリクエストが拒否されました。APIキーや設定、利用規約を確認してください。";
    } else if (errorMessage.includes("deadline")) {
       errorMessage = "AIまたは外部APIの応答時間が長すぎました。しばらくしてからもう一度お試しください。";
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}
