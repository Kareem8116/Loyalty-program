import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { validateEgyptianPhone } from '@/lib/validation';

/**
 * Phase 27.1 — POST /api/customer/places/link-phone
 * Links a cashier-created customer record (identified by phone + businessId)
 * to the authenticated customer's central account via customer_auth_links.
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
    const { businessId, phoneNumber } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'businessId is required' }, { status: 400 });
    }

    const phoneVal = validateEgyptianPhone(String(phoneNumber || ''));
    if (!phoneVal.isValid) {
      return NextResponse.json({ success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey }, { status: 400 });
    }

    // Normalized phone number
    const normalizedPhone = phoneVal.cleanPhone;

    const adminClient = getServiceSupabase();

    // Find the customer record for this business + phone
    const { data: customer, error: custError } = await adminClient
      .from('customers')
      .select('id, business_id, phone_number, name')
      .eq('business_id', businessId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle();

    if (custError || !customer) {
      return NextResponse.json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No customer record found for this phone number at the selected business.',
      }, { status: 404 });
    }

    // Check if already linked to ANY auth user
    const { data: existingLink } = await adminClient
      .from('customer_auth_links')
      .select('id, auth_user_id')
      .eq('customer_id', customer.id)
      .maybeSingle();

    if (existingLink) {
      if (existingLink.auth_user_id === user.id) {
        return NextResponse.json({
          success: false,
          error: 'ALREADY_LINKED',
          message: 'This place is already linked to your account.',
        }, { status: 409 });
      } else {
        return NextResponse.json({
          success: false,
          error: 'LINKED_TO_OTHER',
          message: 'This customer record is already linked to a different account.',
        }, { status: 409 });
      }
    }

    // Create the link
    const { data: newLink, error: linkError } = await adminClient
      .from('customer_auth_links')
      .insert({
        auth_user_id: user.id,
        customer_id: customer.id,
      })
      .select()
      .single();

    if (linkError) {
      console.error('link-phone insert error:', linkError);
      return NextResponse.json({ success: false, error: 'Failed to link place' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      link: {
        id: newLink.id,
        customerId: customer.id,
        customerName: customer.name,
        businessId,
      },
    });
  } catch (err: any) {
    console.error('link-phone error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
