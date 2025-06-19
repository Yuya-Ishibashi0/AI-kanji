
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import type { RestaurantCriteria } from "@/lib/schemas";
import {
    getRestaurantDetails,
    buildPhotoUrl,
    textSearchNew,
    type RestaurantCandidate,
    type PlaceReview as ApiPlaceReview,
    type PlacePhoto as ApiPlacePhoto,
    type RestaurantDetails as ApiRestaurantDetails
} from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Firestoreに保存する際の写真オブジェクトの型
interface FirestorePlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
  // authorAttributions は保存しない
}

// Firestoreに保存する際のレビューオブジェクトの型
interface FirestorePlaceReview {
  authorName?: string;      // authorAttribution.displayName から
  languageCode?: string;    // text.languageCode から
  publishTime?: string;     // review.publishTime (ISO string) から
  rating: number;
  text?: string;            // text.text から
  // review.name (リソース名) や relativePublishTimeDescription は保存しない
}

// Firestoreの "shinjuku-places" コレクションのドキュメント構造
interface FirestoreRestaurantDetails {
  id: string;
  displayName: string; 
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  photos: FirestorePlacePhoto[];
  reviews: FirestorePlaceReview[];
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string; 
  weekdayDescriptions?: string[]; 

  // Admin fields
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
  category: string;

  // lastSyncAt, preview, subarea は保存しない
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

export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    const criteriaForAI = {
        ...criteria,
        date: format(new Date(criteria.date), 'yyyy-MM-dd')
    };

    console.log("Step 1: Starting Places API search (textSearchNew)...");
    const initialCandidates: RestaurantCandidate[] = await textSearchNew(criteriaForAI);
    if (!initialCandidates || initialCandidates.length === 0) {
      console.warn(`No restaurants found for location: ${criteriaForAI.location}, cuisine: ${criteriaForAI.cuisine}`);
      return { error: `指定された条件（場所: ${criteriaForAI.location}, 料理: ${criteriaForAI.cuisine}）に一致するレストランが見つかりませんでした。` };
    }
    console.log(`Found ${initialCandidates.length} initial candidates from Places API.`);

    // --- レビューサマリー確認用ログ ---
    console.log("--- Review Summaries for AI Primary Filtering (initialCandidates) ---");
    // reviewSummary が undefined の可能性もあるため、安全にアクセス
    console.log(JSON.stringify(initialCandidates.map(c => ({ id: c.id, name: c.name, reviewSummary: c.reviewSummary || "N/A" })), null, 2));
    console.log("--------------------------------------------------------------------");
    // --- ここまで確認用ログ ---

    console.log("Step 2: Starting AI primary filtering (filterRestaurantsForGroup)...");
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
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.displayName}' (ID: ${id}) from shinjuku-places.`);

        // FirestoreのデータからApiRestaurantDetails型に変換（キャッシュから読み込む場合）
        const apiDetailsFromCache: ApiRestaurantDetails = {
            id: cachedData.id,
            name: cachedData.displayName, // FirestoreのdisplayNameをAPIのnameフィールドにマッピング
            formattedAddress: cachedData.formattedAddress,
            rating: cachedData.rating,
            userRatingCount: cachedData.userRatingCount,
            photos: cachedData.photos.map(p => ({ // FirestoreのPhoto型からAPIのPhoto型へ
                name: p.name,
                widthPx: p.widthPx,
                heightPx: p.heightPx,
                authorAttributions: [], // Firestoreには保存していないので空配列
            })),
            reviews: cachedData.reviews.map(r => ({ // FirestoreのReview型からAPIのReview型へ
                name: '', // Firestoreには保存していない
                relativePublishTimeDescription: '', // Firestoreには保存していない
                rating: r.rating,
                text: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined,
                originalText: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined, // originalTextも同様に設定
                authorAttribution: r.authorName ? { displayName: r.authorName, uri:'', photoUri:''} : undefined, // authorNameから生成
                publishTime: r.publishTime,
            })),
            websiteUri: cachedData.websiteUri,
            googleMapsUri: cachedData.googleMapsUri,
            internationalPhoneNumber: cachedData.nationalPhoneNumber, // nationalPhoneNumberをAPIのinternationalPhoneNumberに
            regularOpeningHours: cachedData.weekdayDescriptions ? { weekdayDescriptions: cachedData.weekdayDescriptions } : undefined,
        };
        return apiDetailsFromCache;
      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const detailsFromApi = await getRestaurantDetails(id);
        if (detailsFromApi) {
          const now = Timestamp.now();

          const firestoreDocData: FirestoreRestaurantDetails = {
            id: detailsFromApi.id,
            displayName: detailsFromApi.name, // APIのnameをdisplayNameとして保存
            formattedAddress: detailsFromApi.formattedAddress,
            rating: detailsFromApi.rating,
            userRatingCount: detailsFromApi.userRatingCount,
            photos: (detailsFromApi.photos || []).map((p: ApiPlacePhoto) => ({
              name: p.name,
              widthPx: p.widthPx,
              heightPx: p.heightPx,
            })),
            reviews: (detailsFromApi.reviews || []).map((r: ApiPlaceReview) => ({
              authorName: r.authorAttribution?.displayName,
              languageCode: r.text?.languageCode,
              publishTime: r.publishTime, // ISO 8601 string
              rating: r.rating,
              text: r.text?.text,
            })),
            websiteUri: detailsFromApi.websiteUri,
            googleMapsUri: detailsFromApi.googleMapsUri,
            nationalPhoneNumber: detailsFromApi.internationalPhoneNumber, // APIのinternationalPhoneNumberをnationalPhoneNumberとして保存
            weekdayDescriptions: detailsFromApi.regularOpeningHours?.weekdayDescriptions,
            createdAt: now,
            updatedAt: now,
            isActive: true,
            category: "restaurant", 
          };
          await docRef.set(firestoreDocData);
          console.log(`[CACHE SAVE] Firestore: Saved '${detailsFromApi.name}' (ID: ${id}) to shinjuku-places.`);
          return detailsFromApi;
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


    console.log("Step 4: Running final AI analysis (selectAndAnalyzeBestRestaurants)...");
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
    if (e instanceof Error) {
        if (e.message.includes("permission-denied") || e.message.includes("PERMISSION_DENIED") || e.message.includes("7 PERMISSION_DENIED")) {
            errorMessage = "データベースへのアクセス権限がありません。Firebase Admin SDKのサービスアカウントキーの設定、またはFirestoreのセキュリティルールを確認してください。";
        } else if (e.message.includes("Could not load the default credentials")) {
            errorMessage = "Firebase Admin SDKのデフォルト認証情報を読み込めませんでした。サービスアカウントキーが正しく設定されているか、環境が適切に構成されているか確認してください。";
        }
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}

