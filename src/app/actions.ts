
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import type { RestaurantCriteria } from "@/lib/schemas";
import {
    getRestaurantDetails,
    buildPhotoUrl,
    textSearchNew,
    // type RestaurantCandidate, // Now defined in google-places-service.ts
    type PlaceReview as ApiPlaceReview,
    type PlacePhoto as ApiPlacePhoto,
    type RestaurantDetails as ApiRestaurantDetails
} from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Firestoreに保存する際の型定義 (前回ユーザー様と合意した構造)
interface FirestorePlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
  // authorAttributionsは保存しない
}

interface FirestorePlaceReview {
  authorName?: string;
  languageCode?: string;
  publishTime?: string; // ISO string format for publish time
  rating: number;
  text?: string;
  // review.name (resource name) や relativePublishTimeDescription は保存しない
}

interface FirestoreRestaurantDetails {
  id: string;
  displayName: string; // name から変更
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  photos: FirestorePlacePhoto[]; // 構造変更
  reviews: FirestorePlaceReview[]; // 構造変更
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string; // internationalPhoneNumber から変更
  weekdayDescriptions?: string[]; // これは残す
  types?: string[];
  priceLevel?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
  category: string;
  // lastSyncAt, preview, subarea は含めない
}


export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria;
    photoUrl?: string;
    placeId: string;
    websiteUri?: string;
    googleMapsUri?: string;
    address?: string;
    rating?: number;
    userRatingsTotal?: number;
    types?: string[];
    priceLevel?: string;
};

// Helper function for scoring
const calculateRatingScore = (rating?: number): number => {
  if (rating === undefined || rating < 3.7) return 0;
  return ((rating - 3.7) / (5.0 - 3.7)) * 35;
};

const calculateReviewCountScore = (userRatingCount?: number): number => {
  if (userRatingCount === undefined || userRatingCount < 30) return 0;
  const score = ((userRatingCount - 30) / (300 - 30)) * 35;
  return Math.min(Math.max(score, 0), 35);
};

const calculateCategoryScore = (types?: string[]): number => {
  if (!types || types.length === 0) return 0;
  if (types.some(type => ["clothing_store", "electronics_store"].includes(type))) {
    return -50;
  }
  if (types.some(type => ["restaurant", "izakaya_restaurant", "food"].includes(type))) {
    return 30;
  }
  if (types.some(type => ["cafe", "coffee_shop", "bakery"].includes(type))) {
    return 15;
  }
  return 0;
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
    const { candidates: initialCandidates } = await textSearchNew(criteriaForAI);
    
    if (!initialCandidates || initialCandidates.length === 0) {
      console.warn(`No restaurants found for location: ${criteriaForAI.location}, cuisine: ${criteriaForAI.cuisine}`);
      return { error: `指定された条件に一致するレストランが見つかりませんでした。` };
    }
    console.log(`Found ${initialCandidates.length} initial candidates from Places API.`);

    // --- Review Summary Logging (can be removed after verification) ---
    // console.log("--- Review Summaries for AI Primary Filtering (initialCandidates) ---");
    // initialCandidates.forEach(candidate => {
    //   console.log(`ID: ${candidate.id}, Name: ${candidate.displayName?.text || 'N/A'}, Review Summary: ${candidate.reviewSummary || 'N/A'}`);
    // });
    // console.log("-----------------------------------------------------------------");
    // --- End Review Summary Logging ---


    console.log("Step 2: Applying mechanical filtering and scoring logic...");
    const unsuitableTypesForGroupDining = ["bar", "night_club", "shopping_mall", "department_store"];
    
    const scoredCandidates = initialCandidates
      .filter(candidate => { // Step A: 足切り
        if (!candidate.userRatingCount || candidate.userRatingCount < 30) return false;
        if (!candidate.rating || candidate.rating < 3.7) return false;
        if (candidate.types && candidate.types.some(type => unsuitableTypesForGroupDining.includes(type))) return false;
        return true;
      })
      .map(candidate => { // Step B: 品質スコア計算
        const ratingScore = calculateRatingScore(candidate.rating);
        const reviewCountScore = calculateReviewCountScore(candidate.userRatingCount);
        const categoryScore = calculateCategoryScore(candidate.types);
        const totalScore = ratingScore + reviewCountScore + categoryScore;
        return { ...candidate, totalScore, ratingScore, reviewCountScore, categoryScore };
      })
      .filter(candidate => candidate.totalScore >= 60); // Step C: 最終選定 (スコア60点以上)

    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

    console.log("--- Scored & Filtered Candidates (Top scores first) ---");
    scoredCandidates.forEach(c => {
        console.log(`ID: ${c.id}, Name: ${c.displayName}, Rating: ${c.rating}, Reviews: ${c.userRatingCount}, Types: ${c.types?.join(', ')}, Price: ${c.priceLevel}, Total Score: ${c.totalScore.toFixed(2)}`);
    });
    console.log("----------------------------------------------------");

    if (scoredCandidates.length === 0) {
      console.warn("Mechanical filtering logic resulted in no suitable restaurants.");
      return { error: "フィルタリング条件に合うお店が見つかりませんでした。条件を変えてお試しください。"};
    }
    console.log(`Mechanical filtering narrowed down to ${scoredCandidates.length} candidates.`);

    // 詳細情報取得の対象を上位5件に限定
    const topCandidatesForDetails = scoredCandidates.slice(0, 5);
    const filteredPlaceIds = topCandidatesForDetails.map(c => c.id);
    console.log(`Selected top ${filteredPlaceIds.length} candidates for fetching details.`);


    console.log("Step 3: Fetching details for top candidates (cache-first strategy)...");
    const detailedCandidatesPromises = filteredPlaceIds.map(async (id): Promise<ApiRestaurantDetails | null> => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const cachedData = docSnap.data() as FirestoreRestaurantDetails;
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.displayName}' (ID: ${id}) from shinjuku-places.`);
        // FirestoreのデータからApiRestaurantDetails型に変換
        // この変換は、Firestoreの型とAPIの型が完全に一致しない場合や、特定のフィールドを整形したい場合に役立つ
        return {
            id: cachedData.id,
            name: cachedData.displayName, // APIレスポンスの'name'フィールドに合わせる (select-and-analyzeが期待する形式)
            formattedAddress: cachedData.formattedAddress,
            rating: cachedData.rating,
            userRatingCount: cachedData.userRatingCount,
            photos: cachedData.photos.map(p => ({
                name: p.name,
                widthPx: p.widthPx,
                heightPx: p.heightPx,
                authorAttributions: [], // ApiPlacePhoto型に合わせるため空配列
            })),
            reviews: cachedData.reviews.map(r => ({
                // name: '', // APIのreview.name (resource name) はキャッシュにないので空
                // relativePublishTimeDescription: '', // キャッシュにないので空
                rating: r.rating,
                text: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined,
                originalText: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined,
                authorAttribution: r.authorName ? { displayName: r.authorName, uri:'', photoUri:''} : undefined, // displayNameのみ使用
                publishTime: r.publishTime, // ISO string
            })),
            websiteUri: cachedData.websiteUri,
            googleMapsUri: cachedData.googleMapsUri,
            internationalPhoneNumber: cachedData.nationalPhoneNumber, // nationalPhoneNumberをAPIのinternationalPhoneNumberフィールドにマッピング
            regularOpeningHours: cachedData.weekdayDescriptions ? { weekdayDescriptions: cachedData.weekdayDescriptions } : undefined,
            types: cachedData.types,
            priceLevel: cachedData.priceLevel,
        };
      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const detailsFromApi = await getRestaurantDetails(id); // APIから詳細取得
        if (detailsFromApi) {
          const now = Timestamp.now();
          // APIレスポンス (ApiRestaurantDetails) から FirestoreRestaurantDetails 構造にマッピング
          const firestoreDocData: FirestoreRestaurantDetails = {
            id: detailsFromApi.id,
            displayName: detailsFromApi.name, // APIのnameをdisplayNameとして保存
            formattedAddress: detailsFromApi.formattedAddress,
            rating: detailsFromApi.rating,
            userRatingCount: detailsFromApi.userRatingCount,
            photos: (detailsFromApi.photos || []).map((p: ApiPlacePhoto) => ({ // 構造変更
              name: p.name,
              widthPx: p.widthPx,
              heightPx: p.heightPx,
            })),
            reviews: (detailsFromApi.reviews || []).map((r: ApiPlaceReview) => ({ // 構造変更
              authorName: r.authorAttribution?.displayName,
              languageCode: r.text?.languageCode,
              publishTime: r.publishTime, // ISO string
              rating: r.rating,
              text: r.text?.text,
            })),
            websiteUri: detailsFromApi.websiteUri,
            googleMapsUri: detailsFromApi.googleMapsUri,
            nationalPhoneNumber: detailsFromApi.internationalPhoneNumber, // APIのinternationalPhoneNumberをnationalPhoneNumberとして保存
            weekdayDescriptions: detailsFromApi.regularOpeningHours?.weekdayDescriptions,
            types: detailsFromApi.types,
            priceLevel: detailsFromApi.priceLevel,
            createdAt: now,
            updatedAt: now,
            isActive: true,
            category: "restaurant", // 固定カテゴリ
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

        return { // select-and-analyze.tsのCandidateForAISchemaに合わせる
            id: candidate.id,
            name: candidate.name, // AIフローは 'name' を期待している
            reviewsText: reviewsText,
            address: candidate.formattedAddress,
            rating: candidate.rating,
            userRatingsTotal: candidate.userRatingCount,
            websiteUri: candidate.websiteUri,
            googleMapsUri: candidate.googleMapsUri,
            types: candidate.types,
            priceLevel: candidate.priceLevel,
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

        // AIが選んだplaceIdに対応する元の詳細情報をdetailedCandidatesFromSourceから見つける
        const correspondingCandidate = detailedCandidatesFromSource.find(c => c.id === llmSelectionPlaceId);

        if (!correspondingCandidate) {
            console.warn(`Could not find original candidate details for placeId: ${llmSelectionPlaceId} (Restaurant: ${result.suggestion.restaurantName}). Skipping this recommendation.`);
            continue;
        }

        let photoUrl: string | undefined = undefined;
        // correspondingCandidate.photos (ApiPlacePhoto[]) を使用してphotoUrlを構築
        if (correspondingCandidate.photos && correspondingCandidate.photos.length > 0 && correspondingCandidate.photos[0].name) {
            photoUrl = await buildPhotoUrl(correspondingCandidate.photos[0].name);
        }

        finalResults.push({
            ...result, // AIの推薦理由と分析結果
            placeId: correspondingCandidate.id, // 確実なplaceId
            criteria, // 元の検索条件
            photoUrl,
            // correspondingCandidate (ApiRestaurantDetails) から他の情報を取得
            websiteUri: correspondingCandidate.websiteUri,
            googleMapsUri: correspondingCandidate.googleMapsUri,
            address: correspondingCandidate.formattedAddress,
            rating: correspondingCandidate.rating,
            userRatingsTotal: correspondingCandidate.userRatingCount,
            types: correspondingCandidate.types,
            priceLevel: correspondingCandidate.priceLevel,
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
    