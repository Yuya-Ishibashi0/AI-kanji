import { UtensilsCrossed } from 'lucide-react';

export default function AppHeader() {
  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center gap-3">
        <UtensilsCrossed size={32} strokeWidth={2.5} />
        <h1 className="text-2xl md:text-3xl font-headline font-bold tracking-tight">AI幹事くん</h1>
      </div>
    </header>
  );
}
