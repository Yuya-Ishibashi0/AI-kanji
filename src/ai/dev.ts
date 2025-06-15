import { config } from 'dotenv';
config();

import '@/ai/flows/analyze-restaurant-reviews.ts';
import '@/ai/flows/suggest-restaurants.ts';
import '@/ai/flows/filter-restaurants.ts';
import '@/ai/flows/select-and-analyze.ts';
