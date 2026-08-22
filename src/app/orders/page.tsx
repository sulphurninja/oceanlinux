import { redirect } from 'next/navigation';

/** Entry for http://host:5655/orders — opens company portal on Orders tab. */
export const dynamic = 'force-dynamic';

export default function OrdersPortalRedirect() {
  const slug = process.env.COMPANY_ORDERS_PORTAL_SLUG || 'siteworx';
  redirect(`/company/${slug}?tab=orders`);
}
