    export const AI_CONFIG = {
    GEMINI: {
      TEMPERATURE: 0.2,
      MAX_RETRIES: 3,
      TIMEOUT_MS: 30000,
    },
    
    REVIEW_ANALYSIS: {
      MAX_REVIEW_LENGTH: 200, // snippet用
    },
  } as const;


    // ===== 修正が必要な箇所 =====
  
  // src/app/actions.ts:27-28
  // 修正前:
  const MIN_RATING = 3.7;
  const MIN_RATING_COUNT = 30;
  
  // 修正後:
  import { RESTAURANT_CONFIG } from '@/config/restaurant';
  const { MIN_RATING, MIN_RATING_COUNT } = RESTAURANT_CONFIG.FILTERING;
  
  // src/services/google-places-service.ts:20-27
  // 修正前:
  const EXCLUDE_KEYWORDS_FOR_GROUP_DINING = [ /* ... */ ];
  
  // 修正後:
  import { RESTAURANT_CONFIG } from '@/config/restaurant';
  const EXCLUDE_KEYWORDS_FOR_GROUP_DINING = RESTAURANT_CONFIG.EXCLUDE_KEYWORDS;
  
  // src/ai/flows/select-and-analyze.ts:45
  // 修正前:
  config: { temperature: 0.2 }
  
  // 修正後:
  import { AI_CONFIG } from '@/config/ai';
  config: { temperature: AI_CONFIG.GEMINI.TEMPERATURE }
  
  // src/services/google-places-service.ts:最後
  // 修正前:
  maxHeightPx: number = 600
  
  // 修正後:
  import { RESTAURANT_CONFIG } from '@/config/restaurant';
  maxHeightPx: number = RESTAURANT_CONFIG.PHOTO.MAX_HEIGHT_PX