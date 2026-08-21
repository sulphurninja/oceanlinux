import { NextResponse } from 'next/server';
import { UNIVERSAL_ACTIONS } from '@/lib/resellerServerManage';

/** GET /api/v1/reseller — universal API index */
export async function GET() {
  return NextResponse.json({
    success: true,
    name: 'OceanLinux Universal Reseller API',
    version: '1.0',
    baseUrl: '/api/v1/reseller',
    auth: {
      headers: {
        'x-api-key': 'Your reseller API key (rz_...)',
        'x-api-secret': 'Your reseller API secret (sec_...)',
      },
    },
    endpoints: {
      account: { method: 'GET', path: '/account', description: 'Account + wallet summary' },
      wallet: { method: 'GET', path: '/wallet', description: 'Balance + transactions' },
      products: { method: 'GET', path: '/products', description: 'Stock list with your prices' },
      buy: { method: 'POST', path: '/orders', description: 'Purchase server (wallet deduct + auto provision)' },
      orders: { method: 'GET', path: '/orders', description: 'List your orders' },
      orderDetail: { method: 'GET', path: '/orders/{orderId}', description: 'Order + credentials + management capabilities' },
      status: {
        method: 'GET',
        path: '/orders/{orderId}/status',
        description: 'Live online/offline — same as OceanLinux panel',
        response: { online: true, powerState: 'running|stopped|unknown' },
      },
      sync: {
        method: 'POST',
        path: '/orders/{orderId}/sync',
        description: 'Pull latest IP, username, password, validity from OceanLinux',
        response: {
          ipAddress: '',
          username: '',
          password: '',
          validity: { expiryDate: '', daysRemaining: 0, status: 'active|expired' },
        },
      },
      manage: {
        method: 'POST',
        path: '/orders/manage',
        description: 'start | stop | restart | reinstall | changeos | resetmac',
        body: { orderId: 'required', action: UNIVERSAL_ACTIONS.join('|'), osType: 'optional' },
      },
      renew: {
        method: 'POST',
        path: '/orders/{orderId}/renew',
        description: 'Renew service — wallet deduct + extend expiry',
      },
      renewQuote: {
        method: 'GET',
        path: '/orders/{orderId}/renew',
        description: 'Check renewal price + eligibility',
      },
    },
    simpleFlow: [
      '1. GET /products → show stock',
      '2. POST /orders → buy server',
      '3. GET /orders/{id} → IP + password (poll until ready)',
      '4. GET /orders/{id}/status → online/offline',
      '5. POST /orders/manage → start/stop/restart/reinstall/resetmac',
      '6. POST /orders/{id}/sync → refresh IP/password after reinstall',
      '7. POST /orders/{id}/renew → extend service',
    ],
  });
}
