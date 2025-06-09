// src/services/google-places-service.ts
'use server';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

interface Place {
  place_id: string;
  name: string;
  vicinity?: string; // Address or general area
  rating?: number;
  user_ratings_total?: number;
  photos?: { photo_reference: string }[];
}

interface TextSearchResponseData {
  results: Place[];
  status: string;
  error_message?: string;
  next_page_token?: string;
}

interface PlaceDetailsResponseData {
  result: PlaceDetails;
  status: string;
  error_message?: string;
}

interface PlaceDetails extends Place {
  formatted_address?: string;
  reviews?: PlaceReview[];
  website?: string;
  formatted_phone_number?: string;
  // Add other details you might need
}

interface PlaceReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url?: string; // URL of the reviewer's profile photo
  time?: number; // Timestamp of the review
}


export interface RestaurantSearchResult {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
}

export interface RestaurantDetails extends RestaurantSearchResult {
  reviewsText?: string; // Combined text of some reviews
  photoUrl?: string;
  // Potentially more fields like website, phone number
}

async function fetchFromApi<T>(url: string): Promise<T> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Google Places API Error (${response.status}): ${errorBody}`);
    throw new Error(`Google Places API request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error(`Google Places API Error (${data.status}): ${data.error_message}`);
    throw new Error(data.error_message || `Google Places API returned status: ${data.status}`);
  }
  return data as T;
}

export async function findRestaurantsByCriteria(
  location: string,
  cuisine: string,
  // Add other criteria like budget if the API supports it well for text search
): Promise<RestaurantSearchResult[]> {
  const query = `${cuisine} restaurants in ${location}`;
  const url = `${PLACES_API_BASE_URL}/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}&language=ja`;

  try {
    const data = await fetchFromApi<TextSearchResponseData>(url);
    if (data.status === 'ZERO_RESULTS' || !data.results) {
      return [];
    }
    return data.results.map(place => ({
      id: place.place_id,
      name: place.name,
      address: place.vicinity,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
    }));
  } catch (error) {
    console.error("Error in findRestaurantsByCriteria:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

export async function getRestaurantDetails(placeId: string): Promise<RestaurantDetails | null> {
  const fields = 'place_id,name,vicinity,rating,user_ratings_total,reviews,photos,formatted_address,website,formatted_phone_number';
  const url = `${PLACES_API_BASE_URL}/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_PLACES_API_KEY}&language=ja`;

  try {
    const data = await fetchFromApi<PlaceDetailsResponseData>(url);
    if (data.status === 'ZERO_RESULTS' || !data.result) {
      return null;
    }
    const place = data.result;
    const reviewsText = place.reviews?.slice(0, 3).map(r => r.text).join('\n\n---\n\n') || 'レビュー情報なし';
    
    let photoUrl: string | undefined = undefined;
    if (place.photos && place.photos.length > 0 && GOOGLE_PLACES_API_KEY) {
      const photoReference = place.photos[0].photo_reference;
      photoUrl = `${PLACES_API_BASE_URL}/photo?maxwidth=600&photoreference=${photoReference}&key=${GOOGLE_PLACES_API_KEY}`;
    }

    return {
      id: place.place_id,
      name: place.name,
      address: place.formatted_address || place.vicinity,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      reviewsText: reviewsText,
      photoUrl: photoUrl,
      // Map other details as needed
    };
  } catch (error) {
    console.error(`Error in getRestaurantDetails for placeId ${placeId}:`, error);
    throw error; // Re-throw to be handled by the caller
  }
}
