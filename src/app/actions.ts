
"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { getRestaurantDetails, getRestaurantPhotoUrl, RestaurantCandidate, RestaurantDetails } from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// フロントエンドに渡す、写真URLまで含んだ最終的な型
export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria; // Includes customPromptPersona and customPromptPriorities
    photoUrl?: string;
    placeId: string;
    websiteUri?: string;
    googleMapsUri?: string;
};

/**
 * フロントエンドから呼び出される、Firestoreキャッシュロジックを実装したサーバーアクション
 */
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria // Now includes customPromptPersona and customPromptPriorities
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    // criteria already contains custom prompts if provided by the user
    const criteriaForAI = {
        ...criteria,
        date: format(new Date(criteria.date), 'yyyy-MM-dd')
    };

    // 1. & 2. Places APIでの検索とAIによる一次フィルタリング
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

    // 3. 絞り込んだ候補の詳細情報を【Firestoreキャッシュ優先で】取得する
    console.log("Step 3: Fetching details for filtered candidates (cache-first strategy)...");
    const detailPromises = filteredPlaceIds.map(async (id) => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const cachedData = docSnap.data();
        console.log(`[CACHE HIT] Firestore: Fetched '${cachedData?.name}' (ID: ${id}) from shinjuku-places.`);
        // Ensure all fields including new ones are correctly typed and handled
        return { 
            ...(cachedData as RestaurantDetails), // Cast to ensure all fields are expected
            updatedAt: (cachedData?.updatedAt as unknown as Timestamp)?.toDate() 
        } as RestaurantDetails;

      } else {
        console.log(`[CACHE MISS] Firestore: No data for ID: ${id} in shinjuku-places. Fetching from API...`);
        const details = await getRestaurantDetails(id); // This now returns websiteUri and googleMapsUri
        if (details) {
          await docRef.set({
            ...details, // All fields from getRestaurantDetails, including new ones
            updatedAt: Timestamp.now(), 
          });
          console.log(`[CACHE SAVE] Firestore: Saved '${details.name}' (ID: ${id}) to shinjuku-places.`);
        }
        return details;
      }
    });

    const detailedCandidates = (await Promise.all(detailPromises)).filter((c): c is RestaurantDetails => c !== null);


    if (detailedCandidates.length === 0) {
      console.warn("Failed to get detailed information for any candidate.");
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }
    console.log(`Successfully fetched/retrieved details for ${detailedCandidates.length} candidates.`);

    // 4. AIによる最終選定と分析
    console.log("Step 4: Running final AI analysis on detailed candidates...");
    // Pass the full criteria (including custom prompts) to the AI flow
    const top3Analyses = await selectAndAnalyzeBestRestaurants({
      candidates: detailedCandidates,
      criteria: criteriaForAI, // criteriaForAI has date formatted and includes custom prompts
    });

    if (!top3Analyses || top3Analyses.length === 0) {
        console.warn("AI final selection resulted in no recommendations.");
        return { error: "AIによる最終候補の選定に失敗しました。" };
    }
    console.log(`AI selected ${top3Analyses.length} final recommendations.`);

    // 5. 写真URLの取得と最終結果の整形
    console.log("Step 5: Fetching photo URLs and formatting final results...");
    const finalResults: RecommendationResult[] = await Promise.all(
        top3Analyses.map(async (result) => {
            const correspondingCandidate = detailedCandidates.find(c => c.name === result.suggestion.restaurantName);
            const placeId = correspondingCandidate?.id;
            
            let photoUrl: string | undefined = undefined;
            if (placeId) {
                photoUrl = await getRestaurantPhotoUrl(placeId);
            }

            return {
                ...result,
                placeId: placeId || '', 
                criteria, // Original criteria (with Date object and custom prompts) is passed back
                photoUrl,
                websiteUri: correspondingCandidate?.websiteUri,
                googleMapsUri: correspondingCandidate?.googleMapsUri,
            };
        })
    );
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
