export enum ErrorCode {
    // 検索関連
    NO_RESULTS = 'NO_RESULTS',
    INVALID_LOCATION = 'INVALID_LOCATION',
    SEARCH_FAILED = 'SEARCH_FAILED',
    
    // API関連
    API_LIMIT_EXCEEDED = 'API_LIMIT_EXCEEDED',
    API_UNAVAILABLE = 'API_UNAVAILABLE',
    INVALID_API_RESPONSE = 'INVALID_API_RESPONSE',
    
    // フィルタリング関連
    NO_QUALIFIED_RESTAURANTS = 'NO_QUALIFIED_RESTAURANTS',
    
    // AI関連
    AI_ANALYSIS_FAILED = 'AI_ANALYSIS_FAILED',
    AI_TIMEOUT = 'AI_TIMEOUT',
    
    // データ関連
    CACHE_ERROR = 'CACHE_ERROR',
    DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
    
    // 一般
    UNKNOWN = 'UNKNOWN',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
  }
  
  export class RecommendationError extends Error {
    constructor(
      message: string,
      public readonly code: ErrorCode,
      public readonly userMessage: string,
      public readonly originalError?: Error,
      public readonly context?: Record<string, any>
    ) {
      super(message);
      this.name = 'RecommendationError';
    }
  }
  
  // 具体的なエラークラス
  export class NoResultsError extends RecommendationError {
    constructor(context?: Record<string, any>) {
      super(
        'No restaurants found for given criteria',
        ErrorCode.NO_RESULTS,
        '条件に合うお店が見つかりませんでした。場所や料理ジャンルを変更してお試しください。',
        undefined,
        context
      );
    }
  }
  
  export class APILimitError extends RecommendationError {
    constructor(originalError?: Error, retryAfter?: number) {
      super(
        'API rate limit exceeded',
        ErrorCode.API_LIMIT_EXCEEDED,
        'サービスが混雑しています。しばらく時間をおいてからお試しください。',
        originalError,
        { retryAfter }
      );
    }
  }
  
  export class FilterError extends RecommendationError {
    constructor(message: string, context?: Record<string, any>) {
      super(
        `Filtering failed: ${message}`,
        ErrorCode.NO_QUALIFIED_RESTAURANTS,
        '条件に合う評価の高いレストランが見つかりませんでした。評価の基準を少し下げてみてください。',
        undefined,
        context
      );
    }
  }
  
  export class DataFetchError extends RecommendationError {
    constructor(message: string, originalError?: Error) {
      super(
        `Data fetch failed: ${message}`,
        ErrorCode.DATA_FETCH_ERROR,
        '詳細情報の取得に失敗しました。もう一度お試しください。',
        originalError
      );
    }
  }
  
  export class AIAnalysisError extends RecommendationError {
    constructor(originalError?: Error) {
      super(
        'AI analysis failed',
        ErrorCode.AI_ANALYSIS_FAILED,
        'AI分析でエラーが発生しました。もう一度お試しください。',
        originalError
      );
    }
  }