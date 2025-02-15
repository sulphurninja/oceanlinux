import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import IPStock from '@/models/ipStockModel'

export async function POST() {
  await connectDB()
  const updates = [
    {
      ip: "103.73.222.xx",
      newName: "Essential Linux #1 – IP: 103.73.222.xx",
      description: "An entry-level Linux hosting plan best suited for personal blogs, small portfolios, and low-traffic websites. Delivers stable performance within India for smooth user experiences."
    },
    {
      ip: "103.216.173.xx",
      newName: "Essential Linux #2 – IP: 103.216.173.xx",
      description: "Ideal for bloggers, developers, or small startups on a budget. Includes dependable uptime, basic resource allocation, and straightforward setup for emerging projects."
    },
    {
      ip: "103.230.69.xx",
      newName: "Essential Linux #3 – IP: 103.230.69.xx",
      description: "Designed for moderate site usage in India, balancing performance and affordability. Perfect for hosting single-page applications, test environments, or smaller e-commerce trials."
    },
    {
      ip: "103.204.22.xx",
      newName: "Standard Linux #1 – IP: 103.204.22.xx",
      description: "A balanced plan suitable for growing businesses aiming for stable hosting and frequent content updates. Provides a secure environment and seamless scalability options."
    },
    {
      ip: "103.243.119.xx",
      newName: "Standard Linux #2 – IP: 103.243.119.xx",
      description: "Tailored for websites that require reliable resources and periodic traffic bursts. Features faster data processing and essential support for small-to-mid sized Indian companies."
    },
    {
      ip: "103.68.120.xx",
      newName: "Standard Linux #3 – IP: 103.68.120.xx",
      description: "Useful for running multiple small applications or a single mid-range e-commerce store. Ensures consistent uptime and compatibility with popular frameworks."
    },
    {
      ip: "157.254.25.xx",
      newName: "Enhanced Linux #1 – IP: 157.254.25.xx",
      description: "Offers improved memory and CPU utilization for busier websites, media-rich portals, or regional forums. Ideal for projects expecting steady growth in traffic from India."
    },
    {
      ip: "103.47. 59.XX",
      newName: "Enhanced Linux #2 – IP: 103.47.59.XX",
      description: "Supports medium to high resource requirements. Provides better DDoS shielding and expanded bandwidth for content-heavy sites, including streaming or news portals."
    },
    {
      ip: "103.231.59.xx",
      newName: "Enhanced Linux #3 – IP: 103.231.59.xx",
      description: "A recommended solution for dynamic applications handling data transactions and interactive user sessions. Suitable for modern SaaS implementations in the Indian market."
    },
    {
      ip: "216.122.167.xx",
      newName: "Advanced Linux #1 – IP: 216.122.167.xx",
      description: "Geared towards enterprises with multi-layer security needs. Delivers robust performance under sustained load and is ideal for sizable corporate or institutional websites."
    },
    {
      ip: "103.69.226.xx",
      newName: "Advanced Linux #2 – IP: 103.69.226.xx",
      description: "Handles heavy computational tasks and rapid content delivery without compromising stability. Perfect for busy forums, collaboration platforms, or resource-intensive back ends."
    },
    {
      ip: "103.227.xx (Gold Linux)",
      newName: "Premium Gold #1 – IP: 103.227.xx",
      description: "Engineered for high-traffic e-commerce ventures or complex data-driven applications. Includes advanced support options and cutting-edge security features for peace of mind."
    },
    {
      ip: "104.234.xx (Gold Linux)",
      newName: "Premium Gold #2 – IP: 104.234.xx",
      description: "Optimized for online stores and popular CMS platforms running at scale. Ensures low latency, enhanced caching, and a fortified firewall for user and data protection."
    },
    {
      ip: "103.17.xx (Gold Linux)",
      newName: "Premium Gold #3 – IP: 103.17.xx",
      description: "Suited for mission-critical deployments demanding top-tier performance. Capable of handling significant workloads while maintaining fast page loads and secure sessions."
    },
    {
      ip: "103.243.xx (Gold Linux)",
      newName: "Premium Gold #4 – IP: 103.243.xx",
      description: "Suitable for businesses experiencing rapid growth and fluctuating traffic. Delivers swift data processing, robust redundancy, and flexible scaling features."
    },
    {
      ip: "45.157.xx (Gold Linux)",
      newName: "Premium Gold #5 – IP: 45.157.xx",
      description: "Positioned for customers seeking premium bandwidth allocation and near-zero downtime. Ideal for nationwide or international audiences requiring consistent performance."
    },
    {
      ip: "103.72.xx (Gold Linux)",
      newName: "Premium Gold #6 – IP: 103.72.xx",
      description: "Engineered for larger web applications, multiplayer gaming platforms, or video hosting. Provides heightened security layers and specialized network optimizations."
    },
    {
      ip: "103.112.xx (Gold Linux)",
      newName: "Premium Gold #7 – IP: 103.112.xx",
      description: "High-end service plan with ample headroom for data-heavy operations. Outstanding for Indian startups looking to deliver rich media content to vast user bases."
    },
    {
      ip: "172.111.xx (Gold Linux)",
      newName: "Premium Gold #8 – IP: 172.111.xx",
      description: "Stands apart with advanced server hardening and swift resource scaling. Best for complex corporate sites, ERP systems, and large-scale data analytics in India."
    },
    {
      ip: "168.220.xx",
      newName: "Essential Linux #4 – IP: 168.220.xx",
      description: "A simple yet effective choice for local enterprises or personal users. Provides a stable environment for smaller websites and test-driven development setups."
    }
  ]
  for (const item of updates) {
    await IPStock.updateOne(
      { name: item.ip },
      {
        $set: {
          name: item.newName,
          description: item.description
        }
      }
    )
  }
  return NextResponse.json({ message: "IPStock documents updated successfully." })
}
