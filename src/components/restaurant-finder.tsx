
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, ChefHat, Clock, DollarSign, Loader2, MapPin, Search, Wand2, DoorOpen, PartyPopper, Users, Bot } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getRestaurantSuggestion, getPopularRestaurants } from "@/app/actions";
import { RestaurantCriteriaSchema as RestaurantCriteriaBaseSchema, type RestaurantCriteria as LibRestaurantCriteriaType, type RecommendationResult, type PopularRestaurant } from "@/lib/schemas";
import RestaurantInfoCard from "./restaurant-info-card";
import { useToast } from "@/hooks/use-toast";
import RecommendationDetailCard from "./recommendation-detail-card";
import PreferenceDisplayCard from "./preference-display-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Textarea } from "./ui/textarea";

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

const cuisineOptions = [
  { value: "和食", label: "和食 (寿司, 天ぷら, しゃぶしゃぶ)" },
  { value: "焼肉・ホルモン", label: "焼肉／ホルモン (焼肉, ホルモン, ジンギスカン)" },
  { value: "寿司・海鮮", label: "寿司／海鮮料理 (寿司, 魚介料理, 海鮮丼)" },
  { value: "中華", label: "中華料理 (点心, 四川料理, 中華全般)" },
  { value: "イタリアン・フレンチ", label: "イタリアン／フレンチ (パスタ, ピザ, ビストロ)" },
  { value: "各国料理", label: "各国料理 (韓国, タイ, インド)" },
  { value: "洋食", label: "洋食／欧風料理 (ステーキ, ハンバーグ, オムライス)" },
  { value: "カフェ・スイーツ", label: "カフェ／スイーツ (カフェ, パン, ケーキ)" },
  { value: "居酒屋・バー", label: "居酒屋／バー (居酒屋, バル, ダイニングバー)" },
  { value: "ビュッフェ", label: "ビュッフェ (バイキング, 食べ放題)" },
  { value: "鍋料理", label: "鍋料理 (しゃぶしゃぶ, すき焼き, もつ鍋)" },
  { value: "専門店", label: "専門店 (ラーメン, カレー, お好み焼き)" },
  { value: "その他", label: "その他（自由入力）" },
];


const RestaurantCriteriaFormSchema = RestaurantCriteriaBaseSchema.extend({
  date: z.date({ required_error: "日付を選択してください。" }).nullable().optional(),
  otherCuisine: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.cuisine === 'その他' && (!data.otherCuisine || data.otherCuisine.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "「その他」を選択した場合は、ジャンルを入力してください。",
      path: ["otherCuisine"],
    });
  }
});
type RestaurantCriteriaFormType = z.infer<typeof RestaurantCriteriaFormSchema>;

const defaultPersona = `あなたは、企業の重要な会合を数多く成功させてきた、極めて優秀で経験豊富な幹事です。あなたの使命は、単にレストランの情報を要約することではありません。提示された全ての情報源を駆使し、会の目的や参加者の背景を深く理解した上で、潜在的なリスクを洗い出し、成功を確信できる最高の店を推薦することです。あなたの分析と提案が、会の成否を左右します。`;
const defaultPriorities = `1.  **場の雰囲気とプライベート感**: スピーチや挨拶が問題なくできるか（特にユーザーが個室を希望している場合は個室の有無・質、店全体の静けさ）。
2.  **サービスの質**: 団体客への対応に慣れているか、ドリンク提供速度、スタッフの配慮。
3.  **席の配置と柔軟性**: 全員が一体感を持てる席か、参加人数の変更に対応できそうか。
4.  **料理とコストパフォーマンス**: 予算内で参加者満足度の高いコースや食事が提供されているか。
5.  その他ユーザーの希望条件（料理ジャンル、場所など）との合致度。`;


export default function RestaurantFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationResult[] | null>(null);
  const [popularRestaurants, setPopularRestaurants] = useState<PopularRestaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [lastCriteria, setLastCriteria] = useState<(LibRestaurantCriteriaType & { date: Date }) | null>(null);
  
  const form = useForm<RestaurantCriteriaFormType>({
    resolver: zodResolver(RestaurantCriteriaFormSchema),
    defaultValues: {
      date: new Date(),
      time: "19:00",
      budget: "5,000円～8,000円",
      cuisine: "",
      otherCuisine: "",
      location: "新宿",
      purposeOfUse: "懇親会",
      privateRoomRequested: false,
      customPromptPersona: defaultPersona,
      customPromptPriorities: defaultPriorities,
    },
  });

  const selectedCuisine = form.watch("cuisine");

  const minCalendarDate = new Date();
  minCalendarDate.setHours(0, 0, 0, 0);

  useEffect(() => {
    setIsLoading(true);
    getPopularRestaurants()
      .then(setPopularRestaurants)
      .catch(err => {
        console.error("Failed to fetch popular restaurants:", err);
        toast({
            title: "エラー",
            description: "人気のお店の読み込みに失敗しました。",
            variant: "destructive",
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [toast]);

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
    setLastCriteria(null);

    const finalCuisine = data.cuisine === 'その他' ? (data.otherCuisine || '') : data.cuisine;

    const criteriaForAction: LibRestaurantCriteriaType = {
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
      cuisine: finalCuisine,
    };
    
    setLastCriteria({ ...criteriaForAction, date: data.date });

    const result = await getRestaurantSuggestion(criteriaForAction);

    if (result.data && result.data.length > 0) {
      setRecommendations(result.data);
      toast({
        title: "お店が見つかりました！",
        description: `${result.data.length}件のおすすめ候補を提案します。`,
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
    <div className="space-y-12">
      <Card className="shadow-xl border-none">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" />日付<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
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
                            disabled={(date) => date < minCalendarDate}
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
                      <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" />時間<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
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
                      <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" />予算 (1人あたり)<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
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
                
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="cuisine"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><ChefHat className="mr-2 h-4 w-4" />お店のジャンル<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="ジャンルを選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cuisineOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {selectedCuisine === 'その他' && (
                    <FormField
                      control={form.control}
                      name="otherCuisine"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="具体的なジャンルを入力 (例: メキシコ料理)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><MapPin className="mr-2 h-4 w-4" />場所<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
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
                      <FormLabel className="flex items-center"><PartyPopper className="mr-2 h-4 w-4" />利用目的<Badge variant="destructive" className="ml-2">必須</Badge></FormLabel>
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
              </div>

              <FormField
                  control={form.control}
                  name="privateRoomRequested"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center"><DoorOpen className="mr-2 h-4 w-4 text-muted-foreground" />個室を希望する</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="dev-options">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary/80 hover:text-primary">
                        <Bot className="h-5 w-5" />
                        <span>AIへの指示（開発者向けオプション）</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 border-t">
                    <FormField
                      control={form.control}
                      name="customPromptPersona"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-xs text-muted-foreground">AIへの指示 (ペルソナ) <Badge variant="outline" className="ml-2">任意</Badge></FormLabel>
                          <FormControl>
                            <Textarea
                              className="min-h-[100px] text-sm"
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
                          <FormLabel className="flex items-center text-xs text-muted-foreground">AIへの指示 (評価の優先順位) <Badge variant="outline" className="ml-2">任意</Badge></FormLabel>
                          <FormControl>
                            <Textarea
                              className="min-h-[140px] text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Button type="submit" disabled={isLoading} className="w-full text-lg py-6 bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
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

      {recommendations && !isLoading && !error && lastCriteria && (
        <div className="space-y-8">
          <PreferenceDisplayCard criteria={lastCriteria} />
          <div className="space-y-6">
            <h2 className="text-2xl font-headline font-bold flex items-center">
                <Wand2 className="mr-2 h-6 w-6 text-accent" />
                AIからの提案
            </h2>
            <div className="space-y-8">
                {recommendations.map((rec) => (
                    <RecommendationDetailCard 
                    key={rec.placeId} 
                    recommendation={rec}
                    />
                ))}
            </div>
          </div>
        </div>
      )}

      {popularRestaurants && popularRestaurants.length > 0 && !recommendations && !isLoading && (
         <div className="space-y-6">
            <h2 className="text-2xl font-headline font-bold flex items-center">
                <Users className="mr-2 h-6 w-6 text-accent" />
                みんなが選んだお店
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {popularRestaurants.map((rec) => (
                    <RestaurantInfoCard 
                    key={rec.placeId} 
                    placeId={rec.placeId}
                    name={rec.name}
                    photoUrl={rec.photoUrl}
                    address={rec.address}
                    types={rec.types}
                    priceLevel={rec.priceLevel}
                    />
                ))}
            </div>
        </div>
      )}

    </div>
  );
}

    