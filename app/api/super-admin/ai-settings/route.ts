import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getBusinessAiSettings, saveBusinessAiSettings } from '@/lib/recommendations';

/**
 * Super Admin check helper
 */
async function verifySuperAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return false;

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return false;

  const { data: roleData, error: roleErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .maybeSingle();

  return !roleErr && !!roleData;
}

export async function GET(request: NextRequest) {
  try {
    const isSuperAdmin = await verifySuperAdmin(request);
    if (!isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Super Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'businessId required' }, { status: 400 });
    }

    const settings = await getBusinessAiSettings(businessId);

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            business_id: settings.business_id,
            has_api_key: !!settings.gemini_api_key,
            model: settings.model,
          }
        : null,
    });
  } catch (err: any) {
    console.error('GET /api/super-admin/ai-settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const isSuperAdmin = await verifySuperAdmin(request);
    if (!isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Super Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { businessId, geminiApiKey, model } = body;

    if (!businessId || !geminiApiKey) {
      return NextResponse.json({ success: false, error: 'businessId and geminiApiKey are required' }, { status: 400 });
    }

    const result = await saveBusinessAiSettings({
      businessId,
      geminiApiKey,
      model: model || 'gemini-1.5-flash',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/super-admin/ai-settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
