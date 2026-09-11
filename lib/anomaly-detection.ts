/**
 * lib/anomaly-detection.ts
 * Phase 31: Smart Anomaly Detection Engine (كشف الأنماط المشبوهة بالذكاء الاصطناعي)
 * 
 * Architecture:
 * 1. Rule-Based Pre-Filtering (Phase 31.2):
 *    Mandatory deterministic filtering before any external AI API calls.
 *    Only transactions violating clear thresholds are evaluated.
 * 2. AI Explanation Layer (Phase 31.3):
 *    Invokes Gemini API with anonymized data to produce human-readable Arabic explanations for the Owner.
 * 3. Fail-Silent & Non-Blocking (Phase 31.5):
 *    Strictly informative and alerting only. Zero authority to block or auto-reverse transactions.
 *    Any AI failure falls back smoothly to the rule description without breaking anything.
 */

import { getServiceSupabase } from './supabase';
import { isFeatureEnabled } from './features';

export interface AnomalyItem {
  id: string;
  transactionId: string;
  type: 'frequency_spike' | 'point_outlier' | 'high_reversals' | 'duplicate_invoice';
  severity: 'medium' | 'high';
  ruleDescription: string;
  explanation: string;
  isAiGenerated: boolean;
  detectedAt: string;
  metadata: {
    customerFrequency1h?: number;
    pointsValue?: number;
    averagePoints?: number;
    reversalCount?: number;
    invoiceReference?: string;
  };
  transaction: {
    id: string;
    pointsChange: number;
    createdAt: string;
    cashierName: string;
    customerName?: string;
    invoiceReference?: string | null;
  };
}

function sanitizeZeroEmojis(text: string): string {
  return text.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ''
  ).trim();
}

/**
 * Generate a concise Arabic explanation using Gemini API for a flagged anomaly.
 * Anonymized data only (no customer names or phone numbers).
 */
export async function generateAiExplanation(
  apiKey: string,
  model: string,
  patternDescription: string
): Promise<string | null> {
  const prompt = `أنت مساعد خبير أمني لتحليل المعاملات لمالك متجر في برنامج ولاء العملاء Pointat.
السياق: تم رصد نمط غير معتاد في سجل نقاط الولاء.
النمط: ${patternDescription}.

المطلوب:
اكتب ملخصاً توضيحياً قصيراً جداً ومباشراً باللغة العربية (أقل من 30 كلمة) يوضح للمالك سبب كون هذه العملية غير معتادة وما ينبغي له مراجعته (مثل فحص الفاتورة أو التحدث مع الكاشير).

شروط صارمة:
- ممنوع منعاً باتاً استخدام أي إيموجيز أو رموز تعبيرية نهائياً.
- اكتب التفسير مباشرة دون مقدمات أو تحيات أو علامات اقتباس.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second strict timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 70,
          temperature: 0.3,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[AnomalyDetection] Gemini API returned status ${response.status}`);
      return null;
    }

    const resData = await response.json();
    const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText || typeof candidateText !== 'string') return null;

    const cleanText = sanitizeZeroEmojis(
      candidateText.replace(/^["'«“]|["'»”]$/g, '').trim()
    );

    return cleanText || null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[AnomalyDetection] Gemini explanation non-blocking error:', err);
    return null;
  }
}

/**
 * Main Anomaly Detection entry point.
 * Scans transactions using rule-based pre-filtering, then augments with AI if enabled.
 */
export async function detectAnomalies(
  businessId: string,
  transactions: any[]
): Promise<AnomalyItem[]> {
  if (!businessId || !transactions || transactions.length === 0) {
    return [];
  }

  try {
    const anomalies: AnomalyItem[] = [];

    // 1. Calculate Baseline Metrics
    const earnTxs = transactions.filter((t) => t.pointsChange > 0);
    const avgEarnPoints = earnTxs.length > 0
      ? earnTxs.reduce((sum, t) => sum + t.pointsChange, 0) / earnTxs.length
      : 50;

    // 2. Rule A: Frequency Spikes (Same customer received points > 3 times within 1 hour)
    const customerTxMap = new Map<string, any[]>();
    transactions.forEach((tx) => {
      const custId = tx.customer?.id;
      if (custId && tx.pointsChange > 0) {
        if (!customerTxMap.has(custId)) customerTxMap.set(custId, []);
        customerTxMap.get(custId)!.push(tx);
      }
    });

    customerTxMap.forEach((txList, custId) => {
      if (txList.length >= 3) {
        // Sort chronologically ascending
        txList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        for (let i = 0; i < txList.length; i++) {
          const windowStart = new Date(txList[i].createdAt).getTime();
          const inWindow = txList.slice(i).filter((t) => {
            const tTime = new Date(t.createdAt).getTime();
            return tTime - windowStart <= 60 * 60 * 1000; // 1 hour window
          });

          if (inWindow.length >= 3) {
            const targetTx = inWindow[inWindow.length - 1];
            // Avoid duplicate anomaly entries
            if (!anomalies.some((a) => a.transactionId === targetTx.id)) {
              anomalies.push({
                id: `anom_freq_${targetTx.id}`,
                transactionId: targetTx.id,
                type: 'frequency_spike',
                severity: inWindow.length >= 4 ? 'high' : 'medium',
                ruleDescription: `تكرار ${inWindow.length} عمليات إضافة نقاط لنفس العميل خلال أقل من ساعة`,
                explanation: `تكرار ${inWindow.length} عمليات إضافة نقاط لنفس العميل خلال أقل من ساعة`,
                isAiGenerated: false,
                detectedAt: new Date().toISOString(),
                metadata: {
                  customerFrequency1h: inWindow.length,
                  pointsValue: targetTx.pointsChange,
                  invoiceReference: targetTx.invoiceReference || undefined,
                },
                transaction: {
                  id: targetTx.id,
                  pointsChange: targetTx.pointsChange,
                  createdAt: targetTx.createdAt,
                  cashierName: targetTx.cashier?.name || 'النظام',
                  customerName: targetTx.customer?.name,
                  invoiceReference: targetTx.invoiceReference,
                },
              });
            }
            break;
          }
        }
      }
    });

    // 3. Rule B: Point Outliers (Single transaction points > 3x average of other transactions, or >= 250)
    transactions.forEach((tx) => {
      if (tx.pointsChange > 0) {
        const otherEarnTxs = earnTxs.filter((t) => t.id !== tx.id);
        const baselineAvg = otherEarnTxs.length > 0
          ? otherEarnTxs.reduce((sum, t) => sum + t.pointsChange, 0) / otherEarnTxs.length
          : avgEarnPoints;

        const isOutlier = (otherEarnTxs.length >= 2 && tx.pointsChange >= Math.max(baselineAvg * 3, 100)) ||
                          (tx.pointsChange >= 250);

        if (isOutlier) {
          if (!anomalies.some((a) => a.transactionId === tx.id)) {
            anomalies.push({
              id: `anom_val_${tx.id}`,
              transactionId: tx.id,
              type: 'point_outlier',
              severity: tx.pointsChange >= 300 ? 'high' : 'medium',
              ruleDescription: `عملية نقاط مرتفعة (${tx.pointsChange} نقطة) تتجاوز متوسط عمليات المتجر (${Math.round(baselineAvg)} نقطة) بأكثر من 3 أضعاف`,
              explanation: `عملية نقاط مرتفعة (${tx.pointsChange} نقطة) تتجاوز متوسط عمليات المتجر (${Math.round(baselineAvg)} نقطة) بأكثر من 3 أضعاف`,
              isAiGenerated: false,
              detectedAt: new Date().toISOString(),
              metadata: {
                pointsValue: tx.pointsChange,
                averagePoints: Math.round(baselineAvg),
                invoiceReference: tx.invoiceReference || undefined,
              },
              transaction: {
                id: tx.id,
                pointsChange: tx.pointsChange,
                createdAt: tx.createdAt,
                cashierName: tx.cashier?.name || 'النظام',
                customerName: tx.customer?.name,
                invoiceReference: tx.invoiceReference,
              },
            });
          }
        }
      }
    });

    // 4. Rule C: High Cashier Reversals (Same cashier executed >= 2 reversals on same date)
    const cashierReversals = new Map<string, any[]>();
    transactions.forEach((tx) => {
      if (tx.type === 'reversal' || tx.reversalOf || tx.isReversed) {
        const cId = tx.cashier?.id || 'unknown';
        if (!cashierReversals.has(cId)) cashierReversals.set(cId, []);
        cashierReversals.get(cId)!.push(tx);
      }
    });

    cashierReversals.forEach((revList, cId) => {
      if (revList.length >= 2) {
        const latestRev = revList[0];
        if (!anomalies.some((a) => a.transactionId === latestRev.id)) {
          anomalies.push({
            id: `anom_rev_${latestRev.id}`,
            transactionId: latestRev.id,
            type: 'high_reversals',
            severity: revList.length >= 3 ? 'high' : 'medium',
            ruleDescription: `تسجيل ${revList.length} عمليات استرجاع/إلغاء نقاط بواسطة نفس الكاشير (${latestRev.cashier?.name || 'الكاشير'}) في نفس اليوم`,
            explanation: `تسجيل ${revList.length} عمليات استرجاع/إلغاء نقاط بواسطة نفس الكاشير (${latestRev.cashier?.name || 'الكاشير'}) في نفس اليوم`,
            isAiGenerated: false,
            detectedAt: new Date().toISOString(),
            metadata: {
              reversalCount: revList.length,
            },
            transaction: {
              id: latestRev.id,
              pointsChange: latestRev.pointsChange,
              createdAt: latestRev.createdAt,
              cashierName: latestRev.cashier?.name || 'النظام',
              customerName: latestRev.customer?.name,
              invoiceReference: latestRev.invoiceReference,
            },
          });
        }
      }
    });

    // 5. Rule D: Duplicate Invoice References
    const invoiceMap = new Map<string, any[]>();
    transactions.forEach((tx) => {
      const inv = tx.invoiceReference?.trim();
      if (inv && inv.length > 2 && tx.type !== 'reversal') {
        if (!invoiceMap.has(inv)) invoiceMap.set(inv, []);
        invoiceMap.get(inv)!.push(tx);
      }
    });

    invoiceMap.forEach((invList, inv) => {
      if (invList.length > 1) {
        const latestInvTx = invList[0];
        if (!anomalies.some((a) => a.transactionId === latestInvTx.id)) {
          anomalies.push({
            id: `anom_inv_${latestInvTx.id}`,
            transactionId: latestInvTx.id,
            type: 'duplicate_invoice',
            severity: 'high',
            ruleDescription: `تكرار استخدام نفس رقم الفاتورة (${inv}) في ${invList.length} عمليات منفصلة`,
            explanation: `تكرار استخدام نفس رقم الفاتورة (${inv}) في ${invList.length} عمليات منفصلة`,
            isAiGenerated: false,
            detectedAt: new Date().toISOString(),
            metadata: {
              invoiceReference: inv,
            },
            transaction: {
              id: latestInvTx.id,
              pointsChange: latestInvTx.pointsChange,
              createdAt: latestInvTx.createdAt,
              cashierName: latestInvTx.cashier?.name || 'النظام',
              customerName: latestInvTx.customer?.name,
              invoiceReference: inv,
            },
          });
        }
      }
    });

    // If no anomalies flagged by rule-based pre-filtering, return empty array immediately (0 AI API cost)
    if (anomalies.length === 0) {
      return [];
    }

    // 6. Phase 31.3: AI Explanation Layer (Only if feature is enabled for business)
    const isAiEnabled = await isFeatureEnabled(businessId, 'ai_anomaly_detection');
    if (!isAiEnabled) {
      return anomalies;
    }

    // Fetch business Gemini settings (reused from Phase 24)
    const adminClient = getServiceSupabase();
    const { data: aiSettings } = await adminClient
      .from('business_ai_settings')
      .select('gemini_api_key, model')
      .eq('business_id', businessId)
      .maybeSingle();

    if (!aiSettings?.gemini_api_key) {
      return anomalies;
    }

    // Enhance up to 3 top anomalies with AI explanations in parallel (to maintain low latency)
    const topAnomalies = anomalies.slice(0, 3);
    await Promise.all(
      topAnomalies.map(async (item) => {
        try {
          const patternSnippet = `النوع: ${item.type}، الوصف المبدئي: ${item.ruleDescription}، النقاط: ${item.transaction.pointsChange}، رقم الفاتورة: ${item.transaction.invoiceReference || 'غير محدد'}`;
          const aiText = await generateAiExplanation(
            aiSettings.gemini_api_key,
            aiSettings.model || 'gemini-1.5-flash',
            patternSnippet
          );

          if (aiText) {
            item.explanation = aiText;
            item.isAiGenerated = true;
          }
        } catch (err) {
          // Fail-silent fallback already preserved in item.explanation
        }
      })
    );

    return anomalies;
  } catch (error) {
    console.error('[AnomalyDetection] detectAnomalies error (fail-silent):', error);
    return [];
  }
}
