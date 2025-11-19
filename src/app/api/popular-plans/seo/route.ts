import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await connectDB();

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Aggregate orders from the last 7 days to find most popular products
    const popularProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          status: { $in: ['active', 'pending', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: '$productName',
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      },
      {
        $sort: { orderCount: -1 }
      },
      {
        $limit: 10 // Get top 10 for SEO
      }
    ]);

    // Generate SEO-friendly structured data
    const offers = popularProducts.map((product, index) => ({
      "@type": "Offer",
      "name": product._id,
      "description": `${product._id} - Popular Linux VPS Hosting Plan with ${product.orderCount} orders in the last week`,
      "price": Math.round(product.avgPrice),
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock",
      "url": `https://oceanlinux.com/get-started?plan=${encodeURIComponent(product._id)}`,
      "seller": {
        "@type": "Organization",
        "name": "OceanLinux"
      },
      "priceValidUntil": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": product.orderCount,
        "bestRating": "5",
        "worstRating": "1"
      }
    }));

    // Create Product schema with all offers
    const productSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Linux VPS Hosting Plans",
      "description": "Affordable premium Linux VPS hosting with enterprise features. Most popular plans chosen by real customers.",
      "brand": {
        "@type": "Brand",
        "name": "OceanLinux"
      },
      "offers": offers.length > 0 ? offers : [{
        "@type": "Offer",
        "price": "599",
        "priceCurrency": "INR",
        "availability": "https://schema.org/InStock"
      }],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": popularProducts.reduce((sum, p) => sum + p.orderCount, 0) || 100,
        "bestRating": "5",
        "worstRating": "1"
      }
    };

    // Generate meta tags
    const metaTags = {
      title: `Affordable Linux VPS Hosting Plans from ₹${popularProducts[0]?.avgPrice || 599}/mo | OceanLinux`,
      description: `Best Linux VPS hosting plans starting at ₹${popularProducts[0]?.avgPrice || 599}/month. ${popularProducts.length > 0 ? `Top choice: ${popularProducts[0]._id} with ${popularProducts[0].orderCount} orders this week.` : 'Premium features, enterprise security, 24/7 support.'} 99.9% uptime guaranteed.`,
      keywords: [
        'linux vps hosting',
        'affordable vps hosting',
        'cheap linux server',
        'premium vps hosting india',
        'linux dedicated server',
        'ubuntu vps hosting',
        'centos vps hosting',
        'managed linux hosting',
        'cloud linux hosting',
        'best vps hosting india',
        ...popularProducts.map(p => p._id.toLowerCase())
      ].join(', ')
    };

    return NextResponse.json({
      success: true,
      schema: productSchema,
      meta: metaTags,
      plans: popularProducts.map((p, i) => ({
        name: p._id,
        orderCount: p.orderCount,
        avgPrice: Math.round(p.avgPrice),
        rank: i + 1
      }))
    });

  } catch (error: any) {
    console.error('Error fetching SEO data:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch SEO data',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

