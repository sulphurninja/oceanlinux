import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OceanLinux - The Ocean of Linux",
  description: "The Ocean of Linux, Discover the ocean of Linux distributions with OceanLinux. Access premium Linux hosting, VPS servers, dedicated servers, and cloud hosting solutions. Professional Linux infrastructure for developers and enterprises.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  keywords: "OceanLinux, The Ocean of Linux, Ocean Linux, Linux Ocean, Linux distribution, Linux hosting, Linux VPS, Linux cloud hosting, Linux dedicated server, Linux distros, open source, enterprise Linux, developer tools",
  authors: [{ name: "OceanLinux Team" }],
  creator: "OceanLinux",
  publisher: "OceanLinux",
  robots: "index, follow",
  openGraph: {
    title: "OceanLinux - The Ocean of Linux",
    description: "The Ocean of Linux, Discover the ocean of Linux distributions with OceanLinux. Access premium Linux hosting, VPS servers, dedicated servers, and cloud hosting solutions. Professional Linux infrastructure for developers and enterprises.",
    url: "https://oceanlinux.com",
    siteName: "OceanLinux",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "OceanLinux - The Ocean of Linux"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "OceanLinux - The Ocean of Linux",
    description: "The Ocean of Linux, Discover the ocean of Linux distributions with OceanLinux. Access premium Linux hosting, VPS servers, dedicated servers, and cloud hosting solutions. Professional Linux infrastructure for developers and enterprises.",
    images: ["/twitter-image.png"],
    creator: "@oceanlinux"
  },
  alternates: {
    canonical: "https://oceanlinux.com"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  },
  manifest: "/site.webmanifest",
  category: "Technology"
};

// Structured data for better SEO
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OceanLinux",
  alternateName: "OceanLinux - The Ocean of Linux",
  url: "https://oceanlinux.com",
  logo: "https://oceanlinux.com/logo.png",
  description: "The Ocean of Linux, Professional Linux distribution hub offering premium hosting, VPS, and cloud solutions.",
  foundingDate: "2024",
  sameAs: [
    "https://github.com/oceanlinux",
    "https://twitter.com/oceanlinux",
    "https://linkedin.com/company/oceanlinux"
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-800-OCEAN-LX",
    contactType: "Customer Service",
    availableLanguage: "English"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData)
          }}
        />
        {/* Add Razorpay script */}
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              border: '1px solid hsl(var(--border))'
            }
          }}
        />
        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
