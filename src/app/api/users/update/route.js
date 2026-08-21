import connectDB from '../../../../lib/db';
import User from '../../../../models/userModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken';

/**
 * Profile fields a customer may edit about themselves.
 *
 * This is an allowlist on purpose: blacklisting let callers send `userType`,
 * `isAdmin`, `walletId`, `apiSettings` or `email` and escalate their own account
 * or skip the verified email-change flow.
 */
const SCALAR_FIELDS = ['name', 'avatar', 'bio', 'location', 'phone', 'company', 'website'];
const BILLING_FIELDS = ['line', 'city', 'state', 'pincode', 'country'];
const SOCIAL_FIELDS = ['github', 'twitter', 'linkedin'];
const NOTIFICATION_FIELDS = ['email', 'push', 'orderUpdates', 'marketing'];
const THEMES = ['light', 'dark', 'system'];

function pickNested(source, allowed, transform = (v) => String(v ?? '').trim()) {
  if (!source || typeof source !== 'object') return null;
  const out = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = transform(source[key]);
  }
  return Object.keys(out).length ? out : null;
}

function buildProfileUpdate(body) {
  const update = {};
  if (!body || typeof body !== 'object') return update;

  for (const field of SCALAR_FIELDS) {
    if (body[field] !== undefined) update[field] = String(body[field] ?? '').trim();
  }

  const billing = pickNested(body.billingAddress, BILLING_FIELDS);
  if (billing) {
    for (const [key, value] of Object.entries(billing)) {
      update[`billingAddress.${key}`] = value;
    }
  }

  const social = pickNested(body.socialLinks, SOCIAL_FIELDS);
  if (social) {
    for (const [key, value] of Object.entries(social)) {
      update[`socialLinks.${key}`] = value;
    }
  }

  const prefs = body.preferences;
  if (prefs && typeof prefs === 'object') {
    if (THEMES.includes(prefs.theme)) update['preferences.theme'] = prefs.theme;
    if (prefs.language !== undefined) {
      update['preferences.language'] = String(prefs.language ?? '').trim();
    }
    if (prefs.timezone !== undefined) {
      update['preferences.timezone'] = String(prefs.timezone ?? '').trim();
    }

    const notifications = pickNested(
      prefs.notifications,
      NOTIFICATION_FIELDS,
      (v) => v === true || v === 'true'
    );
    if (notifications) {
      for (const [key, value] of Object.entries(notifications)) {
        update[`preferences.notifications.${key}`] = value;
      }
    }
  }

  return update;
}

export async function POST(request) {
    try {
        await connectDB();

        let userId;
        try {
            userId = await getDataFromToken(request);
        } catch {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await request.json();
        const profileUpdate = buildProfileUpdate(body);

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { ...profileUpdate, lastLogin: new Date() },
            {
                new: true,
                runValidators: true,
                select: '-password',
                lean: true
            }
        );

        if (!updatedUser) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            message: 'Profile updated successfully',
            user: updatedUser
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        return new Response(JSON.stringify({
            message: 'Failed to update profile'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
