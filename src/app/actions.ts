
"use server";

import type { RestaurantCriteria, RecommendationResult, PopularRestaurant } from "@/lib/schemas";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { 
  buildPhotoUrl, 
  getRestaurantDetails, 
  textSearchNew,
  type RestaurantDetails as PlaceRestaurantDetails,
} from "@/services/google-places-service";
import { selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";

export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    // STEP 1: Primary Search (Google Places API)
    const { candidates: initialCandidates } = await textSearchNew(criteria);
    if (!initialCandidates || initialCandidates.length === 0) {
      return { error: '指定された条件に合うレストランが見つかりませんでした。' };
    }

    // STEP 2: Mechanical Filtering & Scoring
    const MIN_RATING = 3.7;
    const MIN_RATING_COUNT = 30;

    const filteredCandidates = initialCandidates
      .filter(c => c.rating && c.rating >= MIN_RATING)
      .filter(c => c.userRatingCount && c.userRatingCount >= MIN_RATING_COUNT)
      .filter(c => c.priceLevel); 

    if (filteredCandidates.length === 0) {
      return { error: '条件に合う評価の高いレストランが見つかりませんでした。評価の基準を少し下げてみてください。' };
    }
    
    const scoredCandidates = filteredCandidates.map(c => ({
      ...c,
      score: (c.rating || 0) + Math.log10(c.userRatingCount || 1),
    })).sort((a, b) => b.score - a.score);
    
    const topCandidates = scoredCandidates.slice(0, 5);

    // STEP 3: Get Details and Cache
    const candidatesForAI: (PlaceRestaurantDetails & { reviewsText: string })[] = [];
    const cacheCollection = adminDb.collection("shinjuku-places");

    for (const candidate of topCandidates) {
      const docRef = cacheCollection.doc(candidate.id);
      const docSnap = await docRef.get();
      let details: PlaceRestaurantDetails | null;

      if (docSnap.exists) {
        details = docSnap.data() as PlaceRestaurantDetails;
      } else {
        details = await getRestaurantDetails(candidate.id);
        if (details) {
          await docRef.set({ ...details, cachedAt: Timestamp.now() });
        }
      }
      
      if (details) {
        const reviewsText = details.reviews
          ?.map((r: any) => r.text?.text)
          .filter(Boolean)
          .join('\n') || '';

        candidatesForAI.push({
          ...details,
          reviewsText,
        });
      }
    }

    if (candidatesForAI.length === 0) {
      return { error: '詳細情報を取得できるレストランが見つかりませんでした。' };
    }

    // STEP 4 & 5: AI Selection and Analysis
    const aiInputCandidates = candidatesForAI.map(c => ({
        id: c.id,
        name: c.name,
        reviewsText: c.reviewsText,
        address: c.formattedAddress,
        rating: c.rating,
        userRatingsTotal: c.userRatingCount,
        websiteUri: c.websiteUri,
        googleMapsUri: c.googleMapsUri,
        types: c.types,
        priceLevel: c.priceLevel,
    }));

    const aiRecommendations = await selectAndAnalyzeBestRestaurants({
      candidates: aiInputCandidates,
      criteria,
    });

    let finalSelections = aiRecommendations;

    // STEP 6: Fallback Logic
    if (!finalSelections || finalSelections.length === 0) {
      console.log('AI did not select any restaurant, using fallback.');
      const fallbackCandidate = candidatesForAI[0];
      finalSelections = [
        {
          suggestion: {
            placeId: fallbackCandidate.id,
            restaurantName: fallbackCandidate.name,
            recommendationRationale: `AIによる自動選定が今回は行えませんでしたが、検索条件に最も一致し、評価が高かったお店としてこちらを提案します。機械的なフィルタリングに基づいた最上位の候補です。`,
          },
          analysis: {
            overallSentiment: "AIによる詳細分析は行われていません。",
            keyAspects: { food: "情報なし", service: "情報なし", ambiance: "情報なし" },
            groupDiningExperience: "情報なし",
            kanjiChecklist: { privateRoomQuality: "情報なし", noiseLevel: "情報なし", groupService: "情報なし" }
          }
        }
      ]
    }
    
    // Final data assembly
    const results: RecommendationResult[] = [];
    for (const selection of finalSelections) {
      const originalDetails = candidatesForAI.find(c => c.id === selection.suggestion.placeId);
      if (originalDetails) {
        const photoUrl = await buildPhotoUrl(originalDetails.photos?.[0]?.name);

        results.push({
          placeId: selection.suggestion.placeId,
          suggestion: selection.suggestion,
          analysis: selection.analysis,
          criteria,
          photoUrl: photoUrl,
          websiteUri: originalDetails.websiteUri,
          googleMapsUri: originalDetails.googleMapsUri,
          address: originalDetails.formattedAddress,
          rating: originalDetails.rating,
          userRatingsTotal: originalDetails.userRatingCount,
          types: originalDetails.types,
          priceLevel: originalDetails.priceLevel,
        });
      }
    }

    if (results.length === 0) {
        return { error: '最終的なおすすめを作成できませんでした。条件を変えてお試しください。' };
    }

    return { data: results };

  } catch (e) {
    console.error("Error in getRestaurantSuggestion action:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}

// Action to log a user's choice
export async function logUserChoice(placeId: string): Promise<{success: boolean; message?: string}> {
  if (!placeId) {
    return { success: false, message: "Place ID is required." };
  }
  try {
    await adminDb.collection('userChoices').add({
      placeId: placeId,
      selectedAt: Timestamp.now(),
    });
    console.log(`Logged user choice for placeId: ${placeId}`);
    return { success: true };
  } catch (error) {
    console.error("Error logging user choice to Firestore:", error);
    return { success: false, message: "Failed to log choice." };
  }
}

// Action to get popular restaurants based on user choices
export async function getPopularRestaurants(): Promise<PopularRestaurant[]> {
  try {
    // 1. Fetch all user choices
    const choicesSnapshot = await adminDb.collection('userChoices').get();
    if (choicesSnapshot.empty) {
      return [];
    }

    // 2. Count occurrences of each placeId
    const placeIdCounts = new Map<string, number>();
    choicesSnapshot.forEach(doc => {
      const { placeId } = doc.data();
      if (placeId) {
        placeIdCounts.set(placeId, (placeIdCounts.get(placeId) || 0) + 1);
      }
    });

    // 3. Sort by count and get top 16
    const sortedPlaceIds = Array.from(placeIdCounts.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(entry => entry[0])      // Get just the placeId
      .slice(0, 16);               // Limit to 16

    if (sortedPlaceIds.length === 0) {
      return [];
    }
      
    // 4. Fetch details for the top 16 restaurants from the cache collection
    const restaurantDetailsPromises = sortedPlaceIds.map(async (id) => {
        try {
            const docRef = adminDb.collection("shinjuku-places").doc(id);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error(`Failed to fetch details for popular restaurant ${id}:`, error);
            return null;
        }
    });
    const restaurantDetailsResults = (await Promise.all(restaurantDetailsPromises)).filter(r => r !== null);
    
    // 5. Format the data and get photo URLs
    const popularRestaurantsPromises = restaurantDetailsResults.map(async (details: any) => {
      let photoUrl: string | undefined = undefined;
      if (details.photos && details.photos.length > 0 && details.photos[0].name) {
        photoUrl = await buildPhotoUrl(details.photos[0].name);
      }
      
      return {
        placeId: details.id,
        name: details.displayName || '名前不明',
        address: details.formattedAddress || '住所不明',
        photoUrl: photoUrl,
        types: details.types || [],
        priceLevel: details.priceLevel,
      };
    });

    return Promise.all(popularRestaurantsPromises);

  } catch (error) {
    console.error("Error fetching popular restaurants:", error);
    return []; // Return empty array on error
  }
}
