import { getServiceSupabase } from './supabase';
import { isFeatureEnabled } from './features';
import { getCachedOrFetch } from './redis';

export interface BusinessAiSettings {
  id?: string;
  business_id: string;
  gemini_api_key: string;
  model: string;
  created_at?: string;
  updated_at?: string;
}

// In-memory fallback cache for recommendation results (TTL: 1 hour)
const memoryRecCache = new Map<string, { text: string; expiresAt: number }>();

/**
 * 24.2: Retrieve business AI settings from business_ai_settings
 */
export async function getBusinessAiSettings(businessId: string): Promise<BusinessAiSettings | null> {
  try {
    const adminClient = getServiceSupabase();
    const { data, error } = await adminClient
      .from('business_ai_settings')
      .select('id, business_id, gemini_api_key, model, created_at, updated_at')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return null;
    return data as BusinessAiSettings;
  } catch (err) {
    console.error('getBusinessAiSettings error:', err);
    return null;
  }
}

/**
 * 24.3: Save or update Gemini AI settings for a business
 */
export async function saveBusinessAiSettings(params: {
  businessId: string;
  geminiApiKey: string;
  model?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getServiceSupabase();
    const { error } = await adminClient
      .from('business_ai_settings')
      .upsert(
        {
          business_id: params.businessId,
          gemini_api_key: params.geminiApiKey.trim(),
          model: params.model || 'gemini-1.5-flash',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      );

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('saveBusinessAiSettings error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Strip any disallowed emojis from text (RULES.md Section 3.2)
 */
function sanitizeZeroEmojis(text: string): string {
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  return text.replace(new RegExp(emojiRegex, 'gu'), '').trim();
}

/**
 * 24.5 & 24.7: Generate smart AI recommendation for customer with 1-hour cache and Fail-silent design.
 */
export async function generateCustomerRecommendation(params: {
  businessId: string;
  customerToken: string;
  locale?: 'ar' | 'en';
}): Promise<string | null> {
  const { businessId, customerToken, locale = 'ar' } = params;

  // 1. Guard check: Is ai_recommendations enabled for this business?
  const enabled = await isFeatureEnabled(businessId, 'ai_recommendations');
  if (!enabled) return null;

  // 2. Cache check (1-hour cache per customer token + locale)
  const cacheKey = `customer_ai_rec:${customerToken}:${locale}`;
  const now = Date.now();
  const memCached = memoryRecCache.get(cacheKey);
  if (memCached && memCached.expiresAt > now) {
    return memCached.text;
  }

  try {
    // Check Redis cache if configured
    const cachedText = await getCachedOrFetch<string | null>(
      cacheKey,
      async () => {
        // 3. Check business AI credentials
        const aiSettings = await getBusinessAiSettings(businessId);
        if (!aiSettings || !aiSettings.gemini_api_key) {
          // Fail-silent: No API key configured
          return null;
        }

        const adminClient = getServiceSupabase();

        // 4. Fetch customer points and business name
        let { data: customer, error: custErr } = await adminClient
          .from('customers')
          .select('id, business_id, businesses(name)')
          .eq('qr_token', customerToken)
          .maybeSingle();

        if (!customer && customerToken.length === 9) {
          const { data: upperCustomer } = await adminClient
            .from('customers')
            .select('id, business_id, businesses(name)')
            .eq('qr_token', customerToken.toUpperCase())
            .maybeSingle();
          customer = upperCustomer;
        }

        if (custErr || !customer) return null;

        // Calculate points balance from points_ledger
        const { data: ledgerEntries } = await adminClient
          .from('points_ledger')
          .select('points_change, reason')
          .eq('customer_id', customer.id);

        const currentBalance = (ledgerEntries || []).reduce((sum, e) => sum + (e.points_change || 0), 0);

        // Fetch redemption rate
        const { data: rateData } = await adminClient
          .from('redemption_rates')
          .select('currency_per_point')
          .eq('business_id', businessId)
          .maybeSingle();

        const currencyPerPoint = rateData?.currency_per_point || 0.1;

        // Fetch menu items for rewards
        const { data: menuItems } = await adminClient
          .from('menu_items')
          .select('name, price')
          .eq('business_id', businessId)
          .limit(10);

        // Find attainable or closest reward
        interface RewardTarget {
          name: string;
          pointsCost: number;
          canAfford: boolean;
          neededPoints: number;
        }

        const rewards: RewardTarget[] = (menuItems || []).map((item) => {
          const pointsCost = Math.max(1, Math.round(Number(item.price) / currencyPerPoint));
          return {
            name: item.name,
            pointsCost,
            canAfford: currentBalance >= pointsCost,
            neededPoints: Math.max(0, pointsCost - currentBalance),
          };
        });

        const affordable = rewards.filter((r) => r.canAfford);
        const nextTarget = rewards
          .filter((r) => !r.canAfford)
          .sort((a, b) => a.neededPoints - b.neededPoints)[0];

        // Fetch recent redemptions (last 3 items)
        const recentRedemptions = (ledgerEntries || [])
          .filter((e) => e.points_change < 0 && e.reason?.startsWith('redeem:'))
          .slice(-3)
          .map((e) => e.reason.replace('redeem:', ''));

        const bizName = (customer as any)?.businesses?.name || 'المكان';

        // 5. Construct Zero-PII Prompt (NO phone, NO personal identifier)
        const promptAr = `أنت مساعد ولاء ودود لـ "${bizName}".
بيانات العميل:
- رصيد النقاط الحالي: ${currentBalance} نقطة.
- مكافآت يمكنه استبدالها فوراً: ${affordable.map((r) => r.name).join('، ') || 'لا يوجد حالياً'}.
- أقرب مكافأة قادمة: ${nextTarget ? `${nextTarget.name} (ينقصه ${nextTarget.neededPoints} نقطة فقط)` : 'وصلت لأعلى المكافآت'}.
${recentRedemptions.length > 0 ? `- طلباته السابقة المفضلة: ${recentRedemptions.join('، ')}` : ''}

المطلوب:
اكتب جملة واحدة فقط قصيرة جداً (أقل من 25 كلمة)، بأسلوب دافئ وودود، تشجعه على جمع النقاط أو تقترح عليه مكافأته المناسبة.
قواعد صارمة:
- ممنوع منعاً باتاً استخدام أي إيموجيز أو رموز تعبيرية نهائياً.
- اكتب جملة التوصية مباشرة دون مقدمات أو تحيات أو علامات اقتباس.`;

        const promptEn = `You are a friendly loyalty assistant for "${bizName}".
Customer loyalty status:
- Current points balance: ${currentBalance} points.
- Available rewards to redeem right now: ${affordable.map((r) => r.name).join(', ') || 'None yet'}.
- Nearest upcoming reward: ${nextTarget ? `${nextTarget.name} (needs only ${nextTarget.neededPoints} more points)` : 'All rewards accessible'}.
${recentRedemptions.length > 0 ? `- Recent redemptions: ${recentRedemptions.join(', ')}` : ''}

Task:
Write EXACTLY ONE short motivating sentence (under 25 words), in a warm tone, suggesting a reward or encouraging them to earn.
STRICT RULES:
- ZERO EMOJIS or symbols of any kind.
- Output ONLY the recommendation sentence with no quotes or prefixes.`;

        const prompt = locale === 'en' ? promptEn : promptAr;

        // 6. Invoke Gemini API with strict 4s timeout (Fail-silent)
        const model = aiSettings.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiSettings.gemini_api_key}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 60,
                temperature: 0.7,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            console.warn(`Gemini API returned status ${response.status}`);
            return null;
          }

          const resData = await response.json();
          const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!candidateText || typeof candidateText !== 'string') return null;

          const cleanText = sanitizeZeroEmojis(
            candidateText.replace(/^["'«“]|["'»”]$/g, '').trim()
          );

          return cleanText || null;
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          console.warn('Gemini API call timed out or failed (fail-silent):', fetchErr.message);
          return null;
        }
      },
      3600 // Cache for 1 hour
    );

    if (cachedText) {
      memoryRecCache.set(cacheKey, { text: cachedText, expiresAt: now + 3600 * 1000 });
    }

    return cachedText;
  } catch (err: any) {
    // 24.8 & 24.9: Fail-silent: Core system never breaks
    console.warn('generateCustomerRecommendation error (fail-silent):', err.message);
    return null;
  }
}
