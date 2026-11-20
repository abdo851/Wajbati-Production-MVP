import { EmailBanner } from "@/components/email-banner";
import { HomeGuide, HomeIntro } from "@/components/home-intro";
import { MarketplaceListingsBoard } from "@/components/marketplace-listings-board";
import { MealBoard } from "@/components/meal-board";

export default function HomePage() {
  return (
    <main className="flex-1">
      <EmailBanner />
      <HomeIntro />
      <MarketplaceListingsBoard />
      <MealBoard />
      <HomeGuide />
    </main>
  );
}
