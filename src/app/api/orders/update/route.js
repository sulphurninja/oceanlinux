import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AdvpsAPI = require('@/services/advpsApi');

export async function POST(request) {
  await connectDB();

  try {
    const { orderId, ipAddress, username, password, status, os, provider, provisioningStatus, advpsServiceId } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { message: 'Missing orderId' },
        { status: 400 }
      );
    }

    const updateFields = {
      ipAddress: ipAddress || '',
      username: username || '',
      password: password || '',
      os: os || 'CentOS 7',
      status: status || 'pending',
    };
    if (provider) updateFields.provider = provider;
    if (provisioningStatus) updateFields.provisioningStatus = provisioningStatus;
    if (advpsServiceId !== undefined) updateFields.advpsServiceId = advpsServiceId || '';

    // Auto-fetch IP and password from ADVPS when a service ID is set/changed
    if (advpsServiceId) {
      const existingOrder = await Order.findById(orderId);
      const isNewServiceId = !existingOrder?.advpsServiceId || existingOrder.advpsServiceId !== advpsServiceId;

      if (isNewServiceId) {
        console.log('[ORDER-UPDATE] New ADVPS serviceId detected, fetching IP and password from ADVPS...');
        const api = new AdvpsAPI();
        let advpsSynced = false;

        try {
          const statusRes = await api.status(advpsServiceId);
          const svcData = statusRes?.data || statusRes;
          if (svcData?.ip) {
            updateFields.ipAddress = svcData.ip;
            console.log('[ORDER-UPDATE] ADVPS IP fetched:', svcData.ip);
          }
          advpsSynced = true;
        } catch (err) {
          console.error('[ORDER-UPDATE] ADVPS status fetch failed:', err.message);
        }

        try {
          const passRes = await api.generatePassword(advpsServiceId);
          const newPassword = passRes?.data?.password;
          if (newPassword) {
            updateFields.password = newPassword;
            console.log('[ORDER-UPDATE] ADVPS password generated');
          }
        } catch (err) {
          console.error('[ORDER-UPDATE] ADVPS password generation failed:', err.message);
        }

        if (advpsSynced) {
          updateFields.provider = 'advps';
          updateFields.provisioningStatus = 'active';
          updateFields.status = 'active';
          updateFields.lastSyncTime = new Date();
        }
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateFields,
      { new: true }
    );

    if (!updatedOrder) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'Order updated', order: updatedOrder },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
