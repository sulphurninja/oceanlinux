import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import userWalletService, {
  MAX_ADMIN_WALLET_CREDIT,
  inspectIntegrity,
} from '@/services/userWalletService';
import { requireAdmin } from '@/lib/adminAuth';
import { adminTotpFailure } from '@/lib/adminTotp';

export async function GET(request, { params }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const { userId } = await params;
    const user = await User.findById(userId).select('name email').lean();
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const wallet = await userWalletService.getOrCreateWallet(userId);
    const balance = await userWalletService.getBalance(userId);
    const integrity = await inspectIntegrity(userId);

    return NextResponse.json({
      success: true,
      user: { _id: userId, name: user.name, email: user.email },
      wallet: {
        balance,
        currency: wallet.currency || 'INR',
        totalCredits: wallet.totalCredits || 0,
        totalDebits: wallet.totalDebits || 0,
        isActive: wallet.isActive !== false,
      },
      integrity,
      limits: { maxAdminCredit: MAX_ADMIN_WALLET_CREDIT },
    });
  } catch (error) {
    console.error('[ADMIN-USER-WALLET][GET]', error);
    return NextResponse.json(
      { message: 'Failed to fetch wallet', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const { userId } = await params;
    const user = await User.findById(userId).select('name email').lean();
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const totpError = adminTotpFailure(body.authCode);
    if (totpError) {
      return NextResponse.json({ message: totpError.message }, { status: totpError.status });
    }

    const amount = Number(body.amount);
    const action = body.action === 'deduct' ? 'deduct' : 'add';
    const defaultDescription =
      action === 'deduct'
        ? `Wallet deduction by admin (${admin.name || admin.email || 'Admin'})`
        : `Wallet credit by admin (${admin.name || admin.email || 'Admin'})`;
    const description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : defaultDescription;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: 'Amount must be a positive number' }, { status: 400 });
    }

    if (action !== 'deduct' && amount > MAX_ADMIN_WALLET_CREDIT) {
      return NextResponse.json(
        {
          message: `Admin credit capped at ₹${MAX_ADMIN_WALLET_CREDIT.toLocaleString('en-IN')} per request (got ₹${amount.toLocaleString('en-IN')}).`,
        },
        { status: 400 }
      );
    }

    const metadata = {
      source: 'admin_panel',
      performedBy: String(admin._id),
      performedByEmail: admin.email,
    };

    let result;
    if (action === 'deduct') {
      const balance = await userWalletService.getBalance(userId);
      if (balance < amount) {
        return NextResponse.json(
          {
            message: `Insufficient balance. User has ₹${balance.toLocaleString('en-IN')}, cannot deduct ₹${amount.toLocaleString('en-IN')}.`,
          },
          { status: 400 }
        );
      }

      result = await userWalletService.debit(userId, amount, {
        description,
        reference: `admin_debit_${Date.now()}`,
        metadata,
      });

      return NextResponse.json({
        success: true,
        message: `Deducted ₹${amount.toLocaleString('en-IN')} from ${user.name}'s wallet`,
        newBalance: result.balanceAfter,
        walletTxnId: result.walletTxnId,
        transaction: result.transaction,
      });
    }

    const type = body.type === 'bonus' ? 'bonus' : 'credit';
    result = await userWalletService.credit(userId, amount, {
      type,
      description,
      reference: `admin_credit_${Date.now()}`,
      metadata,
    });

    return NextResponse.json({
      success: true,
      message: `Added ₹${amount.toLocaleString('en-IN')} to ${user.name}'s wallet`,
      newBalance: result.balanceAfter,
      walletTxnId: result.walletTxnId,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error('[ADMIN-USER-WALLET][POST]', error);
    const isInsufficient = error.message === 'Insufficient wallet balance';
    return NextResponse.json(
      {
        message: isInsufficient
          ? 'Insufficient wallet balance for this deduction'
          : 'Failed to update wallet balance',
        error: error.message,
      },
      { status: isInsufficient ? 400 : 500 }
    );
  }
}
