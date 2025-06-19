
'use server';

import type { RestaurantCriteria } from "@/lib/schemas";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// --- 型定義 ---

export interface PlacePhoto { // Firestore保存用と区別するため、APIレスポンスの型であることを明確にする
  name: string; 
  widthPx: number;
  heightPx: number;
  authorAttributions: {
    displayName: string;
    uri: string;
    photoUri: string;
  }[];
}

export interface PlaceReview { // Firestore保存用と区別するため、APIレスポンスの型であることを明確にする
  name?: string; 
  relativePublishTimeDescription?: string; 
  rating: number; 
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
  publishTime?: string; // ISO 8601 string for date
}

export interface RestaurantDetails {
  id: string;
  name: string; // APIからは displayName.text で取得
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number; 
  photos?: PlacePhoto[];
  reviews?: PlaceReview[];
  websiteUri?: string;
  googleMapsUri?: string;
  internationalPhoneNumber?: string; // APIからは internationalPhoneNumber
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
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

interface PlaceDetailsApiResponse { // APIのレスポンス構造に寄せる
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: PlaceReview[]; 
    photos?: PlacePhoto[];   
    websiteUri?: string;
    googleMapsUri?: string;
    internationalPhoneNumber?: string;
    regularOpeningHours?: {
      openNow?: boolean;
      weekdayDescriptions?: string[];
      secondaryOpeningHours?: any[]; 
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
      'X-Goog-FieldMask': 'places.id,places.displayName,places.reviewSummary',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ja',
      maxResultCount: 20, // 10件から20件に増やす
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
  
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,photos,reviews,websiteUri,googleMapsUri,internationalPhoneNumber,regularOpeningHours.weekdayDescriptions';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 
        'X-Goog-FieldMask': fieldMask, 
        'Accept-Language': 'ja' 
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
      reviews: place.reviews, 
      websiteUri: place.websiteUri,
      googleMapsUri: place.googleMapsUri,
      internationalPhoneNumber: place.internationalPhoneNumber,
      regularOpeningHours: place.regularOpeningHours ? { 
        weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions,
      } : undefined,
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error; 
  }
}

/**
 * 写真リソース名から完全な写真URLを生成する。
 * @param photoName 写真リソース名 (例: "places/.../photos/...")
 * @param maxHeightPx 写真の最大高さ（ピクセル）
 * @returns 写真の完全なURL、または photoName がない場合は undefined
 */
export async function buildPhotoUrl(photoName?: string, maxHeightPx: number = 600): Promise<string | undefined> {
    if (!photoName || !GOOGLE_PLACES_API_KEY) {
        return undefined;
    }
    return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeightPx}&key=${GOOGLE_PLACES_API_KEY}`;
}

