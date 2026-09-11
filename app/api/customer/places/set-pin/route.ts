import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { hashPin } from '@/lib/cashier';
import { validatePin } from '@/lib/validation';

/**
 * Phase 27.3 — POST /api/customer/places/set-pin
 * Sets the 4-digit PIN for a specific customer_auth_links entry.
 * If applyToAllPlaces is true, sets the same PIN for all links belonging to this user.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { linkId, pin, applyToAllPlaces } = body;

    if (!linkId) {
      return NextResponse.json({ success: false, error: 'linkId is required' }, { status: 400 });
    }

    const pinVal = validatePin(pin);
    if (!pinVal.isValid) {
      return NextResponse.json({ success: false, error: pinVal.errorMessage, errorKey: pinVal.errorKey }, { status: 400 });
    }

    const adminClient = getServiceSupabase();

    // Verify the link belongs to this user
    const { data: link, error: linkError } = await adminClient
      .from('customer_auth_links')
      .select('id, auth_user_id')
      .eq('id', linkId)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ success: false, error: 'Link not found' }, { status: 404 });
    }

    const pinHash = hashPin(pin);

    if (applyToAllPlaces) {
      // Set the same PIN for all links belonging to this auth user
      const { error: updateError } = await adminClient
        .from('customer_auth_links')
        .update({
          access_pin_hash: pinHash,
          failed_pin_attempts: 0,
          locked_until: null,
        })
        .eq('auth_user_id', user.id);

      if (updateError) {
        console.error('set-pin (all) error:', updateError);
        return NextResponse.json({ success: false, error: 'Failed to set PIN for all places' }, { status: 500 });
      }

      return NextResponse.json({ success: true, appliedToAll: true });
    } else {
      // Set PIN for this specific link only
      const { error: updateError } = await adminClient
        .from('customer_auth_links')
        .update({
          access_pin_hash: pinHash,
          failed_pin_attempts: 0,
          locked_until: null,
        })
        .eq('id', linkId);

      if (updateError) {
        console.error('set-pin error:', updateError);
        return NextResponse.json({ success: false, error: 'Failed to set PIN' }, { status: 500 });
      }

      return NextResponse.json({ success: true, appliedToAll: false });
    }
  } catch (err: any) {
    console.error('set-pin error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
