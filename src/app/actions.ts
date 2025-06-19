
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import type { RestaurantCriteria } from "@/lib/schemas";
import {
    getRestaurantDetails,
    buildPhotoUrl,
    textSearchNew,
    type RestaurantCandidate, // Updated by textSearchNew
    type PlaceReview as ApiPlaceReview,
    type PlacePhoto as ApiPlacePhoto,
    type RestaurantDetails as ApiRestaurantDetails
} from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

interface FirestorePlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

interface FirestorePlaceReview {
  authorName?: string;
  languageCode?: string;
  publishTime?: string;
  rating: number;
  text?: string;
}

interface FirestoreRestaurantDetails {
  id: string;
  displayName: string; // Changed from name
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  photos: FirestorePlacePhoto[];
  reviews: FirestorePlaceReview[];
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string; // Changed from internationalPhoneNumber
  weekdayDescriptions?: string[];
  types?: string[];
  priceLevel?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
  category: string;
}

export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria;
    photoUrl?: string;
    placeId: string;
    websiteUri?: string;
    googleMapsUri?: string;
    address?: string;
    rating?: number;
    userRatingsTotal?: number; // Keep this for frontend display consistency
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
  // 30件を0点、300件以上を35点とする線形スケーリング
  // (count - minCount) / (maxCountForFullScore - minCount) * maxScore
  const score = ((userRatingCount - 30) / (300 - 30)) * 35;
  return Math.min(Math.max(score, 0), 35); // 0-35点に収める
};

const calculateCategoryScore = (types?: string[]): number => {
  if (!types || types.length === 0) return 0;
  if (types.some(type => ["clothing_store", "electronics_store"].includes(type))) {
    return -50; // 事実上の除外
  }
  if (types.some(type => ["restaurant", "izakaya_restaurant", "food"].includes(type))) { // "food" も食事処として一般的
    return 30;
  }
  if (types.some(type => ["cafe", "coffee_shop", "bakery"].includes(type))) { // "bakery" も軽食として考慮
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

    console.log("Step 1: Starting Places API search (textSearchNew with new fields & query)...");
    // textSearchNew now returns an object { candidates: RestaurantCandidate[], nextPageToken?: string }
    const { candidates: initialCandidates } = await textSearchNew(criteriaForAI); 
    
    if (!initialCandidates || initialCandidates.length === 0) {
      console.warn(`No restaurants found for location: ${criteriaForAI.location}, cuisine: ${criteriaForAI.cuisine}`);
      return { error: `指定された条件に一致するレストランが見つかりませんでした。` };
    }
    console.log(`Found ${initialCandidates.length} initial candidates from Places API.`);

    console.log("Step 2: Applying new mechanical filtering logic...");
    const unsuitableTypesForGroupDining = ["bar", "night_club", "shopping_mall", "department_store"];
    
    const scoredCandidates = initialCandidates
      .filter(candidate => { // Step A: 足切り
        if ((candidate.userRatingCount || 0) < 30) return false;
        if ((candidate.rating || 0) < 3.7) return false;
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

    // スコアで降順ソート
    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

    // ログでスコアを確認
    console.log("--- Scored & Filtered Candidates (Top scores first) ---");
    scoredCandidates.forEach(c => {
        console.log(`ID: ${c.id}, Name: ${c.displayName}, Rating: ${c.rating}, Reviews: ${c.userRatingCount}, Types: ${c.types?.join(', ')}, Price: ${c.priceLevel}, Total Score: ${c.totalScore.toFixed(2)} (Rating: ${c.ratingScore.toFixed(2)}, ReviewCount: ${c.reviewCountScore.toFixed(2)}, Category: ${c.categoryScore.toFixed(2)})`);
    });
    console.log("----------------------------------------------------");


    if (scoredCandidates.length === 0) {
      console.warn("New filtering logic resulted in no suitable restaurants.");
      return { error: "新しいフィルタリング条件に合うお店が見つかりませんでした。条件を変えてお試しください。"};
    }
    console.log(`New filtering logic narrowed down to ${scoredCandidates.length} candidates.`);

    const filteredPlaceIds = scoredCandidates.map(c => c.id); // このIDリストで詳細を取得


    console.log("Step 3: Fetching details for filtered candidates (cache-first strategy)...");
    const detailedCandidatesPromises = filteredPlaceIds.map(async (id): Promise<ApiRestaurantDetails | null> => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const cachedData = docSnap.data() as FirestoreRestaurantDetails;
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.displayName}' (ID: ${id}) from shinjuku-places.`);
        // FirestoreのデータからApiRestaurantDetails型に変換
        return {
            id: cachedData.id,
            name: cachedData.displayName,
            formattedAddress: cachedData.formattedAddress,
            rating: cachedData.rating,
            userRatingCount: cachedData.userRatingCount,
            photos: cachedData.photos.map(p => ({
                name: p.name,
                widthPx: p.widthPx,
                heightPx: p.heightPx,
                authorAttributions: [], // Not stored in Firestore, provide empty
            })),
            reviews: cachedData.reviews.map(r => ({
                name: '', // Not stored
                relativePublishTimeDescription: '', // Not stored
                rating: r.rating,
                text: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined,
                originalText: r.text ? { text: r.text, languageCode: r.languageCode || 'ja' } : undefined,
                authorAttribution: r.authorName ? { displayName: r.authorName, uri:'', photoUri:''} : undefined,
                publishTime: r.publishTime,
            })),
            websiteUri: cachedData.websiteUri,
            googleMapsUri: cachedData.googleMapsUri,
            internationalPhoneNumber: cachedData.nationalPhoneNumber, // Use nationalPhoneNumber from Firestore
            regularOpeningHours: cachedData.weekdayDescriptions ? { weekdayDescriptions: cachedData.weekdayDescriptions } : undefined,
            types: cachedData.types,
            priceLevel: cachedData.priceLevel,
        };
      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const detailsFromApi = await getRestaurantDetails(id);
        if (detailsFromApi) {
          const now = Timestamp.now();
          const firestoreDocData: FirestoreRestaurantDetails = {
            id: detailsFromApi.id,
            displayName: detailsFromApi.name, 
            formattedAddress: detailsFromApi.formattedAddress,
            rating: detailsFromApi.rating,
            userRatingCount: detailsFromApi.userRatingCount,
            photos: (detailsFromApi.photos || []).map((p: ApiPlacePhoto) => ({
              name: p.name,
              widthPx: p.widthPx,
              heightPx: p.heightPx,
              // authorAttributions は保存しない
            })),
            reviews: (detailsFromApi.reviews || []).map((r: ApiPlaceReview) => ({
              authorName: r.authorAttribution?.displayName,
              languageCode: r.text?.languageCode,
              publishTime: r.publishTime,
              rating: r.rating,
              text: r.text?.text,
            })),
            websiteUri: detailsFromApi.websiteUri,
            googleMapsUri: detailsFromApi.googleMapsUri,
            nationalPhoneNumber: detailsFromApi.internationalPhoneNumber,
            weekdayDescriptions: detailsFromApi.regularOpeningHours?.weekdayDescriptions,
            types: detailsFromApi.types,
            priceLevel: detailsFromApi.priceLevel,
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
            reviewsText: reviewsText, // This will be used by selectAndAnalyze
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
      candidates: candidatesForAI, // Pass new candidate structure
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
            criteria, // original criteria
            photoUrl,
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
