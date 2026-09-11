import { getServiceSupabase } from './supabase';
import { parseTransactionDetails } from './history';

export type AnalyticsTimeframe = '7d' | '30d' | '90d' | 'all';

export interface TopRedeemedItem {
  name: string;
  count: number;
  points: number;
}

export interface DailyActivityPoint {
  date: string;
  label: string;
  pointsIssued: number;
  pointsRedeemed: number;
}

export interface OwnerAnalyticsData {
  timeframe: AnalyticsTimeframe;
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  activeRatePercent: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  redemptionRate: number;
  topRedeemedItems: TopRedeemedItem[];
  dailyActivity: DailyActivityPoint[];
}

/**
 * 20.1: Calculate date cutoff based on selected timeframe.
 */
export function getTimeframeCutoff(timeframe: AnalyticsTimeframe): Date | null {
  const now = new Date();
  switch (timeframe) {
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return d;
    }
    case 'all':
    default:
      return null;
  }
}

/**
 * 20.1: Get aggregated business analytics and reporting data for store owners.
 * Strictly adheres to RULES.md 3.1: points_ledger is the single source of truth.
 */
export async function getOwnerAnalytics(
  businessId: string,
  timeframe: AnalyticsTimeframe = '30d'
): Promise<OwnerAnalyticsData> {
  const adminClient = getServiceSupabase();
  const cutoff = getTimeframeCutoff(timeframe);

  // 1. Total registered customers for this business
  const { count: totalCustCount, error: custCountErr } = await adminClient
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  if (custCountErr) {
    console.error('Error fetching total customers count:', custCountErr);
  }
  const totalCustomers = totalCustCount || 0;

  // 2. New customers within timeframe
  let newCustQuery = adminClient
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  if (cutoff) {
    newCustQuery = newCustQuery.gte('created_at', cutoff.toISOString());
  }

  const { count: newCustCount } = await newCustQuery;
  const newCustomers = newCustCount || 0;

  // 3. Points Ledger transactions within timeframe
  let ledgerQuery = adminClient
    .from('points_ledger')
    .select('id, customer_id, points_change, reason, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });

  if (cutoff) {
    ledgerQuery = ledgerQuery.gte('created_at', cutoff.toISOString());
  }

  const { data: ledgerRows, error: ledgerErr } = await ledgerQuery;
  if (ledgerErr) {
    console.error('Error fetching ledger for analytics:', ledgerErr);
  }

  const rows = ledgerRows || [];

  // 4. Aggregations
  const activeCustomerIds = new Set<string>();
  let totalPointsIssued = 0;
  let totalPointsRedeemed = 0;
  let totalPointsExpired = 0;

  const itemRedemptionMap: Record<string, { count: number; points: number }> = {};
  const dailyActivityMap: Record<string, { pointsIssued: number; pointsRedeemed: number }> = {};

  for (const row of rows) {
    if (row.customer_id) {
      activeCustomerIds.add(row.customer_id);
    }

    const { type, itemName } = parseTransactionDetails(row.points_change, row.reason);
    const dateKey = row.created_at ? row.created_at.split('T')[0] : 'unknown';

    if (!dailyActivityMap[dateKey]) {
      dailyActivityMap[dateKey] = { pointsIssued: 0, pointsRedeemed: 0 };
    }

    if (row.points_change > 0) {
      totalPointsIssued += row.points_change;
      dailyActivityMap[dateKey].pointsIssued += row.points_change;
    } else if (row.points_change < 0) {
      const absPoints = Math.abs(row.points_change);
      if (type === 'expired') {
        totalPointsExpired += absPoints;
      } else {
        totalPointsRedeemed += absPoints;
        dailyActivityMap[dateKey].pointsRedeemed += absPoints;

        // Track item redemptions
        const effectiveName = itemName || row.reason || 'مكافأة';
        if (!itemRedemptionMap[effectiveName]) {
          itemRedemptionMap[effectiveName] = { count: 0, points: 0 };
        }
        itemRedemptionMap[effectiveName].count += 1;
        itemRedemptionMap[effectiveName].points += absPoints;
      }
    }
  }

  const activeCustomers = activeCustomerIds.size;
  const activeRatePercent = totalCustomers > 0
    ? Number(((activeCustomers / totalCustomers) * 100).toFixed(1))
    : 0;

  const redemptionRate = totalPointsIssued > 0
    ? Number(((totalPointsRedeemed / totalPointsIssued) * 100).toFixed(1))
    : 0;

  // 5. Top 5 Redeemed Items
  const topRedeemedItems: TopRedeemedItem[] = Object.entries(itemRedemptionMap)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      points: stats.points,
    }))
    .sort((a, b) => b.count - a.count || b.points - a.points)
    .slice(0, 5);

  // 6. Build Daily Activity Points array
  const dailyActivity: DailyActivityPoint[] = Object.entries(dailyActivityMap)
    .filter(([date]) => date !== 'unknown')
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, stats]) => {
      const [year, month, day] = date.split('-');
      return {
        date,
        label: `${day}/${month}`,
        pointsIssued: stats.pointsIssued,
        pointsRedeemed: stats.pointsRedeemed,
      };
    });

  return {
    timeframe,
    totalCustomers,
    newCustomers,
    activeCustomers,
    activeRatePercent,
    totalPointsIssued,
    totalPointsRedeemed,
    totalPointsExpired,
    redemptionRate,
    topRedeemedItems,
    dailyActivity,
  };
}
