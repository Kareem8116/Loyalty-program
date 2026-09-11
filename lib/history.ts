import { getServiceSupabase } from './supabase';

export type TransactionType = 'earned' | 'redeemed' | 'expired' | 'referral' | 'refund' | 'reversal';

export interface CustomerTransaction {
  id: string;
  points_change: number;
  type: TransactionType;
  reason: string;
  item_name: string | null;
  branch_name: string | null;   // Phase 18.1: branch where the transaction occurred
  expires_at: string | null;   // Phase 14+18.2: only on earn rows
  created_at: string;
  reversal_of?: string | null;
  is_reversed?: boolean;
}

/**
 * Parses the raw reason string to extract transaction type and redeemed item name if applicable.
 */
export function parseTransactionDetails(pointsChange: number, rawReason: string): {
  type: TransactionType;
  itemName: string | null;
} {
  const reasonLower = (rawReason || '').toLowerCase().trim();

  // Phase 28: Check for reversal / refund
  if (reasonLower.startsWith('استرجاع') || reasonLower.includes('refund')) {
    return { type: 'refund', itemName: null };
  }
  if (reasonLower.startsWith('إلغاء') || reasonLower.includes('reversal')) {
    return { type: 'reversal', itemName: null };
  }

  // Check for expired
  if (reasonLower.startsWith('expired') || reasonLower.includes('expiry')) {
    return { type: 'expired', itemName: null };
  }

  // Check for referral
  if (reasonLower.startsWith('referral')) {
    return { type: 'referral', itemName: null };
  }

  // Check for menu item redemption: e.g. "menu_item_redemption: Espresso"
  if (reasonLower.startsWith('menu_item_redemption:')) {
    const itemName = rawReason.split(':')[1]?.trim() || null;
    return { type: 'redeemed', itemName };
  }

  // Check for other redemptions
  if (pointsChange < 0) {
    return { type: 'redeemed', itemName: null };
  }

  // Default to earned
  return { type: 'earned', itemName: null };
}

/**
 * 18.1 & 28.4: Fetch transaction history for a specific customer from points_ledger.
 * Guaranteed to only return records belonging to customerId (and businessId if supplied),
 * sorted chronologically descending (newest first).
 */
export async function getCustomerTransactionHistory(
  customerId: string,
  businessId?: string,
  limit: number = 50
): Promise<CustomerTransaction[]> {
  const adminClient = getServiceSupabase();

  let query = adminClient
    .from('points_ledger')
    .select('id, points_change, reason, created_at, reversal_of, expires_at, branches(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  let { data, error } = await query;

  // Graceful fallback if reversal_of or expires_at columns not yet present
  if (error && (error.message?.includes('reversal_of') || error.message?.includes('expires_at') || error.message?.includes('branches'))) {
    let fallbackQuery = adminClient
      .from('points_ledger')
      .select('id, points_change, reason, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (businessId) fallbackQuery = fallbackQuery.eq('business_id', businessId);
    const fallback = await fallbackQuery;
    data = fallback.data as any;
    error = fallback.error;
  }

  if (error || !data) {
    console.error('Error fetching customer points ledger:', error);
    return [];
  }

  // Identify all IDs that have been reversed
  const reversedIds = new Set<string>();
  data.forEach((r: any) => {
    if (r.reversal_of) reversedIds.add(r.reversal_of);
    if (typeof r.reason === 'string') {
      const match = r.reason.match(/\[REV:([a-f0-9-]+)\]/i);
      if (match && match[1]) reversedIds.add(match[1]);
    }
  });

  return data.map((record: any) => {
    const rawReason = record.reason || '';
    const cleanReason = rawReason
      .replace(/\[REV:[^\]]+\]/g, '')
      .replace(/\[CBD:[^\]]+\]/g, '')
      .trim();
    const { type, itemName } = parseTransactionDetails(record.points_change, cleanReason);
    const isEarn = record.points_change > 0 && type === 'earned';
    return {
      id: record.id,
      points_change: record.points_change,
      type,
      reason: cleanReason,
      item_name: itemName,
      branch_name: record.branches?.name || null,
      expires_at: isEarn ? (record.expires_at || null) : null,
      created_at: record.created_at,
      reversal_of: record.reversal_of || null,
      is_reversed: reversedIds.has(record.id),
    };
  });
}

/**
 * Fetch customer transaction history by customer's QR token.
 */
export async function getCustomerHistoryByToken(
  qrToken: string,
  limit: number = 50
): Promise<{ customerId: string; businessId: string; transactions: CustomerTransaction[] } | null> {
  const adminClient = getServiceSupabase();

  const trimmed = qrToken.trim();
  let { data: customer, error } = await adminClient
    .from('customers')
    .select('id, business_id')
    .eq('qr_token', trimmed)
    .maybeSingle();

  if (!customer && trimmed.length === 9) {
    const { data: upperCustomer } = await adminClient
      .from('customers')
      .select('id, business_id')
      .eq('qr_token', trimmed.toUpperCase())
      .maybeSingle();
    customer = upperCustomer;
  }

  if (error || !customer) {
    return null;
  }

  const transactions = await getCustomerTransactionHistory(customer.id, customer.business_id, limit);

  return {
    customerId: customer.id,
    businessId: customer.business_id,
    transactions,
  };
}
