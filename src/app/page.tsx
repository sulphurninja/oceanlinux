import CTA from "@/components/landing/CTA";
import EcoFriendly from "@/components/landing/EcoFriendly";
import Features from "@/components/landing/Features";
import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import NetworkInfrastructure from "@/components/landing/NetworkInfrastructure";
import Performance from "@/components/landing/Performance";
import PricingSection from "@/components/landing/pricing";
import Scalability from "@/components/landing/Scalability";
import Security from "@/components/landing/Security";
import SupportAndReliability from "@/components/landing/SupportAndReliability";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Structured data for better SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "OceanLinux - The ocean of Linux",
            description: "The Ocean of Linux, Professional Linux hosting solutions including VPS, dedicated servers, and cloud hosting. Never run out of Linux distribution options.",
            brand: {
              "@type": "Brand",
              name: "OceanLinux"
            },
            offers: {
              "@type": "AggregateOffer",
              url: "https://oceanlinux.com/pricing",
              priceCurrency: "USD",
              lowPrice: "9.99",
              highPrice: "199.99",
              offerCount: "4"
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.9",
              bestRating: "5",
              worstRating: "1",
              ratingCount: "2847"
            }
          })
        }}
      />

      <Header />
      <main>
        <Hero />
        <PricingSection />
        <Features />
        <Performance />
        <Security />
        <Scalability />
        <NetworkInfrastructure />
        <SupportAndReliability />
        <EcoFriendly />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}