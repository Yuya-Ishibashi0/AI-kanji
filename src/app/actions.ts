"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { getRestaurantDetails, getRestaurantPhotoUrl, textSearchNew, RestaurantCandidate, RestaurantDetails } from "@/services/google-places-service";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin"; // ★ Admin SDKをインポート
import { Timestamp } from "firebase-admin/firestore"; // ★ サーバーサイドのタイムスタンプ

// フロントエンドに渡す、写真URLまで含んだ最終的な型
export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria;
    photoUrl?: string;
    placeId: string;
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

    // 1. & 2. Places APIでの検索とAIによる一次フィルタリング (変更なし)
    const searchResults: RestaurantCandidate[] = await textSearchNew(criteriaForAI);
    if (!searchResults || searchResults.length === 0) {
      return { error: `指定された条件（場所: ${criteriaForAI.location}, 料理: ${criteriaForAI.cuisine}）に一致するレストランが見つかりませんでした。` };
    }

    const filteredPlaceIds = await filterRestaurantsForGroup({
      restaurants: searchResults,
      criteria: criteriaForAI,
    });
    
    if (!filteredPlaceIds || filteredPlaceIds.length === 0) {
      return { error: "AIによる一次判定で、グループ向けのお店が見つかりませんでした。条件を変えてお試しください。"};
    }

    // ★★★ここからが変更箇所★★★
    // 3. 絞り込んだ候補の詳細情報を【Firestoreキャッシュ優先で】取得する
    console.log("Fetching details with cache-first strategy...");
    const detailPromises = filteredPlaceIds.map(async (id) => {
      const docRef = adminDb.collection("shinjuku-places").doc(id);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        // 【キャッシュヒット】
        console.log(`Cache HIT for placeId: ${id}`);
        // FirestoreのデータをRestaurantDetails型に変換
        const cachedData = docSnap.data();
        // FirestoreのTimestampをDateオブジェクトに変換してから利用する
        // 必要に応じて他のフィールドも型変換
        return { ...cachedData, updatedAt: cachedData.updatedAt.toDate() } as RestaurantDetails;

      } else {
        // 【キャッシュミス】
        console.log(`Cache MISS for placeId: ${id}. Fetching from API...`);
        const details = await getRestaurantDetails(id);
        if (details) {
          // Firestoreに保存（キャッシュ）する
          // DBにはサーバーのタイムスタンプを保存する
          await docRef.set({
            ...details,
            updatedAt: Timestamp.now(), // サーバーサイドの現在時刻を保存
          });
          console.log(`Saved new data to Firestore for placeId: ${id}`);
        }
        return details;
      }
    });
    // ★★★ここまでが変更箇所★★★

    const detailedCandidates = (await Promise.all(detailPromises)).filter((c): c is NonNullable<typeof c> => c !== null);

    if (detailedCandidates.length === 0) {
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }

    // 4. 以降の処理は変更なし
    console.log("Running final analysis on detailed candidates...");
    const top3Analyses = await selectAndAnalyzeBestRestaurants({
      candidates: detailedCandidates,
      criteria: criteriaForAI,
    });

    if (!top3Analyses || top3Analyses.length === 0) {
        return { error: "AIによる最終候補の選定に失敗しました。" };
    }

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
                criteria,
                photoUrl,
            };
        })
    );

    return { data: finalResults };

  } catch (e) {
    console.error("Error in getRestaurantSuggestion:", e);
    let errorMessage = e instanceof Error ? e.message : "AIの処理またはGoogle Places APIの呼び出し中に不明なエラーが発生しました。";
    if (errorMessage.includes("permission-denied") || errorMessage.includes("PERMISSION_DENIED")) {
        errorMessage = "データベースへの書き込み権限がありません。Firebase Admin SDKのサービスアカウントキーの設定を確認してください。";
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}