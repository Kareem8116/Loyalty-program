import { getServiceSupabase } from './supabase';
import { getCachedOrFetch, invalidateCache } from './redis';

export interface OfferItem {
  id: string;
  business_id: string;
  branch_id?: string | null;
  title: string;
  description: string;
  type: 'special' | 'daily';
  start_date: string;
  end_date: string;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * 6.3 & 6.4: Fetch active offers for customer screen.
 * - If type === 'special': Returns active special offers where today is within range.
 * - If type === 'daily': Returns active daily offers valid for TODAY only.
 */
export async function getActiveOffers(params: {
  businessId: string;
  type?: 'special' | 'daily';
  branchId?: string | null;
}): Promise<OfferItem[]> {
  const cacheKey = `active_offers:${params.businessId}:${params.type || 'all'}:${params.branchId || 'all'}`;

  return getCachedOrFetch(
    cacheKey,
    async () => {
      const adminClient = getServiceSupabase();
      const todayStr = new Date().toISOString().split('T')[0];

      let query = adminClient
        .from('offers')
        .select('*')
        .eq('business_id', params.businessId)
        .eq('is_active', true)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr);

      if (params.type) {
        query = query.eq('type', params.type);
      }

      if (params.branchId) {
        query = query.or(`branch_id.eq.${params.branchId},branch_id.is.null`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active offers:', error);
        return [];
      }

      return (data as OfferItem[]) || [];
    },
    3600 // Cache for 1 hour
  );
}

/**
 * Fetch all offers for Admin management (includes past/inactive).
 */
export async function getAllOffersForAdmin(businessId: string): Promise<OfferItem[]> {
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('offers')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching admin offers:', error);
    return [];
  }

  return (data as OfferItem[]) || [];
}

/**
 * 6.1.2: Upload an offer image to Supabase Storage bucket 'offer-images'
 */
export async function uploadOfferImage(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const adminClient = getServiceSupabase();
  const cleanFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  const { data, error } = await adminClient.storage
    .from('offer-images')
    .upload(cleanFileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload offer image: ${error.message}`);
  }

  const { data: publicData } = adminClient.storage
    .from('offer-images')
    .getPublicUrl(data.path);

  return publicData.publicUrl;
}

/**
 * 6.2 & 6.1.1: Create a new offer with optional image_url.
 */
export async function createOffer(params: {
  businessId: string;
  branchId?: string | null;
  title: string;
  description: string;
  type: 'special' | 'daily';
  startDate: string;
  endDate: string;
  imageUrl?: string | null;
}) {
  const adminClient = getServiceSupabase();

  const { data, error } = await adminClient
    .from('offers')
    .insert({
      business_id: params.businessId,
      branch_id: params.branchId || null,
      title: params.title.trim(),
      description: params.description.trim(),
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      image_url: params.imageUrl || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create offer: ${error.message}`);
  }

  // Invalidate offers cache
  try {
    // A simple wildcard invalidation logic could be added to redis.ts,
    // but for now we just delete the common keys.
    await invalidateCache(`active_offers:${params.businessId}:all:all`);
    await invalidateCache(`active_offers:${params.businessId}:special:all`);
    await invalidateCache(`active_offers:${params.businessId}:daily:all`);
    if (params.branchId) {
      await invalidateCache(`active_offers:${params.businessId}:all:${params.branchId}`);
      await invalidateCache(`active_offers:${params.businessId}:special:${params.branchId}`);
      await invalidateCache(`active_offers:${params.businessId}:daily:${params.branchId}`);
    }
  } catch (err) {
    // Ignore cache invalidation errors
  }

  return data;
}

/**
 * Delete an offer.
 */
export async function deleteOffer(id: string) {
  const adminClient = getServiceSupabase();
  
  // Get offer first to know businessId for cache invalidation
  const { data: offer } = await adminClient.from('offers').select('business_id, branch_id').eq('id', id).maybeSingle();

  const { error } = await adminClient.from('offers').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete offer: ${error.message}`);
  }
  
  if (offer) {
    // Invalidate offers cache
    try {
      await invalidateCache(`active_offers:${offer.business_id}:all:all`);
      await invalidateCache(`active_offers:${offer.business_id}:special:all`);
      await invalidateCache(`active_offers:${offer.business_id}:daily:all`);
      if (offer.branch_id) {
        await invalidateCache(`active_offers:${offer.business_id}:all:${offer.branch_id}`);
        await invalidateCache(`active_offers:${offer.business_id}:special:${offer.branch_id}`);
        await invalidateCache(`active_offers:${offer.business_id}:daily:${offer.branch_id}`);
      }
    } catch (err) {}
  }
  
  return true;
}
