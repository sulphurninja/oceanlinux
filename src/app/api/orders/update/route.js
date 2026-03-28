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
    const advpsNotes = [];
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
          const svc = svcData?.service || svcData;

          if (svc?.ip || svcData?.ip) {
            updateFields.ipAddress = svc?.ip || svcData?.ip;
            advpsNotes.push(`IP fetched: ${updateFields.ipAddress}`);
          }

          if (svc?.productInfo?.os || svc?.os?.name) {
            const osName = svc?.os?.name || svc?.productInfo?.os || '';
            if (osName.toLowerCase().includes('windows')) {
              updateFields.os = 'Windows 2022 64';
            } else if (osName.toLowerCase().includes('ubuntu')) {
              updateFields.os = 'Ubuntu 22';
            } else if (osName.toLowerCase().includes('centos')) {
              updateFields.os = 'CentOS 7';
            }
          }

          if (svc?.expiryDate) {
            updateFields.expiryDate = new Date(svc.expiryDate);
          }

          advpsSynced = true;
        } catch (err) {
          console.error('[ORDER-UPDATE] ADVPS status fetch failed:', err.message);
          advpsNotes.push('Failed to fetch service status from ADVPS');
        }

        try {
          const passRes = await api.generatePassword(advpsServiceId);
          const newPassword = passRes?.data?.password;
          if (newPassword) {
            updateFields.password = newPassword;
            advpsNotes.push('Password generated and saved');
          }
        } catch (err) {
          const msg = err.message || '';
          if (msg.includes('already exists') || msg.includes('Password already')) {
            advpsNotes.push('Password was already generated for this service. Enter it manually if not saved.');
            console.log('[ORDER-UPDATE] ADVPS password already exists, admin must enter manually');
          } else {
            advpsNotes.push(`Password generation failed: ${msg}`);
            console.error('[ORDER-UPDATE] ADVPS password generation failed:', msg);
          }
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
      { message: 'Order updated', order: updatedOrder, advpsNotes: advpsNotes.length > 0 ? advpsNotes : undefined },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
