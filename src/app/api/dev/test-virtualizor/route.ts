import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountIndex = parseInt(searchParams.get('account') || '0');
  
  try {
    // Import VirtualizorAPI
    const { VirtualizorAPI } = await import('@/services/virtualizorApi');
    const api = new VirtualizorAPI();
    
    console.log(`[TEST-VIRTUALIZOR] Testing account ${accountIndex}`);
    console.log(`[TEST-VIRTUALIZOR] Total accounts loaded: ${api.accounts.length}`);
    
    if (accountIndex >= api.accounts.length) {
      return NextResponse.json({
        success: false,
        error: `Account ${accountIndex} does not exist. Available accounts: 0-${api.accounts.length - 1}`
      }, { status: 400 });
    }
    
    const account = api.accounts[accountIndex];
    console.log(`[TEST-VIRTUALIZOR] Testing connection to: ${account.host}:${account.port}`);
    
    // Test simple API call
    const startTime = Date.now();
    
    try {
      const result = await api._listMyVms(accountIndex);
      const duration = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        accountIndex,
        host: account.host,
        port: account.port,
        protocol: account.protocol || 'https',
        duration: `${duration}ms`,
        vmsCount: result.length,
        message: `Successfully connected to ${account.host}`,
        sample: result.slice(0, 3).map(vm => ({
          vpsid: vm.vpsid,
          hostname: vm.hostname,
          ip: vm.ips?.[0] || 'No IP'
        }))
      });
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      return NextResponse.json({
        success: false,
        accountIndex,
        host: account.host,
        port: account.port,
        protocol: account.protocol || 'https',
        duration: `${duration}ms`,
        error: error.message,
        errorType: error.name,
        suggestions: [
          'Check if the server is reachable',
          'Verify SSL certificate is valid',
          'Check if port 4083 is open',
          'Try setting NODE_TLS_REJECT_UNAUTHORIZED=0 (dev only)',
          'Contact Hostycare support',
          'Try using HTTP instead of HTTPS',
          'Verify your IP is whitelisted'
        ]
      }, { status: 500 });
    }
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Failed to initialize VirtualizorAPI'
    }, { status: 500 });
  }
}




