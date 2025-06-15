"use server";

import { FinalOutput, selectAndAnalyzeBestRestaurants } from "@/ai/flows/select-and-analyze";
import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import { type RestaurantCriteria } from "@/lib/schemas";
import { getRestaurantDetails, getRestaurantPhotoUrl, textSearchNew, RestaurantCandidate } from "@/services/google-places-service";

// フロントエンドに渡す、写真URLまで含んだ最終的な型
export type RecommendationResult = FinalOutput[number] & {
    criteria: RestaurantCriteria;
    photoUrl?: string;
    placeId: string; // フロントエンドでのkeyなどに使うためIDを追加
};

/**
 * フロントエンドから呼び出される、新しいロジックを実装したサーバーアクション
 */
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> { // 返り値の型を配列に変更
  try {
    // 1. Places API (Text Search - New) を使い、レビューサマリーを含む候補リストを取得する
    const searchResults: RestaurantCandidate[] = await textSearchNew(criteria);
    if (!searchResults || searchResults.length === 0) {
      return { error: `指定された条件（場所: ${criteria.location}, 料理: ${criteria.cuisine}）に一致するレストランが見つかりませんでした。` };
    }

    // 2.【一次判定AI】レビューサマリーを基に、グループ利用に適したレストランを5件まで絞り込む
    const filteredPlaceIds = await filterRestaurantsForGroup({
      restaurants: searchResults,
      criteria: criteria,
    });
    
    if (!filteredPlaceIds || filteredPlaceIds.length === 0) {
      return { error: "AIによる一次判定で、グループ向けのお店が見つかりませんでした。条件を変えてお試しください。"};
    }

    // 3. 絞り込んだ候補の詳細情報を並列で取得する (写真抜き)
    const detailPromises = filteredPlaceIds.map(id => getRestaurantDetails(id));
    const detailedCandidates = (await Promise.all(detailPromises)).filter(Boolean); // nullを除外

    if (detailedCandidates.length === 0) {
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }

    // 4.【最終選定・分析AI】最も優れた候補をAIに【3件】選ばせ、分析と推薦文を生成させる
    const top3Analyses = await selectAndAnalyzeBestRestaurants({ // 複数件取得するフローを呼び出し
      candidates: detailedCandidates,
      criteria: criteria,
    });

    if (!top3Analyses || top3Analyses.length === 0) {
        return { error: "AIによる最終候補の選定に失敗しました。"}
    }

    // 5.【写真情報の追加取得】AIが選んだ3件のレストランの写真URLを効率的に取得
    const finalResults: RecommendationResult[] = await Promise.all(
        top3Analyses.map(async (result) => {
            // AIの分析結果からplaceIdを見つける (candidatesからnameで検索)
            const correspondingCandidate = detailedCandidates.find(c => c.name === result.suggestion.restaurantName);
            const placeId = correspondingCandidate?.id;
            
            let photoUrl: string | undefined = undefined;
            if (placeId) {
                photoUrl = await getRestaurantPhotoUrl(placeId);
            }

            return {
                ...result,
                placeId: placeId || '', // keyとして利用するためにIDを付与
                criteria,
                photoUrl,
            };
        })
    );

    // 6. 最終結果(3件分の配列)をフロントエンドに返す
    return { data: finalResults };

  } catch (e) {
    // 7. 処理中に何らかのエラーが発生した場合の処理
    console.error("Error in getRestaurantSuggestion:", e);
    // エラー内容に応じてユーザーフレンドリーなメッセージに変換
    let errorMessage = e instanceof Error ? e.message : "AIの処理またはGoogle Places APIの呼び出し中に不明なエラーが発生しました。";
    if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        errorMessage = "Google Places APIキーが無効です。設定を確認してください。";
    } else if (errorMessage.includes("Quota exceeded") || errorMessage.includes("OVER_QUERY_LIMIT")) {
        errorMessage = "Google Places APIの利用上限を超えました。しばらくしてから再試行するか、利用枠を確認してください。";
    } else if (errorMessage.includes("REQUEST_DENIED")) {
        errorMessage = "Google Places APIへのリクエストが拒否されました。APIキーや設定、利用規約を確認してください。";
    } else if (errorMessage.includes("deadline")) {
       errorMessage = "AIまたは外部APIの応答時間が長すぎました。しばらくしてからもう一度お試しください。";
    }
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}