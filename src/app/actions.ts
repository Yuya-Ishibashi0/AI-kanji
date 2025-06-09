
"use server";
import type { AnalyzeRestaurantReviewsOutput } from "@/ai/flows/analyze-restaurant-reviews";
import { analyzeRestaurantReviews } from "@/ai/flows/analyze-restaurant-reviews";
import type { SuggestRestaurantsOutput } from "@/ai/flows/suggest-restaurants";
import { suggestRestaurants } from "@/ai/flows/suggest-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, DocumentData } from "firebase/firestore";

export interface RecommendationResult {
  suggestion: SuggestRestaurantsOutput;
  analysis: AnalyzeRestaurantReviewsOutput;
  criteria: RestaurantCriteria;
}

interface RestaurantDoc extends DocumentData {
  name: string;
  cuisine: string;
  location: string;
  budget?: string; // Budget might be a range or specific value
  summaryReview?: string; // A brief summary of reviews
  // Add other fields as they exist in your Firestore documents
}

export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult; error?: string }> {
  try {
    // Fetch restaurant from Firestore
    const restaurantsRef = collection(db, "restaurants");
    // Simple query: match location and cuisine.
    // For a real app, you'd need more sophisticated querying, indexing, and possibly full-text search.
    const q = query(
      restaurantsRef,
      where("location", "==", criteria.location),
      where("cuisine", "==", criteria.cuisine),
      // Optionally filter by budget if you have comparable data in Firestore
      // where("budget", "==", criteria.budget), // This would need careful data modeling for budget ranges
      limit(5) // Get a few potential matches
    );

    const querySnapshot = await getDocs(q);
    const potentialRestaurants: RestaurantDoc[] = [];
    querySnapshot.forEach((doc) => {
      potentialRestaurants.push({ id: doc.id, ...doc.data() } as RestaurantDoc);
    });

    if (potentialRestaurants.length === 0) {
      return { error: `指定された条件（場所: ${criteria.location}, 料理: ${criteria.cuisine}）に一致するレストランが見つかりませんでした。` };
    }

    // For simplicity, let's pick the first potential restaurant.
    // A real app might let the AI choose or present multiple options.
    const foundRestaurant = potentialRestaurants[0];

    // Use the summaryReview from Firestore if available, otherwise a generic placeholder.
    const reviewForAnalysis = foundRestaurant.summaryReview || 
      `${foundRestaurant.name}は${foundRestaurant.location}にある人気の${foundRestaurant.cuisine}レストランです。素晴らしい雰囲気と料理で知られています。`;

    const analysisInput = {
      restaurantName: foundRestaurant.name,
      reviews: reviewForAnalysis, // Use summary review for analysis
    };
    const analysisResult = await analyzeRestaurantReviews(analysisInput);

    const suggestionInput = {
      date: criteria.date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: criteria.time,
      budget: criteria.budget,
      cuisine: criteria.cuisine,
      location: criteria.location,
      // Pass the summarized review analysis to the suggestion flow
      reviewAnalysis: JSON.stringify(analysisResult), 
    };

    // The suggestRestaurants flow might suggest the exact same name or a slightly varied one.
    // We will use the name from Firestore as the primary identifier for now.
    const suggestionResult = await suggestRestaurants(suggestionInput);
    
    // Ensure the restaurant name in the suggestion output is consistent with the one from DB
    // or decide if the AI's suggestion should override it. For now, let's ensure consistency.
    const finalSuggestion = {
        ...suggestionResult,
        restaurantName: foundRestaurant.name // Use the name from DB
    };


    return {
      data: {
        suggestion: finalSuggestion,
        analysis: analysisResult, // Use the analysis based on the found restaurant's review
        criteria: criteria,
      },
    };
  } catch (e) {
    console.error("Error in getRestaurantSuggestion:", e);
    let errorMessage = e instanceof Error ? e.message : "AIの処理中に不明なエラーが発生しました。";
    if (errorMessage.includes("deadline")) {
       return { error: "AIの応答時間が長すぎました。しばらくしてからもう一度お試しください。"};
    }
    if (errorMessage.includes("permission-denied") || errorMessage.includes("PERMISSION_DENIED")) {
        errorMessage = "データベースへのアクセス許可がありません。Firestoreのセキュリティルールを確認してください。"
    } else if (errorMessage.includes("offline") || errorMessage.includes("unavailable")) {
        errorMessage = "データベースに接続できませんでした。ネットワーク接続を確認するか、Firestoreが利用可能か確認してください。"
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}
