import { NextResponse } from 'next/server';
const HostycareAPI = require('@/services/hostycareApi');

export async function GET(request) {
  try {
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
    // Test connection only (simplify for debugging)
    console.log('[DEBUG] Testing connection only...');
    const connectionTest = await hostycareApi.testConnection();
    return NextResponse.json({
      success: true,
      message: 'Connection test successful',
      connection: connectionTest
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
