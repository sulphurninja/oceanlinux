import { GET as renewGet, POST as renewPost } from '../../../orders/[orderId]/renew/route';

/** GET/POST /api/v1/reseller/vms/{id}/renew — alias for /orders/{orderId}/renew */
export async function GET(request, context) {
  return renewGet(request, { params: { orderId: context.params.id } });
}

export async function POST(request, context) {
  return renewPost(request, { params: { orderId: context.params.id } });
}
