// Test endpoint to simulate SmartVPS provisioning WITHOUT purchasing
const SmartVpsAPI = require('@/services/smartvpsApi');

export async function POST(request) {
    try {
        const body = await request.json();
        const { productName, memory } = body;

        if (!productName) {
            return Response.json({ error: 'productName required (e.g., "🌊 103.82.72")' }, { status: 400 });
        }

        console.log('[TEST-PROVISION] Simulating provisioning for:', productName, memory || '16GB');

        // Step 1: Extract IP prefix from product name
        const productNameClean = String(productName).replace(/[^\d.]/g, '');
        const requestedIpPrefix = productNameClean.trim();

        console.log('[TEST-PROVISION] Extracted IP prefix:', requestedIpPrefix);

        // Step 2: Call ipstock
        const smartvps = new SmartVpsAPI();
        const ipstockRes = await smartvps.ipstock();

        let parsed = ipstockRes;
        if (typeof ipstockRes === 'string') {
            parsed = JSON.parse(ipstockRes);
        }

        const packages = parsed?.packages || [];
        console.log('[TEST-PROVISION] Found', packages.length, 'packages');

        // Step 3: Find matching package
        let selectedPackage = packages.find(pkg =>
            pkg.name === requestedIpPrefix &&
            pkg.status === 'active' &&
            Number(pkg.ipv4 || 0) > 0
        );

        let matchStrategy = null;
        if (selectedPackage) {
            matchStrategy = 'exact match';
        } else {
            // Try fallback
            const parts = requestedIpPrefix.split('.');
            const numericParts = parts.filter(p => /^\d+$/.test(p));

            if (numericParts.length >= 2) {
                const prefix2 = numericParts.slice(0, 2).join('.');
                selectedPackage = packages.find(pkg => {
                    const pkgName = String(pkg.name || '').replace(/[^0-9.]/g, '');
                    return pkgName.startsWith(prefix2) &&
                        pkg.status === 'active' &&
                        Number(pkg.ipv4 || 0) > 0;
                });

                if (selectedPackage) {
                    matchStrategy = `fallback 2-octet (${prefix2})`;
                }
            }
        }

        if (!selectedPackage) {
            return Response.json({
                success: false,
                error: `No package found matching ${requestedIpPrefix}`,
                availablePackages: packages.filter(p => p.status === 'active').slice(0, 10).map(p => ({
                    name: p.name,
                    availableIPs: p.ipv4
                }))
            }, { status: 404 });
        }

        // Extract RAM
        const ramMatch = (memory || '16GB').match(/(\d+)/);
        const ram = ramMatch ? ramMatch[1] : '16';

        // Simulate what would happen
        console.log('[TEST-PROVISION] ✅ Would call buyVps with:');
        console.log('  - Package/IP:', selectedPackage.name);
        console.log('  - RAM:', ram);

        return Response.json({
            success: true,
            simulation: {
                productOrdered: productName,
                extractedPrefix: requestedIpPrefix,
                matchStrategy: matchStrategy,
                selectedPackage: {
                    name: selectedPackage.name,
                    availableIPs: selectedPackage.ipv4,
                    status: selectedPackage.status
                },
                wouldCallBuyVps: {
                    ip: selectedPackage.name,
                    ram: ram
                },
                expectedOutcome: `SmartVPS would assign a random IP from the ${selectedPackage.name} package pool (${selectedPackage.ipv4} IPs available)`
            }
        }, { status: 200 });

    } catch (error) {
        console.error('[TEST-PROVISION] Error:', error.message);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
