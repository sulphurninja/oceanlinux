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
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Affordable Linux VPS Hosting from ₹599/mo | OceanLinux - Premium Quality',
  description: 'Best affordable Linux VPS hosting in India. Premium features from ₹599/month. Enterprise security, 99.9% uptime, 24/7 support. Ubuntu, CentOS, Windows available. Get started instantly.',
  keywords: [
    'linux vps hosting',
    'affordable vps hosting india',
    'cheap linux server',
    'premium vps hosting',
    'linux dedicated server',
    'ubuntu vps hosting',
    'centos vps hosting',
    'managed linux hosting',
    'cloud linux hosting',
    'best vps hosting india',
    'oceanlinux',
    'rotating ip vps',
    'india vps server',
    'linux cloud hosting'
  ],
  openGraph: {
    title: 'OceanLinux - Affordable Premium Linux VPS Hosting',
    description: 'Get enterprise-grade Linux VPS hosting at unbeatable prices. Starting from ₹599/month with 99.9% uptime guarantee.',
    url: 'https://oceanlinux.com',
    siteName: 'OceanLinux',
    images: [
      {
        url: '/oceanlinux.png',
        width: 1200,
        height: 630,
        alt: 'OceanLinux - Affordable Linux VPS Hosting',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OceanLinux - Affordable Premium Linux VPS Hosting',
    description: 'Enterprise-grade Linux VPS from ₹599/mo. 99.9% uptime, 24/7 support, instant setup.',
    images: ['/oceanlinux.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://oceanlinux.com',
  },
};

export default function LandingPage() {
  // Generate dynamic structured data for pricing
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://oceanlinux.com/#organization",
        "name": "OceanLinux",
        "url": "https://oceanlinux.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://oceanlinux.com/oceanlinux.png",
          "width": 512,
          "height": 512
        },
        "description": "Affordable premium Linux VPS hosting provider in India",
        "sameAs": [
          "https://twitter.com/oceanlinux",
          "https://facebook.com/oceanlinux"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "Customer Service",
          "email": "hello@oceanlinux.com",
          "availableLanguage": ["English", "Hindi"]
        }
      },
      {
        "@type": "WebSite",
        "@id": "https://oceanlinux.com/#website",
        "url": "https://oceanlinux.com",
        "name": "OceanLinux",
        "description": "Affordable Premium Linux VPS Hosting",
        "publisher": {
          "@id": "https://oceanlinux.com/#organization"
        },
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://oceanlinux.com/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Product",
        "@id": "https://oceanlinux.com/#product",
        "name": "Linux VPS Hosting Plans",
        "description": "Affordable premium Linux VPS hosting with enterprise features, 99.9% uptime guarantee, and 24/7 support",
        "brand": {
          "@id": "https://oceanlinux.com/#organization"
        },
        "offers": {
          "@type": "AggregateOffer",
          "url": "https://oceanlinux.com",
          "priceCurrency": "INR",
          "lowPrice": "599",
          "highPrice": "1299",
          "offerCount": "4",
          "availability": "https://schema.org/InStock",
          "priceValidUntil": new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "bestRating": "5",
          "worstRating": "1",
          "ratingCount": "5000"
        },
        "review": [
          {
            "@type": "Review",
            "reviewRating": {
              "@type": "Rating",
              "ratingValue": "5",
              "bestRating": "5"
            },
            "author": {
              "@type": "Person",
              "name": "Verified Customer"
            },
            "reviewBody": "Best affordable Linux VPS hosting in India. Great performance and support!"
          }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "@id": "https://oceanlinux.com/#breadcrumb",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://oceanlinux.com"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Linux VPS Hosting",
            "item": "https://oceanlinux.com/vps"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Affordable Hosting",
            "item": "https://oceanlinux.com/hosting"
          }
        ]
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Structured data for better SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData)
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