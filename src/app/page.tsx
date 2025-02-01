import CTA from "@/components/landing/CTA";
import EcoFriendly from "@/components/landing/EcoFriendly";
import Features from "@/components/landing/Features";
import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import NetworkInfrastructure from "@/components/landing/NetworkInfrastructure";
import Performance from "@/components/landing/Performance";
import Scalability from "@/components/landing/Scalability";
import Security from "@/components/landing/Security";
import SupportAndReliability from "@/components/landing/SupportAndReliability";


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-white">
      <Header />
      <Hero />
      <Features />
      <Performance />
      <Security />
      <Scalability />
      <NetworkInfrastructure />
      <SupportAndReliability />
      <EcoFriendly />
      <CTA />
      <Footer />
    </div>
  )
}

