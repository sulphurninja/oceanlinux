import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free Proxy Setup Tool | One-Click Squid Proxy Installation | OceanLinux',
  description: 'Install and configure a Squid proxy server on your Linux VPS in seconds. Free one-click proxy setup tool for Ubuntu, CentOS, Debian. No technical knowledge required.',
  keywords: [
    'proxy setup tool',
    'squid proxy installer',
    'linux proxy setup',
    'free proxy tool',
    'one click proxy',
    'vps proxy setup',
    'ubuntu proxy setup',
    'centos proxy setup',
    'proxy server installation',
    'http proxy setup',
    'squid proxy configuration',
    'proxy authentication setup',
    'linux vps proxy',
    'automated proxy setup',
    'proxy installer script',
    'oceanlinux proxy tool'
  ],
  openGraph: {
    title: 'Free One-Click Proxy Setup Tool | OceanLinux',
    description: 'Install Squid proxy on your Linux VPS in 2 minutes. Works with Ubuntu, CentOS, Debian. Free tool by OceanLinux.',
    url: 'https://oceanlinux.com/tools/proxy-setup',
    siteName: 'OceanLinux',
    images: [
      {
        url: '/oceanlinux.png',
        width: 1200,
        height: 630,
        alt: 'OceanLinux Proxy Setup Tool',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Proxy Setup Tool | OceanLinux',
    description: 'One-click Squid proxy installation for Linux VPS. No technical knowledge required.',
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
    canonical: 'https://oceanlinux.com/tools/proxy-setup',
  },
};

export default function ProxySetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "OceanLinux Proxy Setup Tool",
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Linux",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            },
            "description": "Free one-click proxy server setup tool for Linux VPS. Install and configure Squid proxy in seconds.",
            "softwareVersion": "1.0",
            "author": {
              "@type": "Organization",
              "name": "OceanLinux",
              "url": "https://oceanlinux.com"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "ratingCount": "2500",
              "bestRating": "5",
              "worstRating": "1"
            }
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": "How to Setup a Proxy Server on Linux VPS",
            "description": "Step-by-step guide to install Squid proxy server on your Linux VPS using OceanLinux's free tool",
            "totalTime": "PT2M",
            "tool": [
              {
                "@type": "HowToTool",
                "name": "Linux VPS (Ubuntu, CentOS, or Debian)"
              },
              {
                "@type": "HowToTool", 
                "name": "SSH credentials (IP, username, password)"
              }
            ],
            "step": [
              {
                "@type": "HowToStep",
                "name": "Enter Server Credentials",
                "text": "Enter your Linux VPS IP address, SSH username, and password",
                "position": 1
              },
              {
                "@type": "HowToStep",
                "name": "Connect to Server",
                "text": "Click Connect & Setup Proxy to establish SSH connection",
                "position": 2
              },
              {
                "@type": "HowToStep",
                "name": "Create Proxy Credentials",
                "text": "Enter a username and password for your proxy authentication",
                "position": 3
              },
              {
                "@type": "HowToStep",
                "name": "Complete Setup",
                "text": "Wait for installation to complete and copy your proxy details",
                "position": 4
              }
            ]
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
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
                "name": "Tools",
                "item": "https://oceanlinux.com/tools"
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": "Proxy Setup",
                "item": "https://oceanlinux.com/tools/proxy-setup"
              }
            ]
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What operating systems are supported?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Our proxy setup tool supports Ubuntu 20.04/22.04, Debian 10/11, CentOS 7/8, Rocky Linux, and AlmaLinux."
                }
              },
              {
                "@type": "Question",
                "name": "Is this proxy setup tool free?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, our proxy setup tool is completely free to use. You only need your own Linux VPS."
                }
              },
              {
                "@type": "Question",
                "name": "What port does the proxy use?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "The proxy server is configured on port 3128, which is the standard Squid proxy port."
                }
              },
              {
                "@type": "Question",
                "name": "Is my server password secure?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, your credentials are transmitted over a secure SSH connection and are not stored on our servers."
                }
              }
            ]
          })
        }}
      />
      {children}
    </>
  );
}
