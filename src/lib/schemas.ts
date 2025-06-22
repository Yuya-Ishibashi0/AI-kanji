
import { z } from "zod";

// For form validation and passing to server action
export const RestaurantCriteriaSchema = z.object({
  date: z.string().describe("The date for the restaurant reservation in YYYY-MM-DD format."),
  time: z.string().min(1, "時間を選択してください。"),
  budget: z.string().min(1, "予算を入力してください。"),
  cuisine: z.string().min(1, "お店のジャンルを入力してください。"),
  location: z.string().min(1, "場所を入力してください。"),
  purposeOfUse: z.string().min(1, "利用目的を選択してください。").describe("The purpose of the gathering, e.g., farewell party, welcome party."),
  privateRoomRequested: z.boolean().optional().describe("Whether the user requested a private room."),
  // Dev-only fields, restored based on user request.
  customPromptPersona: z.string().optional().describe("ユーザー指定のAIペルソナ記述"),
  customPromptPriorities: z.string().optional().describe("ユーザー指定のAI評価優先順位記述"),
});

export type RestaurantCriteria = z.infer<typeof RestaurantCriteriaSchema>;


// For the final data structure returned to the client
export const KanjiChecklistSchema = z.object({
  privateRoomQuality: z.string().describe("個室の質（完全個室か、防音性など）に関するレビュー分析。該当情報がなければ「情報なし」と記述。"),
  noiseLevel: z.string().describe("店内の静かさ、会話のしやすさに関するレビュー分析。該当情報がなければ「情報なし」と記述。"),
  groupService: z.string().describe("団体利用時のドリンク提供速度やスタッフの対応に関するレビュー分析。該当情報がなければ「情報なし」と記述。"),
});

export const AnalyzeRestaurantReviewsOutputSchema = z.object({
  overallSentiment: z
    .string()
    .describe('レストランに対する全体的な感情（例：高評価、賛否両論、不評など）。日本語で記述してください。'),
  keyAspects:
    z.object({
      food: z
        .string()
        .describe('料理に関する感情と具体的な言及（例：「ピザが特に好評」「値段の割に味は普通」など）。日本語で記述してください。'),
      service:
        z.string().describe('サービスに関する感情と具体的な言及（例：「店員の対応が丁寧」「提供が遅い」など）。日本語で記述してください。'),
      ambiance: z
        .string()
        .describe('雰囲気に関する感情と具体的な言及（例：「個室があり落ち着ける」「店内は活気がある」など）。日本語で記述してください。'),
    })
    .describe('レストランの主要な側面とその感情。'),
  groupDiningExperience:
    z
      .string()
      .describe(
        'グループでの食事体験、グループ利用への適性に関する言及（例：「大人数での予約がしやすい」「宴会には不向き」など）。日本語で記述してください。'
      ),
  kanjiChecklist: KanjiChecklistSchema.optional().describe("幹事視点でのチェックリスト項目。"),
});
export type AnalyzeRestaurantReviewsOutput = z.infer<typeof AnalyzeRestaurantReviewsOutputSchema>;

export const SuggestRestaurantsOutputSchema = z.object({
  restaurantName: z.string().describe('おすすめのレストラン名。日本語で記述してください。'),
  recommendationRationale: z.string().describe('分析されたレビューと基準に基づいてレストランをおすすめする理由の詳細な説明（日本語で記述）。'),
});
export type SuggestRestaurantsOutput = z.infer<typeof SuggestRestaurantsOutputSchema>;

// This is the type for the final recommendation object returned by the API route
// and used throughout the client-side components.
export type RecommendationResult = {
  suggestion: SuggestRestaurantsOutput & { placeId: string };
  analysis: AnalyzeRestaurantReviewsOutput;
  criteria: RestaurantCriteria;
  photoUrl?: string;
  placeId: string;
  websiteUri?: string;
  googleMapsUri?: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  priceLevel?: string;
};

// Type for the popular restaurants list
export type PopularRestaurant = {
  placeId: string;
  name: string;
  address?: string;
  photoUrl?: string;
  types?: string[];
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
};
