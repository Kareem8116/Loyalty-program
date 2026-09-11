import { NextRequest, NextResponse } from 'next/server';
import { getUserSupabase, getServiceSupabase } from './supabase';
import { resolveBusinessBySubdomain } from './tenant';

export type UserRole = 'super_admin' | 'owner' | 'branch_admin' | 'cashier';

export interface AuthenticatedTenantContext {
  userId: string;
  role: UserRole;
  businessId: string | null;
  branchId: string | null;
  jwtToken: string;
  supabase: ReturnType<typeof getUserSupabase>;
}

export type GuardResult =
  | { success: true; context: AuthenticatedTenantContext }
  | { success: false; response: NextResponse };

/**
 * Central Tenant & Security Guard for API Routes.
 * 
 * Provides defense-in-depth:
 * 1. Authenticates user session via JWT from Authorization header.
 * 2. Enforces role-based permissions (allowedRoles).
 * 3. Prevents business ID spoofing by verifying targetBusinessId === user's business_id.
 * 4. Prevents cross-subdomain access by verifying x-subdomain header matches user's business.
 * 5. Returns an RLS-scoped Supabase client initialized with user's JWT so Postgres RLS
 *    policies enforce row isolation at the database level.
 */
export async function requireAuthenticatedTenant(
  request: NextRequest,
  options?: {
    targetBusinessId?: string | null;
    allowedRoles?: UserRole[];
  }
): Promise<GuardResult> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      ),
    };
  }

  const jwtToken = authHeader.replace('Bearer ', '').trim();
  if (!jwtToken) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Token is empty' },
        { status: 401 }
      ),
    };
  }

  // Validate the JWT against Supabase Auth
  const serviceClient = getServiceSupabase();
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(jwtToken);
  if (userError || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or expired session' },
        { status: 401 }
      ),
    };
  }

  // Retrieve user role and business assignment
  const { data: userRole, error: roleError } = await serviceClient
    .from('user_roles')
    .select('role, business_id, branch_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleError || !userRole) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: No role assigned to this user' },
        { status: 403 }
      ),
    };
  }

  const role = userRole.role as UserRole;
  const userBizId = userRole.business_id;

  // Role check
  if (options?.allowedRoles && !options.allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient role permissions' },
        { status: 403 }
      ),
    };
  }

  // Multi-tenant boundary checks (Super Admin bypasses business restriction)
  if (role !== 'super_admin') {
    // 1. Validate target business ID against user assignment
    if (options?.targetBusinessId && options.targetBusinessId !== userBizId) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, error: 'Forbidden: Cannot access or modify data belonging to another business' },
          { status: 403 }
        ),
      };
    }

    // 2. Validate subdomain header if present
    const subdomainHeader = request.headers.get('x-subdomain');
    if (subdomainHeader) {
      const tenant = await resolveBusinessBySubdomain(subdomainHeader);
      if (tenant && tenant.id !== userBizId) {
        return {
          success: false,
          response: NextResponse.json(
            { success: false, error: 'Forbidden: Subdomain does not match your business' },
            { status: 403 }
          ),
        };
      }
    }
  }

  // Create RLS-scoped client with user token
  const userClient = getUserSupabase(jwtToken);

  return {
    success: true,
    context: {
      userId: user.id,
      role,
      businessId: userBizId,
      branchId: userRole.branch_id,
      jwtToken,
      supabase: userClient,
    },
  };
}

/**
 * Strict Super Admin Guard:
 * Guaranteed to verify user credentials and check role === 'super_admin'
 * strictly BEFORE returning context or allowing any elevated service_role action.
 */
export async function requireSuperAdmin(request: NextRequest): Promise<GuardResult> {
  return requireAuthenticatedTenant(request, {
    allowedRoles: ['super_admin'],
  });
}

