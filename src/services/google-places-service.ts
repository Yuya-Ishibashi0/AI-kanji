
'use server';

import type { RestaurantCriteria } from "@/lib/schemas";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// --- 型定義 ---

interface PlacePhoto {
  name: string; // 例: "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/AUacShiMW5N42k3C7g73571fHw94qlZNBGPhIL6Yg888Qx0qS9G2B7VBE_XILnSsR_nLhIHV2hP0L4Y2Kkua-xMvSQzciH_R7M9V5SgX0j0k3WpC6P8eKkua-xMvSQzciH_R7M9V5SgX0j0k3WpC6P8e"
  widthPx: number;
  heightPx: number;
  authorAttributions: {
    displayName: string;
    uri: string;
    photoUri: string;
  }[];
}

interface PlaceReview {
  name: string; // 例: "places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews/AUacShiMW5N42k3C7g73571fHw94qlZNBGPhIL6Yg888Qx0qS9G2B7VBE_XILnSsR_nLhIHV2hP0L4Y2Kkua-xMvSQzciH_R7M9V5SgX0j0k3WpC6P8e"
  relativePublishTimeDescription: string; // 例: "a week ago"
  rating: number; // 1-5
  text?: {
    text: string;
    languageCode: string;
  };
  originalText?: {
    text: string;
    languageCode: string;
  };
  authorAttribution?: {
    displayName: string;
    uri: string;
    photoUri: string;
  };
}

export interface RestaurantDetails {
  id: string;
  name: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number; // Firestoreでは userRatingsTotal
  photos?: PlacePhoto[];
  reviews?: PlaceReview[];
  websiteUri?: string;
  googleMapsUri?: string;
  internationalPhoneNumber?: string; // Firestoreでは nationalPhoneNumber
  regularOpeningHours?: {
    weekdayDescriptions?: string[]; // Firestoreでは weekdayDescriptions
  };
  // Firestoreの独自フィールドは actions.ts で付与
}

export interface RestaurantCandidate {
    id: string;
    name: string;
    reviewSummary?: string;
}

interface TextSearchApiResponse {
  places: {
    id: string;
    displayName?: { text: string };
    // editorialSummaryはより質の高い要約だが、reviewSummaryがなければこちらを使うことも検討
    // editorialSummary?: { text: string; languageCode: string };
    reviewSummary?: { text: string }; // 'reviews'フィールドがない場合のフォールバック
  }[];
}

interface PlaceDetailsApiResponse {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: PlaceReview[]; // APIから直接この形で取得
    photos?: PlacePhoto[];   // APIから直接この形で取得
    websiteUri?: string;
    googleMapsUri?: string;
    internationalPhoneNumber?: string;
    regularOpeningHours?: {
      openNow?: boolean;
      weekdayDescriptions?: string[];
      secondaryOpeningHours?: any[]; // 必要なら詳細定義
    };
}

// --- 関数 ---

export async function textSearchNew(criteria: RestaurantCriteria): Promise<RestaurantCandidate[]> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');

  let query = `${criteria.cuisine} in ${criteria.location}`;
  if (criteria.privateRoomRequested) {
    query += " 個室";
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      // displayName, id, reviewSummaryを取得
      'X-Goog-FieldMask': 'places.id,places.displayName,places.reviewSummary',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ja',
      maxResultCount: 10, // 最初のフィルタリング候補なので10件程度
    }),
  });

  if (!response.ok) throw new Error(`Google Places API (searchText) request failed with status ${response.status}`);
  const data: TextSearchApiResponse = await response.json();
  if (!data.places) return [];

  return data.places.map(place => ({
    id: place.id,
    name: place.displayName?.text || '名前不明',
    reviewSummary: place.reviewSummary?.text,
  }));
}

export async function getRestaurantDetails(placeId: string): Promise<RestaurantDetails | null> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');
  
  // 必要なフィールドを網羅的に指定
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,photos,reviews,websiteUri,googleMapsUri,internationalPhoneNumber,regularOpeningHours.weekdayDescriptions';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 
        'X-Goog-FieldMask': fieldMask, 
        'Accept-Language': 'ja' // レビューなどを日本語で取得
      }
    });

    if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Restaurant with placeId ${placeId} not found (404).`);
          return null;
        }
        throw new Error(`Google Places API (getDetails) request failed with status ${response.status} for placeId ${placeId}`);
    }

    const place: PlaceDetailsApiResponse = await response.json();

    return {
      id: place.id,
      name: place.displayName?.text || '名前不明',
      formattedAddress: place.formattedAddress,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      photos: place.photos,
      reviews: place.reviews, // APIから取得したレビュー配列をそのまま渡す
      websiteUri: place.websiteUri,
      googleMapsUri: place.googleMapsUri,
      internationalPhoneNumber: place.internationalPhoneNumber,
      regularOpeningHours: place.regularOpeningHours ? { // regularOpeningHoursが存在する場合のみ
        weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions,
      } : undefined,
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error; // エラーを再スローして呼び出し元で処理
  }
}

/**
 * 写真リソース名から完全な写真URLを生成する。
 * @param photoName 写真リソース名 (例: "places/.../photos/...")
 * @param maxHeightPx 写真の最大高さ（ピクセル）
 * @returns 写真の完全なURL、または photoName がない場合は undefined
 */
export function buildPhotoUrl(photoName?: string, maxHeightPx: number = 600): string | undefined {
    if (!photoName || !GOOGLE_PLACES_API_KEY) {
        return undefined;
    }
    return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeightPx}&key=${GOOGLE_PLACES_API_KEY}`;
}
