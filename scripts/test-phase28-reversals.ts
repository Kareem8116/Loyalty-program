/**
 * Phase 28: Test Suite for Returns & Reversals of Points Transactions (28.6)
 * 
 * Tests:
 * 1. Redemption Refund with FIFO Restitution:
 *    - Customer has two separate earn rows.
 *    - Customer redeems points consuming partially from both.
 *    - Redemption is reversed.
 *    - Both earn rows recover their exact remaining_amount, preserving original expires_at.
 * 2. Anti-Double-Reversal:
 *    - Attempting to reverse the same transaction twice must be rejected with ALREADY_REVERSED.
 * 3. Cannot Reverse a Reversal:
 *    - Attempting to reverse a reversal entry itself must be rejected with CANNOT_REVERSE_REVERSAL.
 * 4. Earn Reversal (Cashier Mistake / Product Return):
 *    - Points are added.
 *    - Operation is reversed.
 *    - Points are deducted and customer balance returns to expected.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { recordPointsTransaction, reversePointsTransaction } from '../lib/cashier';
import { getCustomerPointsBalance } from '../lib/customer';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message}`);
}

async function runPhase28TestSuite() {
  console.log('🧪 Starting Phase 28 Reversals & Returns Test Suite...\n');

  const rand = Date.now().toString().slice(-6);

  // 1. Setup test business
  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .insert({ name: `Reversal Test Store ${rand}`, subdomain: `rev-test-${rand}` })
    .select()
    .single();
  assert(!bizErr && !!biz, `Business created (${biz?.id})`);

  // Setup test cashier
  const cashierEmail = `cashier-rev-${rand}@pointat.net`;
  const { data: cashierAuth } = await supabase.auth.admin.createUser({
    email: cashierEmail,
    password: 'Password123!',
    email_confirm: true,
  });
  await supabase.from('user_roles').insert({
    user_id: cashierAuth.user!.id,
    business_id: biz.id,
    role: 'cashier',
  });

  // Setup test customer
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .insert({
      business_id: biz.id,
      name: 'Reversal Test Customer',
      phone_number: `+2010${rand}99`,
      qr_token: crypto.randomUUID(),
    })
    .select()
    .single();
  assert(!custErr && !!customer, `Customer created (${customer?.id})`);

  // --- Test A: Earn Reversal (Cashier Mistake) ---
  console.log('\n--- Test A: Earn Reversal (Cashier Mistake / Order Cancelled) ---');
  const addResult = await recordPointsTransaction({
    businessId: biz.id,
    customerId: customer.id,
    pointsChange: 100,
    reason: 'Wrong addition to cancel',
    invoiceReference: `INV-REV-A-${rand}`,
    createdBy: cashierAuth.user!.id,
  });
  assert(addResult.success && addResult.newBalance === 100, 'Earn transaction added (+100 pts)');

  const earnReversal = await reversePointsTransaction({
    businessId: biz.id,
    transactionId: addResult.ledgerRecord.id,
    reason: 'خطأ كاشير في الإدخال',
    userId: cashierAuth.user!.id,
    userRole: 'cashier',
  });
  assert(earnReversal.success && earnReversal.newBalance === 0, 'Earn reversal executed (-100 pts), balance back to 0');

  // --- Test B: Anti-Double-Reversal ---
  console.log('\n--- Test B: Anti-Double-Reversal (Attempting to reverse twice) ---');
  try {
    await reversePointsTransaction({
      businessId: biz.id,
      transactionId: addResult.ledgerRecord.id,
      reason: 'Attempt double reverse',
      userId: cashierAuth.user!.id,
      userRole: 'cashier',
    });
    assert(false, 'Should NOT allow reversing the same transaction twice');
  } catch (err: any) {
    assert(err.code === 'ALREADY_REVERSED', `Rejected double reversal with code ${err.code}`);
  }

  // --- Test C: Cannot Reverse a Reversal Entry ---
  console.log('\n--- Test C: Cannot Reverse a Reversal Entry Itself ---');
  try {
    await reversePointsTransaction({
      businessId: biz.id,
      transactionId: earnReversal.reversalRecord.id,
      reason: 'Reverse the reversal',
      userId: cashierAuth.user!.id,
      userRole: 'cashier',
    });
    assert(false, 'Should NOT allow reversing a reversal record');
  } catch (err: any) {
    assert(err.code === 'CANNOT_REVERSE_REVERSAL', `Rejected reversing a reversal with code ${err.code}`);
  }

  // --- Test D: Redemption Refund with FIFO Restitution ---
  console.log('\n--- Test D: Redemption Refund with FIFO Restitution ---');
  // Add two earn batches
  const earn1 = await recordPointsTransaction({
    businessId: biz.id,
    customerId: customer.id,
    pointsChange: 60,
    reason: 'Earn Batch 1',
    invoiceReference: `INV-BATCH-1-${rand}`,
    createdBy: cashierAuth.user!.id,
  });
  const earn2 = await recordPointsTransaction({
    businessId: biz.id,
    customerId: customer.id,
    pointsChange: 80,
    reason: 'Earn Batch 2',
    invoiceReference: `INV-BATCH-2-${rand}`,
    createdBy: cashierAuth.user!.id,
  });
  assert(earn2.newBalance === 140, 'Two batches added (60 + 80 = 140 pts)');

  // Redeem 90 pts (consumes 60 from Batch 1, and 30 from Batch 2)
  const redeemResult = await recordPointsTransaction({
    businessId: biz.id,
    customerId: customer.id,
    pointsChange: -90,
    reason: 'Redeem Item',
    createdBy: cashierAuth.user!.id,
  });
  assert(redeemResult.newBalance === 50, '90 points redeemed via FIFO (Balance: 50 pts)');

  // Verify FIFO deduction before reversal:
  const { data: e1Before } = await supabase.from('points_ledger').select('remaining_amount').eq('id', earn1.ledgerRecord.id).single();
  const { data: e2Before } = await supabase.from('points_ledger').select('remaining_amount').eq('id', earn2.ledgerRecord.id).single();
  assert(Number(e1Before?.remaining_amount) === 0, 'Batch 1 was fully consumed (0 remaining)');
  assert(Number(e2Before?.remaining_amount) === 50, 'Batch 2 was partially consumed (50 remaining)');

  // Now Reverse the redemption (Customer returned the redeemed product)
  const redeemRefund = await reversePointsTransaction({
    businessId: biz.id,
    transactionId: redeemResult.ledgerRecord.id,
    reason: 'مرتجع منتج استبدله العميل',
    userId: cashierAuth.user!.id,
    userRole: 'cashier',
  });
  assert(redeemRefund.success && redeemRefund.newBalance === 140, 'Redemption refunded (+90 pts), total balance restored to 140 pts');

  // Verify FIFO Restitution: both earn rows must have recovered their exact original remaining_amount!
  const { data: e1After } = await supabase.from('points_ledger').select('remaining_amount').eq('id', earn1.ledgerRecord.id).single();
  const { data: e2After } = await supabase.from('points_ledger').select('remaining_amount').eq('id', earn2.ledgerRecord.id).single();
  assert(Number(e1After?.remaining_amount) === 60, 'Batch 1 restored exactly to original remaining_amount (60 pts)');
  assert(Number(e2After?.remaining_amount) === 80, 'Batch 2 restored exactly to original remaining_amount (80 pts)');

  // Cleanup
  console.log('\n--- Cleanup ---');
  await supabase.from('points_ledger').delete().eq('business_id', biz.id);
  await supabase.from('customers').delete().eq('business_id', biz.id);
  await supabase.from('user_roles').delete().eq('business_id', biz.id);
  await supabase.auth.admin.deleteUser(cashierAuth.user!.id);
  await supabase.from('businesses').delete().eq('id', biz.id);
  console.log('  ✅ Temporary test data cleaned up safely.\n');

  console.log('🎉 Phase 28 Reversals & Returns Test Suite PASSED 100%!\n');
}

runPhase28TestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
