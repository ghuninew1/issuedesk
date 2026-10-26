-- ============================================================
-- IssueDesk QR Code Studio
-- Migration: 0007_create_qr_studio_tables.sql
-- ============================================================


-- ============================================================
-- Short Links
-- ============================================================

CREATE TABLE IF NOT EXISTS short_links (
    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    slug TEXT NOT NULL UNIQUE,

    destination_url TEXT NOT NULL,

    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- Short Link lookup:
-- GET /q/:slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_short_links_slug
    ON short_links(slug);


-- User's Short Links
CREATE INDEX IF NOT EXISTS idx_short_links_user_id
    ON short_links(user_id);


-- ============================================================
-- QR Codes
-- ============================================================

CREATE TABLE IF NOT EXISTS qr_codes (
    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    name TEXT NOT NULL,

    type TEXT NOT NULL
        CHECK (type IN ('url', 'short-link', 'text')),

    content TEXT,

    short_link_id TEXT,

    foreground_color TEXT NOT NULL DEFAULT '#111827',
    background_color TEXT NOT NULL DEFAULT '#FFFFFF',

    error_correction TEXT NOT NULL DEFAULT 'Q'
        CHECK (error_correction IN ('M', 'Q', 'H')),

    logo_url TEXT,

    logo_size REAL NOT NULL DEFAULT 0.20
        CHECK (logo_size >= 0.05 AND logo_size <= 0.40),

    logo_background INTEGER NOT NULL DEFAULT 1
        CHECK (logo_background IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (short_link_id)
        REFERENCES short_links(id)
        ON DELETE SET NULL,

    CHECK (
        (type = 'short-link' AND short_link_id IS NOT NULL)
        OR
        (type IN ('url', 'text') AND content IS NOT NULL)
    )
);


-- My QR Codes
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id
    ON qr_codes(user_id);


-- QR → Short Link relationship
CREATE INDEX IF NOT EXISTS idx_qr_codes_short_link_id
    ON qr_codes(short_link_id);


-- Sorting My QR Codes
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_created
    ON qr_codes(user_id, created_at DESC);