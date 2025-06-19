
'use server';

import type { RestaurantCriteria } from "@/lib/schemas";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// --- 型定義 ---

export interface PlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions: {
    displayName: string;
    uri: string;
    photoUri: string;
  }[];
}

export interface PlaceReview {
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
  publishTime?: string; 
}

export interface RestaurantDetails {
  id: string;
  name: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  photos?: PlacePhoto[];
  reviews?: PlaceReview[];
  websiteUri?: string;
  googleMapsUri?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  types?: string[];
  priceLevel?: string; // priceLevelは通常文字列 (PRICE_LEVEL_UNSPECIFIED, PRICE_LEVEL_FREE, PRICE_LEVEL_INEXPENSIVE, etc.)
}

// textSearchNewから返される候補の型
export interface RestaurantCandidate {
  id: string;
  displayName: string;
  formattedAddress?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
}

interface TextSearchApiResponsePlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string; 
}

interface TextSearchApiResponse {
  places: TextSearchApiResponsePlace[];
  nextPageToken?: string;
}


interface PlaceDetailsApiResponse {
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
    types?: string[];
    priceLevel?: string;
}

const EXCLUDE_KEYWORDS_FOR_GROUP_DINING = [
  "カウンターのみ", "立ち飲み", "席が少ない", "狭い", "小さい店",
  "一人", "少人数", "2〜3人", "4人まで", "6人まで",
  "バー", "スナック", "パブ", "クラブ", "ラーメン", "うどん", "そば", "テイクアウト専門"
];

export async function textSearchNew(criteria: RestaurantCriteria, pageToken?: string): Promise<{ candidates: RestaurantCandidate[], nextPageToken?: string }> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');

  let query = `${criteria.location} ${criteria.cuisine} 団体 グループ`;
  if (criteria.privateRoomRequested) {
    query += " 個室";
  }
  EXCLUDE_KEYWORDS_FOR_GROUP_DINING.forEach(keyword => {
    query += ` -${keyword}`;
  });

  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.priceLevel';
  
  const requestBody: any = {
    textQuery: query,
    languageCode: 'ja', // APIリクエスト時に言語を指定
    maxResultCount: 20,
  };
  if (pageToken) {
    requestBody.pageToken = pageToken;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) throw new Error(`Google Places API (searchText) request failed with status ${response.status}`);
  const data: TextSearchApiResponse = await response.json();
  
  const candidates = data.places ? data.places.map(place => ({
    id: place.id,
    displayName: place.displayName?.text || '名前不明',
    formattedAddress: place.formattedAddress,
    types: place.types,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel
  })) : [];

  return { candidates, nextPageToken: data.nextPageToken };
}


export async function getRestaurantDetails(placeId: string): Promise<RestaurantDetails | null> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  if (!GOOGLE_PLACES_API_KEY) throw new Error('Google Places API key is not configured.');
  
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,photos,reviews,websiteUri,googleMapsUri,internationalPhoneNumber,regularOpeningHours.weekdayDescriptions,types,priceLevel';

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
      types: place.types,
      priceLevel: place.priceLevel,
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error;
  }
}

export async function buildPhotoUrl(photoName?: string, maxHeightPx: number = 600): Promise<string | undefined> {
    if (!photoName || !GOOGLE_PLACES_API_KEY) {
        return undefined;
    }
    return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeightPx}&key=${GOOGLE_PLACES_API_KEY}`;
}
