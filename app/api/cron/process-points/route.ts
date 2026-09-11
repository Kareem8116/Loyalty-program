import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getServiceSupabase } from '@/lib/supabase';

// This endpoint should be protected, e.g., called by a cron scheduler like Vercel Cron or Upstash QStash
// For security, you can verify an API key in the headers.

export async function POST(request: NextRequest) {
  // Optional: Verify a simple secret token to prevent unauthorized calls
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // We will pop items from the queue up to a certain batch size
    const batchSize = 100;
    const items = [];
    
    for (let i = 0; i < batchSize; i++) {
      const item = await redis.rpop('points_queue');
      if (!item) break;
      
      try {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;
        
        // Remove queued_at before inserting to DB, unless you added a column for it
        if (parsed.queued_at) {
          delete parsed.queued_at;
        }
        
        items.push(parsed);
      } catch (e) {
        console.error('Failed to parse queued item:', item);
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, message: 'Queue is empty' });
    }

    const adminClient = getServiceSupabase();
    
    // Bulk insert into points_ledger
    const { error } = await adminClient
      .from('points_ledger')
      .insert(items);

    if (error) {
      console.error('Failed to bulk insert points_ledger:', error);
      // If bulk insert fails, we might want to push items back to queue or log them
      // For simplicity, we just throw error here, but in production consider a dead-letter queue
      throw error;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${items.length} items from queue` 
    });
  } catch (error: any) {
    console.error('Cron process-points error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
