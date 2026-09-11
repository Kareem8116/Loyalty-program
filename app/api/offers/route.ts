import { NextRequest, NextResponse } from 'next/server';
import { getActiveOffers, getAllOffersForAdmin, createOffer, deleteOffer } from '@/lib/offers';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { isFeatureEnabled, assertFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const type = searchParams.get('type') as 'special' | 'daily' | null;
    const branchId = searchParams.get('branchId');
    const isAdmin = searchParams.get('admin') === 'true';

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Missing businessId' }, { status: 400 });
    }

    // Phase 22.4: Feature Control check for offers / daily_offers
    const featureKey = type === 'daily' ? 'daily_offers' : 'offers';
    const isPrimaryEnabled = await isFeatureEnabled(businessId, featureKey);

    if (type) {
      if (!isPrimaryEnabled) {
        return NextResponse.json(
          { success: false, error: 'هذه الميزة غير مفعّلة لهذا المكان' },
          { status: 403 }
        );
      }
    } else {
      // If neither offers nor daily_offers is enabled, block access
      const isDailyEnabled = await isFeatureEnabled(businessId, 'daily_offers');
      if (!isPrimaryEnabled && !isDailyEnabled) {
        return NextResponse.json(
          { success: false, error: 'هذه الميزة غير مفعّلة لهذا المكان' },
          { status: 403 }
        );
      }
    }

    // If Admin dashboard request: strictly require authentication and tenant match
    if (isAdmin) {
      const guard = await requireAuthenticatedTenant(request, {
        targetBusinessId: businessId,
        allowedRoles: ['super_admin', 'owner', 'branch_admin'],
      });
      if (!guard.success) return guard.response;

      const offers = await getAllOffersForAdmin(businessId);
      return NextResponse.json({ success: true, offers });
    }

    // Public customer request: read active, valid offers only (safe, public per RLS)
    const offers = await getActiveOffers({
      businessId,
      type: type || undefined,
      branchId,
    });

    return NextResponse.json({ success: true, offers });
  } catch (err: any) {
    console.error('API /api/offers GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, branchId, title, description, type, startDate, endDate, imageUrl } = body;

    if (!businessId || !title || !description || !type || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessId, title, description, type, startDate, endDate' },
        { status: 400 }
      );
    }

    if (type !== 'special' && type !== 'daily') {
      return NextResponse.json(
        { success: false, error: 'Offer type must be either "special" or "daily"' },
        { status: 400 }
      );
    }

    // Central Guard: Must be owner or branch_admin of this business
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    // Phase 22.4: Feature Guard
    const featureKey = type === 'daily' ? 'daily_offers' : 'offers';
    const featureErr = await assertFeatureEnabled(businessId, featureKey);
    if (featureErr) return featureErr;

    const offer = await createOffer({
      businessId,
      branchId,
      title,
      description,
      type,
      startDate,
      endDate,
      imageUrl: imageUrl || null,
    });

    return NextResponse.json({ success: true, offer });
  } catch (err: any) {
    console.error('API /api/offers POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const businessId = searchParams.get('businessId');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing offer id' }, { status: 400 });
    }

    // Central Guard: Must be authenticated
    const guard = await requireAuthenticatedTenant(request, {
      targetBusinessId: businessId || null,
      allowedRoles: ['super_admin', 'owner', 'branch_admin'],
    });
    if (!guard.success) return guard.response;

    if (businessId) {
      const hasOffers = await isFeatureEnabled(businessId, 'offers');
      const hasDaily = await isFeatureEnabled(businessId, 'daily_offers');
      if (!hasOffers && !hasDaily) {
        return NextResponse.json(
          { success: false, error: 'هذه الميزة غير مفعّلة لهذا المكان' },
          { status: 403 }
        );
      }
    }

    await deleteOffer(id);
    return NextResponse.json({ success: true, message: 'Offer deleted successfully' });
  } catch (err: any) {
    console.error('API /api/offers DELETE error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
