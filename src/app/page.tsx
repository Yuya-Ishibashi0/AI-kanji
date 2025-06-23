import AppHeader from '@/components/layout/app-header';
import RestaurantFinder from '@/components/restaurant-finder';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <RestaurantFinder />
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-12">
        © {new Date().getFullYear()} B.FFS. All rights reserved.
      </footer>
    </div>
  );
}
