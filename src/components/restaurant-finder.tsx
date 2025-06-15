"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, ChefHat, Clock, DollarSign, Loader2, MapPin, Search, Wand2 } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { z } from "zod"; // Added import for z

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getRestaurantSuggestion, type RecommendationResult } from "@/app/actions";
// Import the original schema for form validation (which expects Date object)
import { RestaurantCriteriaSchema as RestaurantCriteriaFormSchema, type RestaurantCriteria as RestaurantCriteriaType } from "@/lib/schemas";
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

export default function RestaurantFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Use the form schema which expects a Date object for the 'date' field
  // The schema from lib/schemas expects date as string, so we extend it here for form validation
  const form = useForm<RestaurantCriteriaType>({
    resolver: zodResolver(
      RestaurantCriteriaFormSchema.extend({
        date: z.date({ required_error: "日付を選択してください。" }),
      })
    ),
    defaultValues: {
      date: new Date(), // Initialize with a Date object
      time: "19:00",
      budget: "5,000円～8,000円",
      cuisine: "",
      location: "",
    },
  });

  // This useEffect is fine as it sets a Date object
  useEffect(() => {
    if (!form.getValues("date")) {
      form.setValue("date", new Date());
    }
  }, [form]);

  const onSubmit: SubmitHandler<RestaurantCriteriaType> = async (data) => {
    setIsLoading(true);
    setError(null);
    setRecommendations(null);

    // The `data` object here correctly has `date` as a Date object.
    // The server action `getRestaurantSuggestion` expects `RestaurantCriteria`
    // where `date` is a string in 'yyyy-MM-dd' format.
    const criteriaForAction = {
      ...data,
      date: format(data.date, 'yyyy-MM-dd'), // Format Date to string for action
    };

    // @ts-ignore - criteria.date is intentionally a string for the action,
    // while the form hook and PreferenceDisplayCard use Date object.
    const result = await getRestaurantSuggestion(criteriaForAction);

    if (result.data && result.data.length > 0) {
      // The result.data[x].criteria.date will be a string here (from actions.ts).
      // We need to convert it back to Date for PreferenceDisplayCard and if we re-populate the form.
      const recommendationsWithDateObjects = result.data.map(rec => ({
        ...rec,
        criteria: {
          ...rec.criteria,
          // Ensure date from criteria in the response is converted to Date object for display
          date: new Date(rec.criteria.date) 
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
      setError("AIがお気に入りのお店を見つけられませんでした。条件を変えて再度お試しください。");
      toast({
        title: "検索結果なし",
        description: "条件に合うお店が見つかりませんでした。",
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
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
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
              
              <Button type="submit" disabled={isLoading} className="w-full text-base py-6">
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
              suggestion={rec.suggestion} 
              analysis={rec.analysis}
              photoUrl={rec.photoUrl}
            />
          ))}
          {/* Ensure recommendations[0].criteria.date is a Date object for PreferenceDisplayCard */}
          <PreferenceDisplayCard criteria={recommendations[0].criteria} />
           <Button variant="outline" onClick={() => setRecommendations(null)} className="w-full">
            別の条件で検索する
          </Button>
        </div>
      )}
    </div>
  );
}
