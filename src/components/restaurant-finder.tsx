
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { Skeleton } from "./ui/skeleton";

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
  { value: "送別会・歓迎会", label: "送別会・歓迎会" },
  { value: "懇親会・親睦会", label: "懇親会・親睦会" },
  { value: "接待・会食", label: "接待・会食" },
  { value: "忘年会・新年会", label: "忘年会・新年会" },
  { value: "チームビルディング・打ち上げ", label: "チームビルディング・打ち上げ" },
  { value: "二次会", label: "二次会" },
  { value: "その他", label: "その他" },
];

const cuisineOptions = [
    { value: "居酒屋 ダイニングバー", label: "居酒屋・ダイニングバー系 (懇親会・忘年会など幅広く人気)" },
    { value: "焼肉 肉料理", label: "焼肉・肉料理系 (若手中心の会で盛り上がりやすい)" },
    { value: "鍋 しゃぶしゃぶ すき焼き もつ鍋", label: "鍋料理系 (忘年会・新年会など季節の会に)" },
    { value: "和食 会席 割烹", label: "和食会席・割烹料理系 (接待や落ち着いた会合に)" },
    { value: "イタリアン フレンチ ビストロ", label: "イタリアン・欧風料理系 (女性が多い会や送別会に)" },
    { value: "中華料理 円卓", label: "中華料理系 (幅広い年代が参加する会に)" },
    { value: "ビュッフェ バイキング 立食", label: "ビュッフェ・バイキング形式 (大規模な交流会に)" },
    { value: "バー ラウンジ", label: "バー・ラウンジ系 (二次会などカジュアルな集まりに)" },
    { value: "その他", label: "その他（自由入力）" },
];


const RestaurantCriteriaFormSchema = RestaurantCriteriaBaseSchema.extend({
  date: z.date({ required_error: "日付を選択してください。" }).nullable().optional(),
  otherCuisine: z.string().optional(),
  otherPurposeOfUse: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.cuisine === 'その他' && (!data.otherCuisine || data.otherCuisine.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "「その他」を選択した場合は、ジャンルを入力してください。",
      path: ["otherCuisine"],
    });
  }
  if (data.purposeOfUse === 'その他' && (!data.otherPurposeOfUse || data.otherPurposeOfUse.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "「その他」を選択した場合は、利用目的を入力してください。",
      path: ["otherPurposeOfUse"],
    });
  }
});
type RestaurantCriteriaFormType = z.infer<typeof RestaurantCriteriaFormSchema>;

const defaultPersona = `あなたはこれまで数多くの企業会合を成功に導いてきた、経験豊富で有能な幹事です。  
あなたの使命は単にレストラン情報をまとめることではありません。  
会の目的や参加者の属性（役職・予算・好みなど）を深く理解し、  
潜在的リスクを洗い出したうえで、成功を確信できる最適なお店を推薦してください。  
あなたの提案が、会の成否を左右します。`;
const defaultPriorities = `1. **場の雰囲気とプライベート感**  
   - 個室の有無・品質  
   - 店内の静かさ（スピーチ／挨拶がしやすいか）  
2. **サービスの質**  
   - 団体客対応の実績  
   - ドリンク提供スピード、スタッフの対応力  
3. **席の配置と柔軟性**  
   - 全員が一体感を持てるレイアウトか  
   - 急な人数変更への対応可否  
4. **料理とコストパフォーマンス**
   - 予算内で満足度の高いコースやメニューが用意されているか  
5. **その他の希望条件との合致度**
   - 料理ジャンル、立地、設備（プロジェクター・マイクなど）`;


export default function RestaurantFinder() {
  const [isLoading, setIsLoading] = useState(false); // For AI search loading
  const [isPopularLoading, setIsPopularLoading] = useState(true); // For popular restaurants loading
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
      location: "",
      purposeOfUse: "",
      otherPurposeOfUse: "",
      privateRoomRequested: false,
      customPromptPersona: defaultPersona,
      customPromptPriorities: defaultPriorities,
    },
  });

  const selectedCuisine = form.watch("cuisine");
  const selectedPurpose = form.watch("purposeOfUse");

  const minCalendarDate = new Date();
  minCalendarDate.setHours(0, 0, 0, 0);

  useEffect(() => {
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
        setIsPopularLoading(false);
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
    const finalPurposeOfUse = data.purposeOfUse === 'その他' ? (data.otherPurposeOfUse || '') : data.purposeOfUse;

    const criteriaForAction: LibRestaurantCriteriaType = {
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
      cuisine: finalCuisine,
      purposeOfUse: finalPurposeOfUse,
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

                <div className="space-y-2">
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
                  {selectedPurpose === 'その他' && (
                    <FormField
                      control={form.control}
                      name="otherPurposeOfUse"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="具体的な利用目的を入力 (例: プロジェクト成功の打ち上げ)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
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

      <div className="space-y-6 mt-12">
        <h2 className="text-2xl font-headline font-bold flex items-center">
            <Users className="mr-2 h-6 w-6 text-accent" />
            みんなが選んだお店
        </h2>
        {isPopularLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="shadow-lg w-full overflow-hidden border-none flex flex-col">
                <CardHeader className="p-0">
                  <div className="aspect-[4/3] bg-muted rounded-t-lg overflow-hidden relative">
                    <Skeleton className="h-full w-full" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-2 flex-grow">
                  <Skeleton className="h-6 w-3/4" />
                  <div className="space-y-2 pt-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex flex-col sm:flex-row gap-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : popularRestaurants && popularRestaurants.length > 0 ? (
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
                websiteUri={rec.websiteUri}
                googleMapsUri={rec.googleMapsUri}
                />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>現在、人気のお店はありません。</p>
          </div>
        )}
      </div>

    </div>
  );
}
