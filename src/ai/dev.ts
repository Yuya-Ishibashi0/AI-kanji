
import { config } from 'dotenv';
config();

import '@/ai/flows/analyze-restaurant-reviews.ts';
import '@/ai/flows/suggest-restaurants.ts';
// import '@/ai/flows/filter-restaurants.ts'; // This flow is no longer used with the new mechanical filtering logic
import '@/ai/flows/select-and-analyze.ts';
