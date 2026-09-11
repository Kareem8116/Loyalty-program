import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

/**
 * DELETE /api/account/delete
 * Unified account deletion endpoint for Customer, Cashier, Owner, and Super Admin.
 * Requires valid Bearer authorization token.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized user session' },
        { status: 401 }
      );
    }

    const userId = user.id;
    const userEmail = user.email?.toLowerCase();
    const adminClient = getServiceSupabase();

    // Parse optional body for role-specific confirmations
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Check user roles in user_roles
    const { data: roles } = await adminClient
      .from('user_roles')
      .select('id, role, business_id, branch_id')
      .eq('user_id', userId);

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
    const ownerRole = roles?.find(r => r.role === 'owner');
    const branchAdminRole = roles?.find(r => r.role === 'branch_admin');
    const cashierRole = roles?.find(r => r.role === 'cashier');

    // 1. Super Admin Deletion Guard (Requires explicit confirmation phrase)
    if (isSuperAdmin) {
      const phrase = (body.confirmationPhrase || '').trim();
      const validPhrases = [
        'حذف حساب السوبر أدمن نهائياً',
        'DELETE SUPER ADMIN ACCOUNT',
      ];

      if (!validPhrases.includes(phrase)) {
        return NextResponse.json(
          {
            success: false,
            code: 'CONFIRMATION_PHRASE_MISMATCH',
            error: 'عبارة التأكيد غير مطابقة. يجب كتابة العبارة المطلوبة بالضبط.',
          },
          { status: 400 }
        );
      }

      // Remove super_admin role
      await adminClient
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete from auth.users
      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error('Failed to delete super admin auth user:', delErr);
        return NextResponse.json(
          { success: false, error: delErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        role: 'super_admin',
        message: 'تم حذف حساب السوبر أدمن نهائياً.',
      });
    }

    // 2. Owner / Manager Deletion
    if (ownerRole) {
      const bizId = ownerRole.business_id;

      // Check if there are other owners for this business
      if (bizId) {
        const { data: otherOwners } = await adminClient
          .from('user_roles')
          .select('id')
          .eq('business_id', bizId)
          .eq('role', 'owner')
          .neq('user_id', userId);

        // If sole owner, deactivate business
        if (!otherOwners || otherOwners.length === 0) {
          await adminClient
            .from('businesses')
            .update({ is_active: false })
            .eq('id', bizId);
        }

        // Record audit log
        try {
          await adminClient.from('audit_logs').insert({
            business_id: bizId,
            user_id: userId,
            action: 'owner_account_deleted',
            details: { email: userEmail, was_sole_owner: !otherOwners || otherOwners.length === 0 },
          });
        } catch (_) {}
      }

      // Delete owner roles
      await adminClient
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete auth user
      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error('Failed to delete owner auth user:', delErr);
        return NextResponse.json(
          { success: false, error: delErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        role: 'owner',
        message: 'تم حذف حساب المدير وإلغاء صلاحياته بنجاح.',
      });
    }

    // 3. Branch Admin Deletion
    if (branchAdminRole) {
      await adminClient
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      await adminClient.auth.admin.deleteUser(userId);
      return NextResponse.json({
        success: true,
        role: 'branch_admin',
        message: 'تم حذف حساب مدير الفرع بنجاح.',
      });
    }

    // 4. Cashier Deletion
    if (cashierRole) {
      const bizId = cashierRole.business_id;

      // Record in audit log
      if (bizId) {
        try {
          await adminClient.from('audit_logs').insert({
            business_id: bizId,
            user_id: userId,
            action: 'cashier_account_deleted',
            details: { email: userEmail, branch_id: cashierRole.branch_id },
          });
        } catch (_) {}
      }

      // Delete cashier role
      await adminClient
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete auth user
      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error('Failed to delete cashier auth user:', delErr);
        return NextResponse.json(
          { success: false, error: delErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        role: 'cashier',
        message: 'تم حذف حساب الكاشير بنجاح.',
      });
    }

    // 5. Customer Central Account Deletion (Right to Erasure)
    // Find all linked customer records
    const { data: customerLinks } = await adminClient
      .from('customer_auth_links')
      .select('customer_id')
      .eq('auth_user_id', userId);

    const customerIds = (customerLinks || []).map(l => l.customer_id);

    // Delete customer auth links
    await adminClient
      .from('customer_auth_links')
      .delete()
      .eq('auth_user_id', userId);

    // Delete customer records (this cascades to points_ledger)
    if (customerIds.length > 0) {
      await adminClient
        .from('customers')
        .delete()
        .in('id', customerIds);
    }

    // Delete auth user
    const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('Failed to delete customer auth user:', delErr);
      return NextResponse.json(
        { success: false, error: delErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      role: 'customer',
      message: 'تم حذف حساب العميل وكافة بطاقاته وبياناته بنجاح.',
    });
  } catch (error: any) {
    console.error('Unexpected error in DELETE /api/account/delete:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
