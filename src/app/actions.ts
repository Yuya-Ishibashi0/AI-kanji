
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { getRestaurantDetails, buildPhotoUrl, textSearchNew, type RestaurantCandidate, type RestaurantDetails as ApiRestaurantDetails } from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Firestoreに保存する際の型 (APIの型 + 管理フィールド)
interface FirestoreRestaurantDetails extends ApiRestaurantDetails {
    createdAt: Timestamp;
    updatedAt: Timestamp; 
    isActive: boolean;
    category: string; 
    // nationalPhoneNumber?: string; // This was mapped from internationalPhoneNumber, but Places API directly provides internationalPhoneNumber
    // weekdayDescriptions is already part of regularOpeningHours in ApiRestaurantDetails if structured correctly
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
    const searchResults: RestaurantCandidate[] = await textSearchNew(criteriaForAI);
    if (!searchResults || searchResults.length === 0) {
      console.warn(`No restaurants found for location: ${criteriaForAI.location}, cuisine: ${criteriaForAI.cuisine}`);
      return { error: `指定された条件（場所: ${criteriaForAI.location}, 料理: ${criteriaForAI.cuisine}）に一致するレストランが見つかりませんでした。` };
    }
    console.log(`Found ${searchResults.length} initial candidates from Places API.`);

    const filteredPlaceIds = await filterRestaurantsForGroup({
      restaurants: searchResults,
      criteria: criteriaForAI,
    });
    
    if (!filteredPlaceIds || filteredPlaceIds.length === 0) {
      console.warn("AI primary filtering resulted in no suitable restaurants.");
      return { error: "AIによる一次判定で、グループ向けのお店が見つかりませんでした。条件を変えてお試しください。"};
    }
    console.log(`AI primary filtering narrowed down to ${filteredPlaceIds.length} candidates: ${filteredPlaceIds.join(', ')}`);

    console.log("Step 3: Fetching details for filtered candidates (cache-first strategy)...");
    const detailPromises = filteredPlaceIds.map(async (id): Promise<ApiRestaurantDetails | null> => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const cachedData = docSnap.data() as FirestoreRestaurantDetails;
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.name}' (ID: ${id}) from shinjuku-places.`);
        
        // Firestoreの型からAPIの型へ（管理フィールドを除外し、必要なら型変換）
        // ApiRestaurantDetailsに合わせるため、createdAt, updatedAt, isActive, categoryは含めない
        const { createdAt, updatedAt, isActive, category, ...apiDetailsFromCache } = cachedData;
        return apiDetailsFromCache as ApiRestaurantDetails;
      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const detailsFromApi = await getRestaurantDetails(id);
        if (detailsFromApi) {
          const now = Timestamp.now();
          // FirestoreRestaurantDetails には ApiRestaurantDetails の全フィールドが含まれる
          const firestoreDetails: FirestoreRestaurantDetails = {
            ...detailsFromApi, // photos, reviews, etc. are included here
            createdAt: now,
            updatedAt: now, 
            isActive: true,
            category: "restaurant", // Example category
          };
          await docRef.set(firestoreDetails);
          console.log(`[CACHE SAVE] Firestore: Saved '${detailsFromApi.name}' (ID: ${id}) to shinjuku-places.`);
        }
        return detailsFromApi;
      }
    });

    const detailedCandidatesFromSource = (await Promise.all(detailPromises)).filter((c): c is ApiRestaurantDetails => c !== null);

    if (detailedCandidatesFromSource.length === 0) {
      console.warn("Failed to get detailed information for any candidate.");
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }
    console.log(`Successfully fetched/retrieved details for ${detailedCandidatesFromSource.length} candidates.`);

    const candidatesForAI = detailedCandidatesFromSource.map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        reviewsText: candidate.reviews && candidate.reviews.length > 0
            ? candidate.reviews.map(r => r.text?.text).filter(Boolean).join('\n\n---\n\n')
            : "レビュー情報なし",
        address: candidate.formattedAddress,
        rating: candidate.rating,
        userRatingsTotal: candidate.userRatingCount,
        websiteUri: candidate.websiteUri,
        googleMapsUri: candidate.googleMapsUri,
    }));


    console.log("Step 4: Running final AI analysis on detailed candidates...");
    const top3Analyses = await selectAndAnalyzeBestRestaurants({
      candidates: candidatesForAI,
      criteria: criteriaForAI, // Pass the full criteria including custom prompts
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
        if (correspondingCandidate.photos && correspondingCandidate.photos.length > 0) {
            // Use the already async buildPhotoUrl
            photoUrl = await buildPhotoUrl(correspondingCandidate.photos[0].name);
        }

        finalResults.push({
            ...result,
            placeId: correspondingCandidate.id, 
            criteria, // Pass the original criteria (with Date object) to the result for PreferenceDisplayCard
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
