'use server';

import type { RestaurantCriteria } from "@/lib/schemas";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// --- 型定義 ---

export interface RestaurantDetails {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  reviewsText?: string;
  photoUrl?: string;
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
    reviewSummary?: { text: string };
  }[];
}

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

export async function textSearchNew(criteria: RestaurantCriteria): Promise<RestaurantCandidate[]> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.reviewSummary', // reviewSummary を使用
    },
    body: JSON.stringify({
      textQuery: `${criteria.cuisine} in ${criteria.location}`,
      languageCode: 'ja',
      maxResultCount: 10,
    }),
  });

  if (!response.ok) throw new Error(`Google Places API request failed with status ${response.status}`);
  const data: TextSearchApiResponse = await response.json();
  if (!data.places) return [];

  return data.places.map(place => ({
    id: place.id,
    name: place.displayName?.text || '名前不明',
    reviewSummary: place.reviewSummary?.text,
  }));
}

export async function getRestaurantDetails(placeId: string): Promise<Omit<RestaurantDetails, 'photoUrl'> | null> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');
  
  // ▼▼▼ 写真(photos)を除外してAPIコールを軽量化 ▼▼▼
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,reviews';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': fieldMask, 'Accept-Language': 'ja' }
    });

    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Google Places API request failed with status ${response.status}`);
    }

    const place: PlaceDetailsApiResponse = await response.json();

    const reviewsText = (place.reviews && place.reviews.length > 0)
      ? place.reviews.slice(0, 5).map(r => r.text?.text).filter(Boolean).join('\n\n---\n\n')
      : 'レビュー情報なし';

    return {
      id: place.id,
      name: place.displayName?.text || '名前不明',
      address: place.formattedAddress,
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      reviewsText: reviewsText,
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error;
  }
}

/**
 * 【新規追加】写真URLのみを取得する軽量な関数
 */
export async function getRestaurantPhotoUrl(placeId: string): Promise<string | undefined> {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    if (!GOOGLE_PLACES_API_KEY) return undefined;

    const fieldMask = 'photos'; // 写真情報のみをリクエスト

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': fieldMask }
        });
        if (!response.ok) return undefined;

        const place: PlaceDetailsApiResponse = await response.json();

        if (place.photos && place.photos.length > 0) {
            const photoResourceName = place.photos[0].name;
            return `https://places.googleapis.com/v1/${photoResourceName}/media?maxHeightPx=600&key=${GOOGLE_PLACES_API_KEY}`;
        }
        return undefined;
    } catch (error) {
        console.error(`Error getting photo for placeId ${placeId}:`, error);
        return undefined;
    }
}