-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Users table
-- Mirrors auth.users but stores role & profile data.
-- Must exist before any other table that references users.id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'admin', 'billing', 'sales', 'support', 'tech', 'customer'
);

CREATE TABLE users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         VARCHAR(120)  NOT NULL,
  email        VARCHAR(255)  NOT NULL UNIQUE,
  phone        VARCHAR(20),
  role         user_role     NOT NULL DEFAULT 'customer',
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_role     ON users (role);
CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_active   ON users (is_active) WHERE is_active = true;

-- Auto-update updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (id = auth.uid());

-- Admin and billing can read all users
CREATE POLICY "users_read_staff" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'sales', 'support')
    )
  );

-- Only admin can insert/update/delete users
CREATE POLICY "users_admin_write" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Service role bypasses RLS (used in API routes)
CREATE POLICY "users_service_role" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- ── Auto-create user profile on signup ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();
