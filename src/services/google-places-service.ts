'use server';

import type { RestaurantCriteria } from "@/lib/schemas";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// --- 型定義 ---

// アプリケーション全体で使う、整形後のレストラン詳細情報の型
export interface RestaurantDetails {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  reviewsText?: string;
  photoUrl?: string;
}

// Text Search (New) APIからのレスポンスを格納するための型
interface TextSearchApiResponse {
  places: {
    id: string;
    displayName?: { text: string; languageCode: string; };
    reviews?: {
      text?: { text: string; languageCode: string; };
      rating?: number;
    }[];
  }[];
}

// Place Details (New) API のレスポンス型
interface PlaceDetailsApiResponse {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: { text?: { text: string } }[];
    photos?: { name: string }[];
}


// --- 関数 ---

/**
 * Text Search (New) APIを呼び出し、整形済みのレストラン情報（概要）を返す関数
 * @param criteria ユーザーの検索条件
 * @returns 整形済みのレストラン候補の配列
 */
export async function textSearchNew(criteria: RestaurantCriteria): Promise<Partial<RestaurantDetails>[]> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.reviews,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: `${criteria.cuisine} in ${criteria.location}`,
      languageCode: 'ja',
      maxResultCount: 10,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Google Places API Error (searchText) (${response.status}): ${errorBody}`);
    throw new Error(`Google Places API request failed with status ${response.status}`);
  }

  const data: TextSearchApiResponse = await response.json();
  if (!data.places) {
    return [];
  }

  // APIからのレスポンスを、アプリ内で使いやすいRestaurantDetailsの形式に変換
  return data.places.map(place => ({
    id: place.id,
    name: place.displayName?.text || '名前不明',
    reviewsText: place.reviews?.map(r => r.text?.text).filter(Boolean).join('\n\n---\n\n'),
    rating: place.reviews?.[0]?.rating, // 簡易的な評価として最初のレビューの評価を使う
  }));
}

/**
 * Place Details (New) APIを呼び出し、整形済みのレストラン詳細情報を返す関数
 * @param placeId 場所のID
 * @returns 整形済みのレストラン詳細情報
 */
export async function getRestaurantDetails(placeId: string): Promise<RestaurantDetails | null> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }
  
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,reviews,photos';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
        'Accept-Language': 'ja',
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Google Places API Error (getDetails) (${response.status}): ${errorBody}`);
      if (response.status === 404) return null;
      throw new Error(`Google Places API request failed with status ${response.status}`);
    }

    const place: PlaceDetailsApiResponse = await response.json();

    const reviewsText = (place.reviews && place.reviews.length > 0)
      ? place.reviews.slice(0, 5).map(r => r.text?.text).filter(Boolean).join('\n\n---\n\n')
      : 'レビュー情報なし';

    let photoUrl: string | undefined = undefined;
    if (place.photos && place.photos.length > 0) {
      const photoResourceName = place.photos[0].name;
      photoUrl = `https://places.googleapis.com/v1/${photoResourceName}/media?maxHeightPx=600&key=${GOOGLE_PLACES_API_KEY}`;
    }

    return {
      id: place.id,
      name: place.displayName?.text || '名前不明',
      address: place.formattedAddress,
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      reviewsText: reviewsText,
      photoUrl: photoUrl,
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error;
  }
}