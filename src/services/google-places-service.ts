
// src/services/google-places-service.ts
'use server';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_LEGACY_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const PLACES_API_TEXT_SEARCH_NEW_URL = 'https://places.googleapis.com/v1/places:searchText';

// Interface for Place Details (Legacy) - remains mostly the same
interface LegacyPlaceDetails {
  place_id: string;
  name: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  photos?: { photo_reference: string }[];
  formatted_address?: string;
  reviews?: PlaceReview[];
  website?: string;
  formatted_phone_number?: string;
}

interface PlaceReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url?: string;
  time?: number;
}

interface PlaceDetailsResponseData {
  result: LegacyPlaceDetails;
  status: string;
  error_message?: string;
}


// Interface for Text Search (New)
interface NewPlace {
  id: string;
  displayName?: { text: string; languageCode: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  // Other fields can be added based on FieldMask
}

interface TextSearchNewResponseData {
  places?: NewPlace[];
  // Errors are typically handled via HTTP status codes and an error object in the response body
}

// Output structures remain the same for the application
export interface RestaurantSearchResult {
  id: string; // This will be place.id from New API
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
}

export interface RestaurantDetails extends RestaurantSearchResult {
  reviewsText?: string;
  photoUrl?: string;
}

async function fetchFromLegacyApi<T>(url: string): Promise<T> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Google Places Legacy API Error (${response.status}): ${errorBody}`);
    throw new Error(`Google Places Legacy API request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error(`Google Places Legacy API Error (${data.status}): ${data.error_message}`);
    throw new Error(data.error_message || `Google Places Legacy API returned status: ${data.status}`);
  }
  return data as T;
}

export async function findRestaurantsByCriteria(
  location: string,
  cuisine: string,
): Promise<RestaurantSearchResult[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }

  const query = `${cuisine} restaurant in ${location}`;
  // Define the fields you want to retrieve. This is crucial for the new API.
  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount';

  try {
    const response = await fetch(PLACES_API_TEXT_SEARCH_NEW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'ja', // Specify language
        includedType: 'restaurant', // Specify type
        maxResultCount: 10 // Optional: limit results
      }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // If response is not JSON or empty
        throw new Error(`Google Places API (New) request failed with status ${response.status}`);
      }
      console.error('Google Places API (New) Error:', errorData);
      throw new Error(errorData?.error?.message || `Google Places API (New) request failed with status ${response.status}`);
    }

    const data: TextSearchNewResponseData = await response.json();

    if (!data.places || data.places.length === 0) {
      return [];
    }

    return data.places.map(place => ({
      id: place.id,
      name: place.displayName?.text || '名前なし',
      address: place.formattedAddress,
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
    }));

  } catch (error) {
    console.error("Error in findRestaurantsByCriteria (New API):", error);
    // Ensure the re-thrown error is an Error instance
    if (error instanceof Error) {
        throw error;
    }
    throw new Error(String(error));
  }
}


export async function getRestaurantDetails(placeId: string): Promise<RestaurantDetails | null> {
  // New APIで取得したいフィールドをfieldMaskとして指定
  const fieldMask = 'id,displayName,formattedAddress,rating,userRatingCount,reviews,photos,websiteUri,nationalPhoneNumber';
  const url = `https://places.googleapis.com/v1/places/${placeId}`;

  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }

  try {
    // New APIでは、キーやフィールドマスクをヘッダーで渡すのが一般的
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask
      }
    });

    if (!response.ok) {
      let errorData;
      try {
          errorData = await response.json();
      } catch (e) {
          throw new Error(`Google Places API (Place Details New) request failed with status ${response.status}`);
      }
      console.error('Google Places API (Place Details New) Error:', errorData);
      throw new Error(errorData?.error?.message || `Google Places API (Place Details New) request failed with status ${response.status}`);
  }
    const place = await response.json();

    if (!place) {
      return null;
    }
    
    // レビューテキストを抽出（New APIのレスポンス構造に合わせる）
    const reviewsText = place.reviews?.slice(0, 5).map((r: any) => r.text?.text).join('\n\n---\n\n') || 'レビュー情報なし';
    
    let photoUrl: string | undefined = undefined;
    if (place.photos && place.photos.length > 0 && GOOGLE_PLACES_API_KEY) {
      // New APIの写真URL取得方法は少し異なる場合があるため要確認
      const photoReference = place.photos[0].name; // 例: "places/{place_id}/photos/{photo_resource_name}"
      // 正しい写真URLの構築方法はドキュメントを参照
      photoUrl = `https://places.googleapis.com/v1/${photoReference}/media?maxHeightPx=600&key=${GOOGLE_PLACES_API_KEY}`;
    }

    return {
      id: place.id,
      name: place.displayName?.text || '名前なし',
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