import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { invalidateCache } from '@/lib/redis';
import { validateName, validatePositiveNumber } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    // Central Tenant & Auth Guard: Verifies JWT, ensures user belongs to business, and returns RLS-scoped client
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin', 'cashier'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;
    const { data: items, error } = await userClient
      .from('menu_items')
      .select('id, name, price, branch_id, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, items: items || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, branchId, name, price } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: businessId' },
        { status: 400 }
      );
    }

    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    const priceVal = validatePositiveNumber(price, false);
    if (!priceVal.isValid) {
      return NextResponse.json(
        { success: false, error: priceVal.errorMessage, errorKey: priceVal.errorKey },
        { status: 400 }
      );
    }

    // Central Tenant & Auth Guard: ensures user is owner/branch_admin for this business
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;
    const { data: newItem, error } = await userClient
      .from('menu_items')
      .insert({
        business_id: businessId,
        branch_id: branchId || null,
        name: nameVal.value,
        price: priceVal.value,
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate Cache
    try {
      await invalidateCache(`menu_items:${businessId}:all`);
      if (branchId) {
        await invalidateCache(`menu_items:${businessId}:${branchId}`);
      }
    } catch (e) {}

    return NextResponse.json({ success: true, item: newItem });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, price, businessId } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing required field: id' }, { status: 400 });
    }

    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    const priceVal = validatePositiveNumber(price, false);
    if (!priceVal.isValid) {
      return NextResponse.json(
        { success: false, error: priceVal.errorMessage, errorKey: priceVal.errorKey },
        { status: 400 }
      );
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId || null,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;
    const { data: updated, error } = await userClient
      .from('menu_items')
      .update({ name: nameVal.value, price: priceVal.value })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Invalidate Cache
    try {
      await invalidateCache(`menu_items:${businessId || updated?.business_id}:all`);
      if (updated?.branch_id) {
        await invalidateCache(`menu_items:${businessId || updated?.business_id}:${updated.branch_id}`);
      }
    } catch (e) {}

    return NextResponse.json({ success: true, item: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const businessId = searchParams.get('businessId');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing item id' }, { status: 400 });
    }

    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId || null,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    const { supabase: userClient } = guard.context;
    // Find the item first to get its branch_id for precise invalidation
    const { data: itemData } = await userClient.from('menu_items').select('branch_id').eq('id', id).maybeSingle();

    const { error } = await userClient.from('menu_items').delete().eq('id', id);

    if (error) throw error;

    // Invalidate Cache
    try {
      await invalidateCache(`menu_items:${businessId}:all`);
      if (itemData?.branch_id) {
        await invalidateCache(`menu_items:${businessId}:${itemData.branch_id}`);
      }
    } catch (e) {}

    return NextResponse.json({ success: true, message: 'Item deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
