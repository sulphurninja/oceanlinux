import { NextResponse } from 'next/server';
const HostycareAPI = require('@/services/hostycareApi');
import { enforceAdmin } from '@/lib/apiSecurity';

export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const action = (searchParams.get('action') || 'connection').toLowerCase();

    console.log('[DEBUG] Environment check:');
    console.log('  HOSTYCARE_USERNAME:', process.env.HOSTYCARE_USERNAME ? 'SET' : 'MISSING');
    console.log('  HOSTYCARE_API_KEY:', process.env.HOSTYCARE_API_KEY ? 'SET' : 'MISSING');
    if (!process.env.HOSTYCARE_USERNAME || !process.env.HOSTYCARE_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables',
        debug: { 
          username: process.env.HOSTYCARE_USERNAME ? 'SET' : 'MISSING',
          apiKey: process.env.HOSTYCARE_API_KEY ? 'SET' : 'MISSING'
        }
      }, { status: 400 });
    }
    const hostycareApi = new HostycareAPI();

    if (action === 'connection' || !serviceId) {
      console.log('[DEBUG] Testing connection only...');
      const connectionTest = await hostycareApi.testConnection();
      return NextResponse.json({
        success: true,
        message: 'Connection test successful',
        connection: connectionTest
      });
    }

    console.log(`[DEBUG] Testing Hostycare action=${action} serviceId=${serviceId}`);
    let powerResult;
    switch (action) {
      case 'info':
        powerResult = await hostycareApi.getServiceInfo(serviceId);
        break;
      case 'details':
        powerResult = await hostycareApi.getServiceDetails(serviceId);
        break;
      case 'start':
        powerResult = await hostycareApi.startService(serviceId);
        break;
      case 'stop':
        powerResult = await hostycareApi.stopService(serviceId);
        break;
      case 'reboot':
      case 'restart':
        powerResult = await hostycareApi.rebootService(serviceId);
        break;
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action "${action}". Use: connection, info, details, start, stop, reboot`,
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Hostycare ${action} OK`,
      action,
      serviceId,
      result: powerResult,
    });
  } catch (error) {
    console.error('[DEBUG] Hostycare API test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      debug: {
        username: process.env.HOSTYCARE_USERNAME ? 'SET' : 'MISSING',
        apiKey: process.env.HOSTYCARE_API_KEY ? 'SET' : 'MISSING',
        endpoint: 'https://www.hostycare.com/manage/modules/addons/ProductsReseller/api/index.php',
        errorDetails: error.toString(),
      }
    }, { status: 500 });
  }
}
