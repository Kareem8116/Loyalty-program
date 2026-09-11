import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { getCustomerPointsBalance } from '@/lib/customer';

/**
 * POST /api/admin/partnerships/transfer
 * Transfer points between two partnered businesses for a specific customer.
 * 
 * Requires:
 * - partnership_id: UUID of the active partnership
 * - customer_id: UUID of the customer (must exist in BOTH businesses)
 * - points: positive integer of points to transfer
 * - to_business_id: UUID of the receiving business
 * 
 * Creates:
 * - Negative ledger entry in the sender's business (reason: partnership_transfer_out)
 * - Positive ledger entry in the receiver's business (reason: partnership_transfer_in)
 * - Record in partnership_transfers table
 */
export async function POST(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId, userId } = guard.context;

  if (!businessId) {
    return NextResponse.json(
      { success: false, error: 'No business assigned to this user' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { partnership_id, customer_id, target_customer_id, points, to_business_id } = body;

    // Validate required fields
    if (!partnership_id || !customer_id || !points || !to_business_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: partnership_id, customer_id, points, to_business_id' },
        { status: 400 }
      );
    }

    const pointsNum = parseInt(points, 10);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      return NextResponse.json(
        { success: false, error: 'Points must be a positive integer' },
        { status: 400 }
      );
    }

    // The sender is the current user's business
    const fromBusinessId = businessId;

    if (fromBusinessId === to_business_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot transfer points to the same business' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // 1. Verify partnership exists and is active
    const { data: partnership, error: partErr } = await adminClient
      .from('partnerships')
      .select('id, business_id_a, business_id_b, status')
      .eq('id', partnership_id)
      .maybeSingle();

    if (partErr || !partnership) {
      return NextResponse.json(
        { success: false, error: 'Partnership not found' },
        { status: 404 }
      );
    }

    if (partnership.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Cannot transfer points: partnership status is "${partnership.status}" (must be "active")` },
        { status: 400 }
      );
    }

    // Verify both businesses are part of this partnership
    const partnerBizIds = [partnership.business_id_a, partnership.business_id_b];
    if (!partnerBizIds.includes(fromBusinessId) || !partnerBizIds.includes(to_business_id)) {
      return NextResponse.json(
        { success: false, error: 'One or both businesses are not part of this partnership' },
        { status: 403 }
      );
    }

    // 2. Verify customer exists in the sender's business
    const { data: senderCustomer, error: scErr } = await adminClient
      .from('customers')
      .select('id, name, phone_number')
      .eq('id', customer_id)
      .eq('business_id', fromBusinessId)
      .maybeSingle();

    if (scErr || !senderCustomer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found in your business' },
        { status: 404 }
      );
    }

    // 3. Verify customer exists in the receiver's business
    // Match by target_customer_id if provided, otherwise by phone_number, or fallback to same id
    let receiverCustomer: { id: string; name: string } | null = null;

    if (target_customer_id) {
      const { data: rc } = await adminClient
        .from('customers')
        .select('id, name')
        .eq('id', target_customer_id)
        .eq('business_id', to_business_id)
        .maybeSingle();
      receiverCustomer = rc;
    }

    if (!receiverCustomer && senderCustomer.phone_number) {
      const { data: rc } = await adminClient
        .from('customers')
        .select('id, name')
        .eq('phone_number', senderCustomer.phone_number)
        .eq('business_id', to_business_id)
        .maybeSingle();
      receiverCustomer = rc;
    }

    if (!receiverCustomer) {
      const { data: rc } = await adminClient
        .from('customers')
        .select('id, name')
        .eq('id', customer_id)
        .eq('business_id', to_business_id)
        .maybeSingle();
      receiverCustomer = rc;
    }

    if (!receiverCustomer) {
      return NextResponse.json(
        { success: false, error: 'Customer is not registered in the partner business. They must be registered in both businesses for a transfer.' },
        { status: 400 }
      );
    }

    // 4. Check sender customer has enough points in sender business
    const senderBalance = await getCustomerPointsBalance(senderCustomer.id, fromBusinessId);
    if (senderBalance < pointsNum) {
      return NextResponse.json(
        { success: false, error: `Insufficient points. Customer has ${senderBalance} points but ${pointsNum} are required.` },
        { status: 400 }
      );
    }

    // 5. Execute the transfer atomically:
    // a) Deduct from sender (negative ledger entry)
    const { error: deductErr } = await adminClient
      .from('points_ledger')
      .insert({
        business_id: fromBusinessId,
        customer_id: senderCustomer.id,
        points_change: -pointsNum,
        reason: 'partnership_transfer_out',
        created_by: userId,
      });

    if (deductErr) throw new Error(`Failed to deduct points: ${deductErr.message}`);

    // b) Add to receiver (positive ledger entry)
    const { error: addErr } = await adminClient
      .from('points_ledger')
      .insert({
        business_id: to_business_id,
        customer_id: receiverCustomer.id,
        points_change: pointsNum,
        reason: 'partnership_transfer_in',
        created_by: userId,
      });

    if (addErr) {
      // Rollback the deduction
      await adminClient
        .from('points_ledger')
        .insert({
          business_id: fromBusinessId,
          customer_id: senderCustomer.id,
          points_change: pointsNum,
          reason: 'partnership_transfer_rollback',
          created_by: userId,
        });
      throw new Error(`Failed to add points to partner: ${addErr.message}`);
    }

    // c) Record in partnership_transfers
    const { data: transfer, error: transferErr } = await adminClient
      .from('partnership_transfers')
      .insert({
        partnership_id: partnership_id,
        from_business_id: fromBusinessId,
        to_business_id: to_business_id,
        customer_id: senderCustomer.id,
        points_transferred: pointsNum,
        reason: `Transfer from ${fromBusinessId} to ${to_business_id}`,
        created_by: userId,
      })
      .select()
      .single();

    if (transferErr) {
      console.error('Warning: Transfer succeeded but record failed:', transferErr);
    }

    // Get updated balances
    const newSenderBalance = await getCustomerPointsBalance(customer_id, fromBusinessId);

    return NextResponse.json({
      success: true,
      transfer: {
        id: transfer?.id,
        points_transferred: pointsNum,
        from_business_id: fromBusinessId,
        to_business_id: to_business_id,
        customer_id: customer_id,
        new_sender_balance: newSenderBalance,
      },
    });
  } catch (err: any) {
    console.error('POST /api/admin/partnerships/transfer error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
