import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import RenewalLog from '@/models/renewalLogModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function PATCH(request, { params }) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        const { id } = await params;
        const body = await request.json();

        const log = await RenewalLog.findById(id);
        if (!log) {
            return NextResponse.json({ success: false, message: 'Renewal log not found' }, { status: 404 });
        }

        const adminUserId = (() => {
            try {
                return getDataFromToken(request);
            } catch {
                return null;
            }
        })();

        if (body.manualConfirm === true) {
            log.manualConfirmedAt = new Date();
            log.manualConfirmedBy = adminUserId || undefined;
            log.manualConfirmNote = String(body.note || 'Manually renewed by admin').trim();
            await log.save();

            return NextResponse.json({
                success: true,
                message: 'Marked as manually renewed',
                log,
            });
        }

        if (body.manualConfirm === false) {
            log.manualConfirmedAt = undefined;
            log.manualConfirmedBy = undefined;
            log.manualConfirmNote = '';
            await log.save();

            return NextResponse.json({
                success: true,
                message: 'Manual confirmation removed',
                log,
            });
        }

        return NextResponse.json({ success: false, message: 'No valid update action' }, { status: 400 });
    } catch (error) {
        console.error('[RENEWAL-LOGS-API] PATCH error:', error);
        return NextResponse.json(
            { success: false, message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}
