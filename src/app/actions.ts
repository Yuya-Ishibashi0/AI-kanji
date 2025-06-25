"use server";

import type {
  RestaurantCriteria,
  RecommendationResult,
  PopularRestaurant,
} from "@/lib/schemas";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildPhotoUrl,
  getRestaurantDetails,
  textSearchNew,
  type RestaurantDetails as PlaceRestaurantDetails,
  type RestaurantCandidate,
} from "@/services/google-places-service";
import {
  selectAndAnalyzeBestRestaurants,
  type FinalOutput,
} from "@/ai/flows/select-and-analyze";
import { RESTAURANT_CONFIG } from '@/config/restaurant';

// ==================== 独自エラー定義 ====================
class NoResultsError extends Error {}
class FilterError extends Error {}
class DataFetchError extends Error {}
class RecommendationError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.UNKNOWN,
    public originalError?: Error
  ) {
    super(message);
  }
}
enum ErrorCode {
  UNKNOWN = "UNKNOWN",
  // 必要に応じて追加
}

// ==================== 型エイリアス ====================
type CandidateWithDetails = PlaceRestaurantDetails & { reviewsText: string };

// ==================== サービスクラス ====================
class RestaurantSearchService {
  async searchCandidates(
    criteria: RestaurantCriteria
  ): Promise<RestaurantCandidate[]> {
    const { candidates } = await textSearchNew(criteria);
    if (!candidates || candidates.length === 0) {
      throw new NoResultsError(
        "指定された条件に合うレストランが見つかりませんでした。"
      );
    }
    return candidates;
  }
}

class RestaurantFilterService {
  filterAndScore(
    candidates: RestaurantCandidate[]
  ): RestaurantCandidate[] {
    const { MIN_RATING, MIN_RATING_COUNT } = RESTAURANT_CONFIG.FILTERING;

    const filtered = candidates
      .filter((c) => c.rating && c.rating >= MIN_RATING)
      .filter((c) => c.userRatingCount && c.userRatingCount >= MIN_RATING_COUNT)
      .filter((c) => c.priceLevel);

    if (filtered.length === 0) {
      throw new FilterError(
        "条件に合う評価の高いレストランが見つかりませんでした。"
      );
    }

    return filtered
      .map((c) => ({
        ...c,
        score: (c.rating || 0) + Math.log10(c.userRatingCount || 1),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

class RestaurantCacheService {
  async fetchWithCache(
    candidates: RestaurantCandidate[]
  ): Promise<CandidateWithDetails[]> {
    const results: CandidateWithDetails[] = [];
    const cacheCollection = adminDb.collection("restaurantCache");

    for (const candidate of candidates) {
      try {
        const details = await this.getCachedOrFresh(candidate.id, cacheCollection);
        if (details) {
          const reviewsText = this.extractReviewsText(details);
          results.push({ ...details, reviewsText });
        }
      } catch (error) {
        console.error(`Failed to fetch details for ${candidate.id}:`, error);
        // エラーが起きても他の候補は続行
      }
    }

    if (results.length === 0) {
      throw new DataFetchError(
        "詳細情報を取得できるレストランが見つかりませんでした。"
      );
    }

    return results;
  }

  private async getCachedOrFresh(placeId: string, cacheCollection: any) {
    const docRef = cacheCollection.doc(placeId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return docSnap.data() as PlaceRestaurantDetails;
    }

    const details = await getRestaurantDetails(placeId);
    if (details) {
      // 非同期でキャッシュ保存（エラーは無視）
      docRef.set({ ...details, cachedAt: Timestamp.now() }).catch(console.error);
    }
    return details;
  }

  private extractReviewsText(details: PlaceRestaurantDetails): string {
    return (
      details.reviews?.map((r) => r.text?.text).filter(Boolean).join("\n") || ""
    );
  }
}

// ==================== 補助ロジック ====================

function createFallbackRecommendation(
  fallbackCandidate: CandidateWithDetails
): FinalOutput {
  return [
    {
      suggestion: {
        placeId: fallbackCandidate.id,
        restaurantName:
          fallbackCandidate.name ||
          (fallbackCandidate as any).displayName?.text ||
          "名前不明",
        recommendationRationale:
          "AIによる自動選定が今回は行えませんでしたが、検索条件に最も一致し、評価が高かったお店としてこちらを提案します。機械的なフィルタリングに基づいた最上位の候補です。",
      },
      analysis: {
        overallSentiment: "AIによる詳細分析は行われていません。",
        keyAspects: {
          food: "情報なし",
          service: "情報なし",
          ambiance: "情報なし",
        },
        groupDiningExperience: "情報なし",
        kanjiChecklist: {
          privateRoomQuality: "情報なし",
          noiseLevel: "情報なし",
          groupService: "情報なし",
        },
      },
    },
  ];
}

async function runAIAnalysis(
  candidatesForAI: CandidateWithDetails[],
  criteria: RestaurantCriteria
): Promise<FinalOutput> {
  const aiInputCandidates = candidatesForAI.map((c) => ({
    id: c.id,
    name: c.name || (c as any).displayName?.text || "名前不明",
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

  if (!aiRecommendations || aiRecommendations.length === 0) {
    aiRecommendations = createFallbackRecommendation(candidatesForAI[0]);
  }
  return aiRecommendations;
}

async function assembleResults(
  aiSelections: FinalOutput,
  originalCandidates: CandidateWithDetails[],
  criteria: RestaurantCriteria
): Promise<RecommendationResult[]> {
  const resultsPromises = aiSelections.map(async (selection) => {
    const originalDetails = originalCandidates.find(
      (c) => c.id === selection.suggestion.placeId
    );
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

  const results = (await Promise.all(resultsPromises)).filter(
    (r): r is NonNullable<typeof r> => r !== null
  );  

  if (results.length === 0) {
    throw new RecommendationError(
      "最終的なおすすめを作成できませんでした。条件を変えてお試しください。"
    );
  }

  return results;
}

// ==================== メイン処理 ====================
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[] }> {
  const searchService = new RestaurantSearchService();
  const filterService = new RestaurantFilterService();
  const cacheService = new RestaurantCacheService();

  try {
    // 1. 検索
    const candidates = await searchService.searchCandidates(criteria);

    // 2. フィルタリング
    const topCandidates = filterService.filterAndScore(candidates);

    // 3. 詳細取得
    const candidatesForAI = await cacheService.fetchWithCache(topCandidates);

    // 4. AI分析
    const aiRecommendations = await runAIAnalysis(candidatesForAI, criteria);

    // 5. 結果組立
    const results = await assembleResults(
      aiRecommendations,
      candidatesForAI,
      criteria
    );

    return { data: results };
  } catch (error: any) {
    if (error instanceof RecommendationError) {
      throw error;
    }
    throw new RecommendationError(
      `処理中にエラーが発生しました: ${error.message}`,
      ErrorCode.UNKNOWN,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

// ==================== ログ・人気取得アクション（元コード流用） ====================

export async function logUserChoice(
  placeId: string
): Promise<{ success: boolean; message?: string }> {
  if (!placeId) {
    return { success: false, message: "Place ID is required." };
  }
  try {
    await adminDb.collection("userChoices").add({
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

export async function getPopularRestaurants(): Promise<PopularRestaurant[]> {
  try {
    // 1. Fetch all user choices
    const choicesSnapshot = await adminDb.collection("userChoices").get();
    if (choicesSnapshot.empty) {
      return [];
    }

    // 2. Count occurrences of each placeId
    const placeIdCounts = new Map<string, number>();
    choicesSnapshot.forEach((doc) => {
      const { placeId } = doc.data();
      if (placeId) {
        placeIdCounts.set(placeId, (placeIdCounts.get(placeId) || 0) + 1);
      }
    });

    // 3. Sort by count and get top 16
    const sortedPlaceIds = Array.from(placeIdCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])
      .slice(0, 16);

    if (sortedPlaceIds.length === 0) {
      return [];
    }

    // 4. Fetch details for the top 16 restaurants from the cache collection
    const restaurantDetailsPromises = sortedPlaceIds.map(async (id) => {
      try {
        const docRef = adminDb.collection("restaurantCache").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          return { id, ...docSnap.data() };
        }
        return null;
      } catch (error) {
        console.error(
          `Failed to fetch details for popular restaurant ${id}:`,
          error
        );
        return null;
      }
    });
    const restaurantDetailsResults = (
      await Promise.all(restaurantDetailsPromises)
    ).filter((r) => r !== null);

    // 5. Format the data and get photo URLs
    const popularRestaurantsPromises = restaurantDetailsResults.map(
      async (details: any) => {
        let photoUrl: string | undefined = undefined;
        if (
          details.photos &&
          details.photos.length > 0 &&
          details.photos[0].name
        ) {
          photoUrl = await buildPhotoUrl(details.photos[0].name);
        }

        return {
          placeId: details.id,
          name: details.name || details.displayName || "名前不明",
          address: details.formattedAddress || "住所不明",
          photoUrl: photoUrl,
          types: details.types || [],
          priceLevel: details.priceLevel,
          websiteUri: details.websiteUri,
          googleMapsUri: details.googleMapsUri,
        };
      }
    );

    return Promise.all(popularRestaurantsPromises);
  } catch (error) {
    console.error("Error fetching popular restaurants:", error);
    return []; // Return empty array on error
  }
}
