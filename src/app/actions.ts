
"use server";

import type { RestaurantCriteria, RecommendationResult, PopularRestaurant } from "@/lib/schemas";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { buildPhotoUrl } from "@/services/google-places-service";

// This is the new, clean entry point that the client calls.
export async function getRestaurantSuggestion(
  criteria: RestaurantCriteria
): Promise<{ data?: RecommendationResult[]; error?: string }> {
  try {
    const url = process.env.NODE_ENV === 'development'
      ? 'http://127.0.0.1:9002/api/restaurants/suggest'
      : `${process.env.NEXT_PUBLIC_APP_URL}/api/restaurants/suggest`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(criteria),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || `API request failed with status ${response.status}`);
    }

    const result = await response.json();
    return result;

  } catch (e) {
    console.error("Error in getRestaurantSuggestion action:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
    return { error: `処理中にエラーが発生しました: ${errorMessage}` };
  }
}

// Action to log a user's choice
export async function logUserChoice(placeId: string): Promise<{success: boolean; message?: string}> {
  if (!placeId) {
    return { success: false, message: "Place ID is required." };
  }
  try {
    await adminDb.collection('userChoices').add({
      placeId: placeId,
      selectedAt: Timestamp.now(),
    });
    console.log(`Logged user choice for placeId: ${placeId}`);
    return { success: true };
  } catch (error) {
    console.error("Error logging user choice to Firestore:", error);
    return { success: false, message: "Failed to log choice." };
  }
}

// Action to get popular restaurants based on user choices
export async function getPopularRestaurants(): Promise<PopularRestaurant[]> {
  try {
    // 1. Fetch all user choices
    const choicesSnapshot = await adminDb.collection('userChoices').get();
    if (choicesSnapshot.empty) {
      return [];
    }

    // 2. Count occurrences of each placeId
    const placeIdCounts = new Map<string, number>();
    choicesSnapshot.forEach(doc => {
      const { placeId } = doc.data();
      if (placeId) {
        placeIdCounts.set(placeId, (placeIdCounts.get(placeId) || 0) + 1);
      }
    });

    // 3. Sort by count and get top 16
    const sortedPlaceIds = Array.from(placeIdCounts.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(entry => entry[0])      // Get just the placeId
      .slice(0, 16);               // Limit to 16

    if (sortedPlaceIds.length === 0) {
      return [];
    }
      
    // 4. Fetch details for the top 16 restaurants from the cache collection
    const restaurantDetailsPromises = sortedPlaceIds.map(async (id) => {
        try {
            const docRef = adminDb.collection("shinjuku-places").doc(id);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error(`Failed to fetch details for popular restaurant ${id}:`, error);
            return null;
        }
    });
    const restaurantDetailsResults = (await Promise.all(restaurantDetailsPromises)).filter(r => r !== null);
    
    // 5. Format the data and get photo URLs
    const popularRestaurantsPromises = restaurantDetailsResults.map(async (details: any) => {
      let photoUrl: string | undefined = undefined;
      if (details.photos && details.photos.length > 0 && details.photos[0].name) {
        photoUrl = await buildPhotoUrl(details.photos[0].name);
      }
      
      return {
        placeId: details.id,
        name: details.displayName || '名前不明',
        address: details.formattedAddress || '住所不明',
        photoUrl: photoUrl,
        types: details.types || [],
        priceLevel: details.priceLevel,
      };
    });

    return Promise.all(popularRestaurantsPromises);

  } catch (error) {
    console.error("Error fetching popular restaurants:", error);
    return []; // Return empty array on error
  }
}
