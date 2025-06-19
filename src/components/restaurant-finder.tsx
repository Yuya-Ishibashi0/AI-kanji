
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, ChefHat, Clock, DollarSign, Loader2, MapPin, Search, Wand2, DoorOpen, MessageSquare, Edit3, PartyPopper } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getRestaurantSuggestion, type RecommendationResult } from "@/app/actions";
import { RestaurantCriteriaSchema as RestaurantCriteriaBaseSchema, type RestaurantCriteria as LibRestaurantCriteriaType } from "@/lib/schemas";
import RestaurantInfoCard from "./restaurant-info-card";
import PreferenceDisplayCard from "./preference-display-card";
import { useToast } from "@/hooks/use-toast";

const timeOptions = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00",
  "20:30", "21:00",
];

const budgetOptions = [
  "3,000円以内", "3,000円～5,000円", "5,000円～8,000円",
  "8,000円～10,000円", "10,000円～15,000円", "15,000円以上",
];

const purposeOfUseOptions = [
  { value: "送別会", label: "送別会" },
  { value: "歓迎会", label: "歓迎会" },
  { value: "懇親会", label: "懇親会" },
  { value: "接待", label: "接待" },
  { value: "忘年会", label: "忘年会" },
  { value: "新年会", label: "新年会" },
  { value: "その他", label: "その他" },
];

// Schema for form validation, includes client-side specific date type
const RestaurantCriteriaFormSchema = RestaurantCriteriaBaseSchema.extend({
  date: z.date({ required_error: "日付を選択してください。" }).nullable().optional(),
  privateRoomRequested: z.boolean().optional(),
  purposeOfUse: z.string().min(1, "利用目的を選択してください。"),
});
type RestaurantCriteriaFormType = z.infer<typeof RestaurantCriteriaFormSchema>;

const newDefaultPersonaPrompt = `あなたは、企業の重要な会合を数多く成功させてきた、極めて優秀で経験豊富な幹事です。あなたの使命は、単にレストランの情報を要約することではありません。提示された全ての情報源を駆使し、会の目的や参加者の背景を深く理解した上で、潜在的なリスクを洗い出し、成功を確信できる最高の店を推薦することです。あなたの分析と提案が、会の成否を左右します。`;

const defaultPrioritiesPrompt = `1.  **場の雰囲気とプライベート感**: スピーチや挨拶が問題なくできるか（特にユーザーが個室を希望している場合は個室の有無・質、店全体の静けさ）。
2.  **サービスの質**: 団体客への対応に慣れているか、ドリンク提供速度、スタッフの配慮。
3.  **席の配置と柔軟性**: 全員が一体感を持てる席か、参加人数の変更に対応できそうか。
4.  **料理とコストパフォーマンス**: 予算内で参加者満足度の高いコースや食事が提供されているか。
5.  その他ユーザーの希望条件（料理ジャンル、場所など）との合致度。`;

const isDevelopment = process.env.NODE_ENV === 'development';

export default function RestaurantFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const form = useForm<RestaurantCriteriaFormType>({
    resolver: zodResolver(RestaurantCriteriaFormSchema),
    defaultValues: {
      date: undefined, 
      time: "19:00",
      budget: "5,000円～8,000円",
      cuisine: "",
      location: "",
      purposeOfUse: "懇親会",
      privateRoomRequested: false,
      customPromptPersona: newDefaultPersonaPrompt,
      customPromptPriorities: defaultPrioritiesPrompt,
    },
  });

  const [minCalendarDate, setMinCalendarDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const today = new Date();
    form.setValue("date", today); 
    setMinCalendarDate(new Date(today.getFullYear(), today.getMonth(), today.getDate())); 
  }, [form.setValue]);

  const onSubmit: SubmitHandler<RestaurantCriteriaFormType> = async (data) => {
    if (!data.date) { 
      setError("日付が選択されていません。");
      toast({
        title: "エラー",
        description: "日付を選択してください。",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setRecommendations(null);

    const criteriaForAction: LibRestaurantCriteriaType = {
      date: format(data.date, 'yyyy-MM-dd'), 
      time: data.time || "19:00", 
      budget: data.budget || "5,000円～8,000円",
      cuisine: data.cuisine || "",
      location: data.location || "",
      purposeOfUse: data.purposeOfUse,
      privateRoomRequested: data.privateRoomRequested ?? false,
      // Only send custom prompts if in development
      customPromptPersona: isDevelopment ? data.customPromptPersona : undefined,
      customPromptPriorities: isDevelopment ? data.customPromptPriorities : undefined,
    };
    
    const result = await getRestaurantSuggestion(criteriaForAction);

    if (result.data && result.data.length > 0) {
      const recommendationsWithDateObjects = result.data.map(rec => ({
        ...rec,
        criteria: {
          ...rec.criteria,
          date: typeof rec.criteria.date === 'string' ? new Date(rec.criteria.date) : rec.criteria.date,
        }
      }));
      setRecommendations(recommendationsWithDateObjects);
      toast({
        title: "お店が見つかりました！",
        description: `${recommendationsWithDateObjects.length}件のおすすめ候補を提案します。`,
      });
    } else if (result.error) {
      setError(result.error);
      toast({
        title: "エラー",
        description: result.error,
        variant: "destructive",
      });
    } else {
      setError("AIが条件に合うお店を見つけられませんでした。条件を変えて再度お試しください。");
      toast({
        title: "検索結果なし",
        description: "AIが条件に合うお店を見つけられませんでした。条件を変えて再度お試しください。",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline flex items-center">
            <Search className="mr-2 h-7 w-7 text-primary" />
            お店を探す
          </CardTitle>
          <CardDescription>希望の条件を入力して、AIにおすすめのお店を提案してもらいましょう！</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" />日付</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: ja })
                            ) : (
                              <span>日付を選択</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined} 
                          onSelect={field.onChange}
                          disabled={(date) => minCalendarDate ? date < minCalendarDate : true} 
                          initialFocus
                          locale={ja}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" />時間</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="時間を選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map(time => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" />予算 (1人あたり)</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="予算を選択" /> 
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {budgetOptions.map(budget => (
                          <SelectItem key={budget} value={budget}>{budget}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cuisine"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><ChefHat className="mr-2 h-4 w-4" />料理の種類</FormLabel>
                    <FormControl>
                      <Input placeholder="例: イタリアン、焼肉、寿司" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><MapPin className="mr-2 h-4 w-4" />場所</FormLabel>
                    <FormControl>
                      <Input placeholder="例: 東京駅周辺、新宿、渋谷" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purposeOfUse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><PartyPopper className="mr-2 h-4 w-4" />利用目的</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="利用目的を選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {purposeOfUseOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="privateRoomRequested"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="flex items-center"><DoorOpen className="mr-2 h-4 w-4 text-muted-foreground" />個室を希望する</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {isDevelopment && (
                <>
                  <FormField
                    control={form.control}
                    name="customPromptPersona"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" />AIへの指示 (ペルソナ) [開発用]</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="AIの役割や性格付けを入力..."
                            className="resize-y min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customPromptPriorities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><Edit3 className="mr-2 h-4 w-4" />AIへの指示 (評価の優先順位) [開発用]</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="AIがレストランを選ぶ際の評価基準や優先順位を入力..."
                            className="resize-y min-h-[150px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              
              <Button type="submit" disabled={isLoading || !form.formState.isValid || !minCalendarDate} className="w-full text-base py-6">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    AIが検索中...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-5 w-5" />
                    AIにお店を提案してもらう
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-card rounded-lg shadow-lg">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-lg font-semibold text-primary">AIが良いお店を探しています...</p>
          <p className="text-sm text-muted-foreground">少々お待ちください。</p>
        </div>
      )}

      {error && !isLoading && (
        <Card className="border-destructive bg-destructive/10 shadow-lg">
          <CardHeader>
            <CardTitle className="text-destructive font-headline">エラーが発生しました</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button variant="outline" onClick={() => setError(null)} className="mt-4">
              閉じる
            </Button>
          </CardContent>
        </Card>
      )}

      {recommendations && !isLoading && !error && (
        <div className="space-y-8">
          {recommendations.map((rec) => (
            <RestaurantInfoCard 
              key={rec.placeId} 
              suggestion={{
                restaurantName: rec.suggestion.restaurantName,
                recommendationRationale: rec.suggestion.recommendationRationale,
              }}
              analysis={rec.analysis}
              photoUrl={rec.photoUrl}
              websiteUri={rec.websiteUri}
              googleMapsUri={rec.googleMapsUri}
              address={rec.address}
              rating={rec.rating}
              userRatingsTotal={rec.userRatingsTotal}
              types={rec.types}
              priceLevel={rec.priceLevel}
            />
          ))}
          {recommendations.length > 0 && recommendations[0] && recommendations[0].criteria && (
             <PreferenceDisplayCard 
                criteria={{
                    ...recommendations[0].criteria,
                    date: typeof recommendations[0].criteria.date === 'string' 
                            ? new Date(recommendations[0].criteria.date) 
                            : recommendations[0].criteria.date
                }} 
            />
          )}
           <Button variant="outline" onClick={() => setRecommendations(null)} className="w-full">
            別の条件で検索する
          </Button>
        </div>
      )}
    </div>
  );
}

    
