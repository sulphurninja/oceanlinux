// Test endpoint to see SmartVPS ipstock response
const SmartVpsAPI = require('@/services/smartvpsApi');

export async function GET() {
    try {
        console.log('[TEST-IPSTOCK] Calling SmartVPS ipstock API...');

        const smartvps = new SmartVpsAPI();
        const response = await smartvps.ipstock();

        console.log('[TEST-IPSTOCK] Raw response:', response);
        console.log('[TEST-IPSTOCK] Response type:', typeof response);

        // Try to parse if string
        let parsed = response;
        if (typeof response === 'string') {
            try {
                parsed = JSON.parse(response);
            } catch (e) {
                console.log('[TEST-IPSTOCK] Failed to parse:', e.message);
            }
        }

        console.log('[TEST-IPSTOCK] Parsed response:', JSON.stringify(parsed, null, 2));

        return Response.json({
            success: true,
            rawResponse: response,
            parsedResponse: parsed,
            responseType: typeof response
        }, { status: 200 });

    } catch (error) {
        console.error('[TEST-IPSTOCK] Error:', error.message);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
