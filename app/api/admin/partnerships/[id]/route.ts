import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';

/**
 * PATCH /api/admin/partnerships/[id]
 * Accept or reject a partnership request.
 * Only the receiving side (non-initiator) can change status from pending → active/rejected.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId } = guard.context;
  const { id: partnershipId } = await params;

  if (!businessId) {
    return NextResponse.json(
      { success: false, error: 'No business assigned to this user' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body; // 'accept' or 'reject'

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "accept" or "reject".' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Fetch the partnership
    const { data: partnership, error: fetchErr } = await adminClient
      .from('partnerships')
      .select('id, business_id_a, business_id_b, status, initiated_by')
      .eq('id', partnershipId)
      .maybeSingle();

    if (fetchErr || !partnership) {
      return NextResponse.json(
        { success: false, error: 'Partnership not found' },
        { status: 404 }
      );
    }

    // Verify this business is part of the partnership
    if (partnership.business_id_a !== businessId && partnership.business_id_b !== businessId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: This partnership does not belong to your business' },
        { status: 403 }
      );
    }

    // Only the receiving side (non-initiator) can accept/reject
    if (partnership.initiated_by === businessId) {
      return NextResponse.json(
        { success: false, error: 'Only the receiving business can accept or reject a partnership request' },
        { status: 403 }
      );
    }

    // Can only change status from 'pending'
    if (partnership.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} a partnership with status: ${partnership.status}` },
        { status: 400 }
      );
    }

    const newStatus = action === 'accept' ? 'active' : 'rejected';

    const { data: updated, error: updateErr } = await adminClient
      .from('partnerships')
      .update({ status: newStatus })
      .eq('id', partnershipId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, partnership: updated });
  } catch (err: any) {
    console.error(`PATCH /api/admin/partnerships/${partnershipId} error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
