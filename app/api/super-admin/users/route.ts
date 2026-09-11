import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';

/**
 * GET /api/super-admin/users
 * Returns all platform users with roles and associated business details. Super Admin only.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  try {
    const adminClient = getServiceSupabase();

    // 1. Fetch all users from Supabase Auth
    const { data: { users }, error: usersErr } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });

    if (usersErr) throw usersErr;

    // 2. Fetch all user_roles with businesses and branches
    const { data: rolesData, error: rolesErr } = await adminClient
      .from('user_roles')
      .select('user_id, role, business_id, branch_id, businesses(name, subdomain), branches(name)');

    if (rolesErr) throw rolesErr;

    // 3. Fetch customer links
    const { data: customerLinks, error: linksErr } = await adminClient
      .from('customer_auth_links')
      .select('auth_user_id, customer_id, customers(name, phone_number, business_id, businesses(name))');

    if (linksErr) throw linksErr;

    // Map roles by user_id
    const rolesByUser: Record<string, any[]> = {};
    for (const r of rolesData || []) {
      if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
      rolesByUser[r.user_id].push({
        role: r.role,
        businessId: r.business_id,
        businessName: (r.businesses as any)?.name || null,
        subdomain: (r.businesses as any)?.subdomain || null,
        branchId: r.branch_id,
        branchName: (r.branches as any)?.name || null,
      });
    }

    // Map customer links by auth_user_id
    const customerByUser: Record<string, any[]> = {};
    for (const cl of customerLinks || []) {
      if (!customerByUser[cl.auth_user_id]) customerByUser[cl.auth_user_id] = [];
      customerByUser[cl.auth_user_id].push({
        customerId: cl.customer_id,
        name: (cl.customers as any)?.name || null,
        phoneNumber: (cl.customers as any)?.phone_number || null,
        businessName: (cl.customers as any)?.businesses?.name || null,
      });
    }

    // 4. Enrich users
    const enrichedUsers = (users || []).map((u) => {
      const userRoles = rolesByUser[u.id] || [];
      const userCustLinks = customerByUser[u.id] || [];

      // Determine primary role
      let primaryRole = 'customer';
      if (userRoles.some((r) => r.role === 'super_admin')) {
        primaryRole = 'super_admin';
      } else if (userRoles.some((r) => r.role === 'owner')) {
        primaryRole = 'owner';
      } else if (userRoles.some((r) => r.role === 'branch_admin')) {
        primaryRole = 'branch_admin';
      } else if (userRoles.some((r) => r.role === 'cashier')) {
        primaryRole = 'cashier';
      }

      return {
        id: u.id,
        email: u.email || 'بدون بريد',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        primaryRole,
        roles: userRoles,
        customerLinks: userCustLinks,
        isCurrentSuperAdmin: u.id === guard.context.userId,
      };
    });

    // Sort: super_admins first, then newest
    enrichedUsers.sort((a, b) => {
      if (a.primaryRole === 'super_admin' && b.primaryRole !== 'super_admin') return -1;
      if (b.primaryRole === 'super_admin' && a.primaryRole !== 'super_admin') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      success: true,
      users: enrichedUsers,
      total: enrichedUsers.length,
    });
  } catch (err: any) {
    console.error('Error fetching super admin users:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/super-admin/users?id=...
 * Permanently deletes any user account by ID. Super Admin only.
 */
export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('id');

  if (!targetUserId) {
    return NextResponse.json(
      { success: false, error: 'User ID is required' },
      { status: 400 }
    );
  }

  // Safety protection: Do not allow super admin to delete their own active account through this general list
  if (targetUserId === guard.context.userId) {
    return NextResponse.json(
      {
        success: false,
        error: 'لا يمكنك حذف حسابك الحالي من قائمة المستخدمين العامة. يرجى استخدام زر حذف الحساب من الملف الشخصي مع التأكيدات الأمنية المشددة.',
      },
      { status: 400 }
    );
  }

  try {
    const adminClient = getServiceSupabase();

    // 1. Get user details before deletion for audit
    const { data: targetUser } = await adminClient.auth.admin.getUserById(targetUserId);

    // 2. Delete roles
    await adminClient.from('user_roles').delete().eq('user_id', targetUserId);

    // 3. Find customer links and customer records
    const { data: customerLinks } = await adminClient
      .from('customer_auth_links')
      .select('customer_id')
      .eq('auth_user_id', targetUserId);

    const customerIds = (customerLinks || []).map((cl) => cl.customer_id);

    // Delete customer auth links
    await adminClient.from('customer_auth_links').delete().eq('auth_user_id', targetUserId);

    // If standalone customer records exist, cascade will handle points_ledger
    if (customerIds.length > 0) {
      await adminClient.from('customers').delete().in('id', customerIds);
    }

    // 4. Delete user from auth.users
    const { error: delErr } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (delErr) {
      console.error('Failed to delete auth user:', delErr);
      return NextResponse.json(
        { success: false, error: delErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `تم حذف الحساب (${targetUser?.user?.email || targetUserId}) بنجاح.`,
    });
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
