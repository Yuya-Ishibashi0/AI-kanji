import type { RestaurantCriteria } from "@/lib/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock, DollarSign, MapPin, Utensils } from "lucide-react";

interface PreferenceDisplayCardProps {
  criteria: RestaurantCriteria;
}

export default function PreferenceDisplayCard({ criteria }: PreferenceDisplayCardProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-headline flex items-center">
          <Utensils className="mr-2 h-6 w-6 text-primary" />
          あなたの検索条件
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center">
          <CalendarDays className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>日付:</strong>&nbsp;{criteria.date.toLocaleDateString('ja-JP')}
        </div>
        <div className="flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>時間:</strong>&nbsp;{criteria.time}
        </div>
        <div className="flex items-center">
          <DollarSign className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>予算:</strong>&nbsp;{criteria.budget}
        </div>
        <div className="flex items-center">
          <Utensils className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>料理の種類:</strong>&nbsp;{criteria.cuisine}
        </div>
        <div className="flex items-center">
          <MapPin className="mr-2 h-5 w-5 text-muted-foreground" />
          <strong>場所:</strong>&nbsp;{criteria.location}
        </div>
      </CardContent>
    </Card>
  );
}
