-- ==============================================================================
-- Migration: Phase 1 — Database Schema (الجداول الأساسية)
-- Description: Core tables, foreign keys, constraints, triggers, and mandatory indexes.
-- Adheres strictly to RULES.md & PLAN.md
-- ==============================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================================================
-- 1.1. businesses Table (جدول الأنشطة التجارية)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subdomain TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_businesses_updated_at ON public.businesses;
CREATE TRIGGER tr_businesses_updated_at
    BEFORE UPDATE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.2. branches Table (جدول الفروع)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_branches_updated_at ON public.branches;
CREATE TRIGGER tr_branches_updated_at
    BEFORE UPDATE ON public.branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.3. customers Table (جدول العملاء)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    qr_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_customers_updated_at ON public.customers;
CREATE TRIGGER tr_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.4. menu_items Table (جدول عناصر المنيو والمنتجات)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER tr_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.5. points_ledger Table (جدول سجل النقاط)
-- Designed for future partitioning compatibility (RULES.md section 1)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.points_ledger (
    id UUID DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, business_id)
);

DROP TRIGGER IF EXISTS tr_points_ledger_updated_at ON public.points_ledger;
CREATE TRIGGER tr_points_ledger_updated_at
    BEFORE UPDATE ON public.points_ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.6. redemption_rates Table (جدول نسب استبدال النقاط)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.redemption_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE UNIQUE,
    points_per_currency_unit NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (points_per_currency_unit > 0),
    currency_per_point NUMERIC(10, 2) NOT NULL DEFAULT 0.10 CHECK (currency_per_point > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_redemption_rates_updated_at ON public.redemption_rates;
CREATE TRIGGER tr_redemption_rates_updated_at
    BEFORE UPDATE ON public.redemption_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 1.7. Mandatory Indexes (RULES.md Section 1 line 31 & PLAN.md 1.7)
-- ==============================================================================
-- Mandatory: (business_id, customer_id) on points_ledger
CREATE INDEX IF NOT EXISTS idx_points_ledger_business_customer
    ON public.points_ledger (business_id, customer_id);

-- Mandatory: qr_token (unique) on customers
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_qr_token
    ON public.customers (qr_token);

-- Mandatory: (business_id, created_at) on points_ledger
CREATE INDEX IF NOT EXISTS idx_points_ledger_business_created
    ON public.points_ledger (business_id, created_at DESC);

-- Supporting Foreign Key & Query Indexes
CREATE INDEX IF NOT EXISTS idx_branches_business_id
    ON public.branches (business_id);

CREATE INDEX IF NOT EXISTS idx_customers_business_id
    ON public.customers (business_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_business_id
    ON public.menu_items (business_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_branch_id
    ON public.menu_items (branch_id);
