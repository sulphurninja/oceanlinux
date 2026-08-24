import { NextResponse } from 'next/server';
import { UNIVERSAL_ACTIONS } from '@/lib/resellerServerManage';
import { RESELLER_PANEL_ENDPOINTS } from '@/lib/resellerPanelApi';

/** GET /api/v1/reseller — universal API index */
export async function GET() {
  return NextResponse.json({
    success: true,
    name: 'OceanLinux Universal Reseller API',
    version: '1.1',
    baseUrl: '/api/v1/reseller',
    auth: {
      headers: {
        'x-api-key': 'Your reseller API key (rz_...)',
        'x-api-secret': 'Your reseller API secret (sec_...)',
      },
    },
    panelEndpoints: RESELLER_PANEL_ENDPOINTS,
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
      '1. GET /plans (or /products) → show stock',
      '2. POST /vms (or /orders) → deploy server',
      '3. GET /vms/{id} → IP + password (poll until ready)',
      '4. POST /orders/manage → start/stop/restart/reinstall',
      '5. POST /vms/{id}/renew → extend service',
      '6. GET /transactions → wallet ledger',
    ],
    legacyEndpoints: {
      note: 'Legacy /orders and /products paths remain supported alongside /vms and /plans.',
    },
  });
}
