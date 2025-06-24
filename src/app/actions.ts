
"use server";

import type { RestaurantCriteria, RecommendationResult, PopularRestaurant } from "@/lib/schemas";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { 
  buildPhotoUrl, 
  getRestaurantDetails, 
  textSearchNew,
  type RestaurantDetails as PlaceRestaurantDetails,
  type RestaurantCandidate,
} from "@/services/google-places-service";
import { selectAndAnalyzeBestRestaurants, type FinalOutput } from "@/ai/flows/select-and-analyze";

// Type alias for enriched candidate with review text
type CandidateWithDetails = PlaceRestaurantDetails & { reviewsText: string };

/**
 * Filters and scores restaurant candidates based on rating and review count.
 * @param candidates - The initial list of restaurant candidates.
 * @returns A sorted list of the top 5 candidates.
 * @throws An error if no suitable candidates are found after filtering.
 */
function filterAndScoreCandidates(candidates: RestaurantCandidate[]): RestaurantCandidate[] {
  const MIN_RATING = 3.7;
  const MIN_RATING_COUNT = 30;

  const filteredCandidates = candidates
    .filter(c => c.rating && c.rating >= MIN_RATING)
    .filter(c => c.userRatingCount && c.userRatingCount >= MIN_RATING_COUNT)
    .filter(c => c.priceLevel);
  
  if (filteredCandidates.length === 0) {
    throw new Error('条件に合う評価の高いレストランが見つかりませんでした。評価の基準を少し下げてみてください。');
  }
    
  const scoredCandidates = filteredCandidates.map(c => ({
    ...c,
    score: (c.rating || 0) + Math.log10(c.userRatingCount || 1),
  })).sort((a, b) => b.score - a.score);
    
  return scoredCandidates.slice(0, 5);
}

/**
 * Fetches detailed information for a list of candidates, utilizing a Firestore cache.
 * @param candidates - The list of candidates to get details for.
 * @returns A promise that resolves to a list of candidates with their detailed information.
 * @throws An error if no details can be fetched for any candidate.
 */
async function fetchAndCacheDetails(candidates: RestaurantCandidate[]): Promise<CandidateWithDetails[]> {
  const candidatesWithDetails: CandidateWithDetails[] = [];
  const cacheCollection = adminDb.collection("shinjuku-places");

  for (const candidate of candidates) {
    const docRef = cacheCollection.doc(candidate.id);
    const docSnap = await docRef.get();
    let details: PlaceRestaurantDetails | null;

    if (docSnap.exists) {
      details = docSnap.data() as PlaceRestaurantDetails;
    } else {
      details = await getRestaurantDetails(candidate.id);
      if (details) {
        // Asynchronously set cache without waiting for it to complete
        docRef.set({ ...details, cachedAt: Timestamp.now() }).catch(err => {
          console.error(`Failed to cache details for ${candidate.id}:`, err);
        });
      }
    }
    
    if (details) {
      const reviewsText = details.reviews?.map((r) => r.text?.text).filter(Boolean).join('\n') || '';
      candidatesWithDetails.push({ ...details, reviewsText });
    }
  }

  if (candidatesWithDetails.length === 0) {
    throw new Error('詳細情報を取得できるレストランが見つかりませんでした。');
  }

  return candidatesWithDetails;
}

/**
 * Creates a fallback recommendation when the AI fails to provide one.
 * @param fallbackCandidate - The top-ranked candidate to use for the fallback.
 * @returns A FinalOutput array containing a single fallback recommendation.
 */
function createFallbackRecommendation(fallbackCandidate: CandidateWithDetails): FinalOutput {
  console.log('AI did not select any restaurant, using fallback.');
  return [{
    suggestion: {
      placeId: fallbackCandidate.id,
      restaurantName: fallbackCandidate.name || (fallbackCandidate as any).displayName?.text || '名前不明',
      recommendationRationale: `AIによる自動選定が今回は行えませんでしたが、検索条件に最も一致し、評価が高かったお店としてこちらを提案します。機械的なフィルタリングに基づいた最上位の候補です。`,
    },
    analysis: {
      overallSentiment: "AIによる詳細分析は行われていません。",
      keyAspects: { food: "情報なし", service: "情報なし", ambiance: "情報なし" },
      groupDiningExperience: "情報なし",
      kanjiChecklist: { privateRoomQuality: "情報なし", noiseLevel: "情報なし", groupService: "情報なし" }
    }
  }];
}

/**
 * Assembles the final recommendation results from AI selections and original details.
 * @param aiSelections - The selections made by the AI.
 * @param originalCandidates - The list of candidates with full details.
 * @param criteria - The user's search criteria.
 * @returns A promise that resolves to the final list of recommendation results for the client.
 * @throws An error if no final recommendations can be created.
 */
async function assembleFinalResults(
  aiSelections: FinalOutput,
  originalCandidates: CandidateWithDetails[],
  criteria: RestaurantCriteria,
): Promise<RecommendationResult[]> {
  const resultsPromises = aiSelections.map(async (selection) => {
    const originalDetails = originalCandidates.find(c => c.id === selection.suggestion.placeId);
    if (!originalDetails) {
      return null;
    }
    
    const photoUrl = await buildPhotoUrl(originalDetails.photos?.[0]?.name);

    return {
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
    };
  });

  const results = (await Promise.all(resultsPromises)).filter((r): r is RecommendationResult => r !== null);

  if (results.length === 0) {
    throw new Error('最終的なおすすめを作成できませんでした。条件を変えてお試しください。');
  }

  return results;
}


/**
 * Main action to get restaurant suggestions based on user criteria.
 * This function orchestrates the search, filtering, AI analysis, and result assembly.
 */
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    // 1. Primary Search
    const { candidates: initialCandidates } = await textSearchNew(criteria);
    if (!initialCandidates || initialCandidates.length === 0) {
      return { error: '指定された条件に合うレストランが見つかりませんでした。' };
    }

    // 2. Mechanical Filtering & Scoring
    const topCandidates = filterAndScoreCandidates(initialCandidates);

    // 3. Fetch Details (with Caching)
    const candidatesForAI = await fetchAndCacheDetails(topCandidates);
    
    // 4. AI Selection and Analysis
    const aiInputCandidates = candidatesForAI.map(c => ({
        id: c.id,
        name: c.name || (c as any).displayName?.text || '名前不明',
        reviewsText: c.reviewsText,
        address: c.formattedAddress,
        rating: c.rating,
        userRatingsTotal: c.userRatingCount,
        websiteUri: c.websiteUri,
        googleMapsUri: c.googleMapsUri,
        types: c.types,
        priceLevel: c.priceLevel,
    }));
    
    let aiRecommendations = await selectAndAnalyzeBestRestaurants({
      candidates: aiInputCandidates,
      criteria,
    });

    // 5. Fallback Logic
    if (!aiRecommendations || aiRecommendations.length === 0) {
      aiRecommendations = createFallbackRecommendation(candidatesForAI[0]);
    }
    
    // 6. Final Data Assembly
    const results = await assembleFinalResults(aiRecommendations, candidatesForAI, criteria);

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
        name: details.name || details.displayName || '名前不明',
        address: details.formattedAddress || '住所不明',
        photoUrl: photoUrl,
        types: details.types || [],
        priceLevel: details.priceLevel,
        websiteUri: details.websiteUri,
        googleMapsUri: details.googleMapsUri,
      };
    });

    return Promise.all(popularRestaurantsPromises);

  } catch (error) {
    console.error("Error fetching popular restaurants:", error);
    return []; // Return empty array on error
  }
}
