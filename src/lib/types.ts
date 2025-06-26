// リテラル型の定義
export type PriceLevel = 
  | 'PRICE_LEVEL_FREE'
  | 'PRICE_LEVEL_INEXPENSIVE' 
  | 'PRICE_LEVEL_MODERATE'
  | 'PRICE_LEVEL_EXPENSIVE'
  | 'PRICE_LEVEL_VERY_EXPENSIVE';

export type PlaceType = 
  | 'restaurant'
  | 'bar'
  | 'cafe'
  | 'meal_takeaway'
  | 'night_club'
  | 'food';

export type LanguageCode = 'ja' | 'en';


// --- PlacePhoto型 ---
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
  
  // --- PlaceReview型 ---
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
  
// Google Places API リクエスト型
export interface SearchTextRequest {
  textQuery: string;
  languageCode: LanguageCode;
  maxResultCount: number;
  pageToken?: string;
}

export interface PlaceDetailsRequest {
  placeId: string;
  languageCode?: LanguageCode;
  fields: readonly string[];
}

// レスポンス型の厳密化
export interface GooglePlacesResponse<T> {
  readonly places?: readonly T[];
  readonly nextPageToken?: string;
  readonly status?: 'OK' | 'ZERO_RESULTS' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST';
  readonly error_message?: string;
}

// より厳密なレストラン型
export interface StrictRestaurantDetails {
  readonly id: string;
  readonly name: string;
  readonly formattedAddress?: string;
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly photos?: readonly PlacePhoto[];
  readonly reviews?: readonly PlaceReview[];
  readonly websiteUri?: string;
  readonly googleMapsUri?: string;
  readonly types?: readonly PlaceType[];
  readonly priceLevel?: PriceLevel;
}

// 型ガード関数
export function isPriceLevel(value: unknown): value is PriceLevel {
  return typeof value === 'string' && [
    'PRICE_LEVEL_FREE',
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE'
  ].includes(value as PriceLevel);
}

export function isPlaceType(value: unknown): value is PlaceType {
  return typeof value === 'string' && [
    'restaurant', 'bar', 'cafe', 'meal_takeaway', 'night_club', 'food'
  ].includes(value as PlaceType);
}

export function isValidResponse<T>(response: unknown): response is GooglePlacesResponse<T> {
  return typeof response === 'object' && response !== null;
}