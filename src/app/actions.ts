"use server";

import { filterRestaurantsForGroup } from "@/ai/flows/filter-restaurants";
import { FinalRecommendation, selectAndAnalyzeBestRestaurant } from "@/ai/flows/select-and-analyze";
import { type RestaurantCriteria } from "@/lib/schemas";
import { getRestaurantDetails, textSearchNew } from "@/services/google-places-service";

/**
 * フロントエンド（`RestaurantFinder.tsx`）から呼び出される、新しいロジックを実装したサーバーアクション
 */
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: FinalRecommendation; error?: string }> {
  try {
    // 1. Places API (Text Search - New) を使い、レビューサマリーを含む候補リストを取得する
    const searchResults = await textSearchNew(criteria);
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

    // 3. 絞り込んだ候補の詳細情報を並列で取得する
    const detailPromises = filteredPlaceIds.map(id => getRestaurantDetails(id));
    // Promise.allで並列実行し、結果がnullだったものは除外する
    const detailedCandidates = (await Promise.all(detailPromises)).filter(Boolean) as any[];

    if (detailedCandidates.length === 0) {
      return { error: "候補レストランの詳細情報の取得・分析に失敗しました。"};
    }

    // 4.【最終選定・分析AI】最も優れた1件をAIに選ばせ、その分析と推薦文を一度に生成させる
    const finalResult = await selectAndAnalyzeBestRestaurant({
      candidates: detailedCandidates,
      criteria: criteria,
    });
    
    // 5. 最終結果をフロントエンドに返す
    return { data: finalResult };

  } catch (e) {
    // 6. 処理中に何らかのエラーが発生した場合の処理
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