
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import type { RestaurantCriteria } from "@/lib/schemas";
import {
    getRestaurantDetails,
    buildPhotoUrl,
    textSearchNew, // Added missing import
    type RestaurantCandidate,
    type RestaurantDetails as ApiRestaurantDetails,
    type PlacePhoto,
    type PlaceReview
} from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Interface representing the structure of documents in Firestore's "shinjuku-places" collection
interface FirestoreRestaurantDetails {
    id: string;
    name: string;
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    photos: PlacePhoto[]; // Ensure this is always an array, even if empty
    reviews: PlaceReview[];  // Ensure this is always an array, even if empty
    websiteUri?: string;
    googleMapsUri?: string;
    internationalPhoneNumber?: string;
    weekdayDescriptions?: string[];

    // Admin fields
    createdAt: Timestamp;
    updatedAt: Timestamp;
    isActive: boolean;
    category: string;
}


// フロントエンドに渡す、写真URLまで含んだ最終的な型
export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria;
    photoUrl?: string;
    placeId: string;
    websiteUri?: string;
    googleMapsUri?: string;
    address?: string;
    rating?: number;
    userRatingsTotal?: number;
};

/**
 * フロントエンドから呼び出される、Firestoreキャッシュロジックを実装したサーバーアクション
 */
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    const criteriaForAI = {
        ...criteria,
        date: format(new Date(criteria.date), 'yyyy-MM-dd')
    };

    console.log("Step 1 & 2: Starting Places API search and AI primary filtering...");
    const initialCandidates: RestaurantCandidate[] = await textSearchNew(criteriaForAI);
    if (!initialCandidates || initialCandidates.length === 0) {
      console.warn(`No restaurants found for location: ${criteriaForAI.location}, cuisine: ${criteriaForAI.cuisine}`);
      return { error: `指定された条件（場所: ${criteriaForAI.location}, 料理: ${criteriaForAI.cuisine}）に一致するレストランが見つかりませんでした。` };
    }
    console.log(`Found ${initialCandidates.length} initial candidates from Places API.`);

    const filteredPlaceIds = await filterRestaurantsForGroup({
      restaurants: initialCandidates,
      criteria: criteriaForAI,
    });

    if (!filteredPlaceIds || filteredPlaceIds.length === 0) {
      console.warn("AI primary filtering resulted in no suitable restaurants.");
      return { error: "AIによる一次判定で、グループ向けのお店が見つかりませんでした。条件を変えてお試しください。"};
    }
    console.log(`AI primary filtering narrowed down to ${filteredPlaceIds.length} candidates: ${filteredPlaceIds.join(', ')}`);

    console.log("Step 3: Fetching details for filtered candidates (cache-first strategy)...");
    const detailedCandidatesPromises = filteredPlaceIds.map(async (id): Promise<ApiRestaurantDetails | null> => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const cachedData = docSnap.data() as FirestoreRestaurantDetails;
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.name}' (ID: ${id}) from shinjuku-places.`);

        // Transform Firestore structure back to ApiRestaurantDetails structure
        const { createdAt, updatedAt, isActive, category, weekdayDescriptions, ...otherCachedFields } = cachedData;
        const apiDetailsFromCache: ApiRestaurantDetails = {
            ...otherCachedFields,
            photos: otherCachedFields.photos || [], // Ensure photos is an array
            reviews: otherCachedFields.reviews || [], // Ensure reviews is an array
            regularOpeningHours: weekdayDescriptions ? { weekdayDescriptions } : undefined,
        };
        return apiDetailsFromCache;
      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const detailsFromApi = await getRestaurantDetails(id);
        if (detailsFromApi) {
          // Ensure reviews and photos are present, even if API returns them as undefined/null
          // (though getRestaurantDetails should ideally handle this for its return type)
          const reviewsFromApi = detailsFromApi.reviews || [];
          const photosFromApi = detailsFromApi.photos || [];

          // Only save to DB if essential information like reviews is present (or adjust this condition)
          // For now, we'll save what we get, but log if reviews are missing.
          if (reviewsFromApi.length === 0) {
            console.warn(`[DB SAVE PREP] No reviews found for ${detailsFromApi.name} (ID: ${id}) from API. Will save with empty reviews array.`);
          }

          const now = Timestamp.now();
          const firestoreDocData: FirestoreRestaurantDetails = {
            id: detailsFromApi.id,
            name: detailsFromApi.name,
            formattedAddress: detailsFromApi.formattedAddress,
            rating: detailsFromApi.rating,
            userRatingCount: detailsFromApi.userRatingCount,
            photos: photosFromApi,
            reviews: reviewsFromApi,
            websiteUri: detailsFromApi.websiteUri,
            googleMapsUri: detailsFromApi.googleMapsUri,
            internationalPhoneNumber: detailsFromApi.internationalPhoneNumber,
            weekdayDescriptions: detailsFromApi.regularOpeningHours?.weekdayDescriptions,
            createdAt: now,
            updatedAt: now,
            isActive: true,
            category: "restaurant",
          };
          await docRef.set(firestoreDocData);
          console.log(`[CACHE SAVE] Firestore: Saved '${detailsFromApi.name}' (ID: ${id}) to shinjuku-places.`);
          // Return the structure the rest of the app expects
          return {
            ...detailsFromApi,
            reviews: reviewsFromApi, // Ensure it's an array
            photos: photosFromApi,   // Ensure it's an array
          };
        } else {
          console.warn(`[API FETCH FAIL] Failed to get details from API for ID: ${id}.`);
          return null;
        }
      }
    });

    const detailedCandidatesFromSource = (await Promise.all(detailedCandidatesPromises)).filter((c): c is ApiRestaurantDetails => c !== null);

    if (detailedCandidatesFromSource.length === 0) {
      console.warn("Failed to get detailed information for any candidate suitable for AI analysis.");
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }
    console.log(`Successfully fetched/retrieved details for ${detailedCandidatesFromSource.length} candidates for AI analysis.`);

    const candidatesForAI = detailedCandidatesFromSource.map(candidate => {
        // Ensure reviews array exists for joining; default to "レビュー情報なし" if empty or null
        const reviewsText = (candidate.reviews && candidate.reviews.length > 0)
            ? candidate.reviews.map(r => r.text?.text).filter(Boolean).join('\n\n---\n\n')
            : "レビュー情報なし";

        return {
            id: candidate.id,
            name: candidate.name,
            reviewsText: reviewsText,
            address: candidate.formattedAddress,
            rating: candidate.rating,
            userRatingsTotal: candidate.userRatingCount,
            websiteUri: candidate.websiteUri,
            googleMapsUri: candidate.googleMapsUri,
        };
    });


    console.log("Step 4: Running final AI analysis on detailed candidates...");
    const top3Analyses = await selectAndAnalyzeBestRestaurants({
      candidates: candidatesForAI,
      criteria: criteriaForAI,
    });

    if (!top3Analyses || top3Analyses.length === 0) {
        console.warn("AI final selection resulted in no recommendations.");
        return { error: "AIによる最終候補の選定に失敗しました。" };
    }
    console.log(`AI selected ${top3Analyses.length} final recommendations.`);

    console.log("Step 5: Fetching photo URLs and formatting final results...");
    const finalResults: RecommendationResult[] = [];

    for (const result of top3Analyses) {
        const llmSelectionPlaceId = result.suggestion.placeId;
        if (!llmSelectionPlaceId) {
            console.warn(`LLM selection for ${result.suggestion.restaurantName} is missing placeId. Skipping.`);
            continue;
        }

        const correspondingCandidate = detailedCandidatesFromSource.find(c => c.id === llmSelectionPlaceId);

        if (!correspondingCandidate) {
            console.warn(`Could not find original candidate details for placeId: ${llmSelectionPlaceId} (Restaurant: ${result.suggestion.restaurantName}). Skipping this recommendation.`);
            continue;
        }

        let photoUrl: string | undefined = undefined;
        if (correspondingCandidate.photos && correspondingCandidate.photos.length > 0 && correspondingCandidate.photos[0].name) {
            photoUrl = await buildPhotoUrl(correspondingCandidate.photos[0].name);
        }

        finalResults.push({
            ...result,
            placeId: correspondingCandidate.id,
            criteria,
            photoUrl,
            websiteUri: correspondingCandidate.websiteUri,
            googleMapsUri: correspondingCandidate.googleMapsUri,
            address: correspondingCandidate.formattedAddress,
            rating: correspondingCandidate.rating,
            userRatingsTotal: correspondingCandidate.userRatingCount,
        });
    }

    console.log("All steps completed. Returning final recommendations to client.");
    return { data: finalResults };

  } catch (e) {
    console.error("Error in getRestaurantSuggestion:", e);
    let errorMessage = e instanceof Error ? e.message : "AIの処理またはGoogle Places APIの呼び出し中に不明なエラーが発生しました。";
    if (errorMessage.includes("permission-denied") || errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("7 PERMISSION_DENIED")) {
        errorMessage = "データベースへのアクセス権限がありません。Firebase Admin SDKのサービスアカウントキーの設定、またはFirestoreのセキュリティルールを確認してください。";
    } else if (e instanceof Error && e.message.includes("Could not load the default credentials")) {
        errorMessage = "Firebase Admin SDKのデフォルト認証情報を読み込めませんでした。サービスアカウントキーが正しく設定されているか、環境が適切に構成されているか確認してください。";
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}
