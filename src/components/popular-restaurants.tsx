
"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { getPopularRestaurants } from "@/app/actions";
import type { PopularRestaurant } from "@/lib/schemas";
import RestaurantInfoCard from "./restaurant-info-card";
import { Skeleton } from "./ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { useToast } from "@/hooks/use-toast";

export default function PopularRestaurants() {
  const [isPopularLoading, setIsPopularLoading] = useState(true);
  const [popularRestaurants, setPopularRestaurants] = useState<PopularRestaurant[] | null>(null);
  const { toast } = useToast();

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

  return (
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
              <CardFooter className="p-4 pt-0 grid grid-cols-2 gap-2">
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
  );
}
