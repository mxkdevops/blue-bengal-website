CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (email)
);

-- Explicit opt-in for promotional/voucher emails (UK GDPR/PECR marketing consent).
-- Defaults to false; only set true when the guest actively ticks the box at booking time.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_code VARCHAR(12) NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    guests INTEGER NOT NULL CHECK (guests > 0 AND guests <= 20),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS feedback_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);

CREATE TABLE IF NOT EXISTS settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    auto_accept_bookings BOOLEAN NOT NULL DEFAULT false,
    max_guests_per_booking INTEGER NOT NULL DEFAULT 20,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settings_singleton CHECK (id = 1)
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS opening_time TIME NOT NULL DEFAULT '17:30';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS closing_time TIME NOT NULL DEFAULT '21:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_guests_per_booking INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_advance_notice_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS confirmation_message TEXT NOT NULL
    DEFAULT 'Your reservation has been received. We look forward to welcoming you!';
-- Days of the week that are fully closed to booking, every week.
-- 0 = Sunday ... 6 = Saturday (matches JS Date#getDay()). Defaults to Tuesday, matching
-- the current published opening hours.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS closed_weekdays INTEGER[] NOT NULL DEFAULT '{2}';

-- Automated reminder / post-visit feedback emails (sending itself is stubbed
-- until a real email provider API key is configured — see emailSender.js).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER NOT NULL DEFAULT 24;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS feedback_hours_after INTEGER NOT NULL DEFAULT 3;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS feedback_link TEXT NOT NULL DEFAULT 'https://www.facebook.com/bluebengal';

INSERT INTO settings (id, auto_accept_bookings)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- start_time/end_time both NULL means the whole day is blocked (e.g. Christmas Day).
-- Otherwise both must be set, blocking just that time range on that date.
CREATE TABLE IF NOT EXISTS blocked_slots (
    id SERIAL PRIMARY KEY,
    block_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((start_time IS NULL) = (end_time IS NULL)),
    CHECK (start_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_date ON blocked_slots(block_date);

-- Loosen start_time/end_time to nullable for installs where blocked_slots was created
-- before whole-day blocks were supported (CREATE TABLE IF NOT EXISTS above won't retrofit this).
ALTER TABLE blocked_slots ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE blocked_slots ALTER COLUMN end_time DROP NOT NULL;

-- Record of reminder/feedback/voucher emails the scheduler or admin has triggered, so they
-- can be reviewed in the admin panel even while actual delivery is stubbed (no provider configured yet).
CREATE TABLE IF NOT EXISTS email_log (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    email_type VARCHAR(20) NOT NULL CHECK (email_type IN ('reminder', 'feedback')),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'stub',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);

-- Admin-managed discount/voucher codes (e.g. "WELCOME10", "first 10 customers", "Wednesday 10% off").
-- Redemption is manual/in-person, tracked here — there's no online payment on this site.
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    times_redeemed INTEGER NOT NULL DEFAULT 0,
    expires_at DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES vouchers(id) ON DELETE CASCADE;

-- Widen the email_type check to include voucher sends. Named explicitly so this ALTER is
-- idempotent across both fresh installs and databases that already had the narrower check.
ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_email_type_check;
ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_type_check;
ALTER TABLE email_log ADD CONSTRAINT email_log_type_check CHECK (email_type IN ('reminder', 'feedback', 'voucher', 'confirmation', 'cancellation'));
