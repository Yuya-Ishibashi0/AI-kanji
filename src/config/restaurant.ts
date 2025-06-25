
export const RESTAURANT_CONFIG = {
    // フィルタリング設定
    FILTERING: {
      MIN_RATING: 3.7,
      MIN_RATING_COUNT: 30,
      MAX_CANDIDATES: 5,
      MAX_SEARCH_RESULTS: 20,
    },
    
    // 除外キーワード
    EXCLUDE_KEYWORDS: [
      'カウンターのみ', '立ち飲み', '席が少ない', '狭い', '小さい店',
      '一人', '少人数', '2〜3人', '4人まで', '6人まで',
      'バー', 'スナック', 'パブ', 'クラブ', 'ラーメン', 'うどん', 'そば', 'テイクアウト専門'
    ] as const,
    
    // キャッシュ設定
    CACHE: {
      TTL_HOURS: 24,
    },
    
    // 写真設定
    PHOTO: {
      MAX_HEIGHT_PX: 600,
    },
  } as const;