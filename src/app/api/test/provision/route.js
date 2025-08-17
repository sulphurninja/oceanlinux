import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import IPStock from '@/models/ipStockModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();

  try {
    const { orderId, testMode = true, productId = "1" } = await request.json();

    console.log(`[TEST-PROVISION] Starting test for order: ${orderId || 'new test order'}`);

    let testOrder;

    if (orderId) {
      // Use existing order
      testOrder = await Order.findById(orderId);
      if (!testOrder) {
        throw new Error(`Order ${orderId} not found`);
      }
    } else {
      // Create test order and user
      let testUser = await User.findOne({ email: 'auto-test@example.com' });
      if (!testUser) {
        testUser = await User.create({
          name: 'Auto Test User',
          email: 'auto-test@example.com',
          password: 'testpass123'
        });
      }

      // Create test IP Stock with the provided product ID
      let testIPStock = await IPStock.findOne({ name: 'Auto-Provision Test Stock' });
      if (!testIPStock) {
        testIPStock = await IPStock.create({
          name: 'Auto-Provision Test Stock',
          description: 'Test stock for auto-provisioning',
          serverType: 'VPS',
          available: true,
          tags: ['test'],
          memoryOptions: {
            '4GB': {
              price: 999,
              hostycareProductId: productId,
              hostycareProductName: 'Test Auto VPS 4GB'
            }
          },
          promoCodes: []
        });
      }

      // Create test order
      testOrder = await Order.create({
        user: testUser._id,
        productName: 'Auto-Provision Test Server',
        memory: '4GB',
        price: 999,
        ipStockId: testIPStock._id,
        clientTxnId: `AUTO_TEST_${Date.now()}`,
        status: 'confirmed',
        customerName: 'Auto Test User',
        customerEmail: 'auto-test@example.com',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      console.log(`[TEST-PROVISION] Created test order: ${testOrder._id}`);
    }

    if (testMode) {
      // Mock provisioning
      console.log(`[TEST-PROVISION] Running in MOCK mode...`);

      await Order.findByIdAndUpdate(testOrder._id, {
        hostycareServiceId: 'MOCK_SERVICE_123',
        username: 'mockuser123',
        password: 'MockPass123!',
        ipAddress: '192.168.1.100',
        provisioningStatus: 'active',
        status: 'active',
        autoProvisioned: true,
        os: 'Ubuntu 22'
      });

      return NextResponse.json({
        success: true,
        message: 'Mock auto-provisioning completed successfully',
        orderId: testOrder._id,
        mode: 'mock',
        result: {
          serviceId: 'MOCK_SERVICE_123',
          ipAddress: '192.168.1.100',
          username: 'mockuser123'
        }
      });

    } else {
      // Real provisioning
      console.log(`[TEST-PROVISION] Running REAL provisioning...`);

      const provisioningService = new AutoProvisioningService();
      const result = await provisioningService.provisionServer(testOrder._id.toString());

      return NextResponse.json({
        success: result.success,
        message: result.success ? 'Real auto-provisioning completed' : 'Auto-provisioning failed',
        orderId: testOrder._id,
        mode: 'real',
        result: result
      });
    }

  } catch (error) {
    console.error('[TEST-PROVISION] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
