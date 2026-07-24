CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'content', 'client')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

CREATE TABLE IF NOT EXISTS content (
    id SERIAL PRIMARY KEY,
    section_key VARCHAR(100) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    image_key VARCHAR(50) UNIQUE NOT NULL,
    data BYTEA NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backups (
    id SERIAL PRIMARY KEY,
    label VARCHAR(200) NOT NULL,
    content_snapshot JSONB NOT NULL,
    images_snapshot JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(60) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    hidden BOOLEAN NOT NULL DEFAULT false,
    section_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    hidden_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    deleted_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    meta_title VARCHAR(255) NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    meta_keywords TEXT NOT NULL DEFAULT '',
    og_title VARCHAR(255) NOT NULL DEFAULT '',
    og_description TEXT NOT NULL DEFAULT '',
    og_image TEXT NOT NULL DEFAULT '',
    canonical_url TEXT NOT NULL DEFAULT '',
    noindex BOOLEAN NOT NULL DEFAULT false,
    show_in_nav BOOLEAN NOT NULL DEFAULT true,
    nav_label VARCHAR(200) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) NOT NULL,
    capability VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (role, capability)
);

CREATE TABLE IF NOT EXISTS page_access (
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    section_key VARCHAR(100),
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public lead capture: the footer contact/booking form ('contact'), the
-- gated case-study PDF downloads ('pdf_download'), and voluntary "email me
-- my result" requests from the Owner Dependency Review ('quiz_results',
-- message column holds the score/band/RAG breakdown text). No user_id —
-- these come from anonymous visitors.
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    kind VARCHAR(20) NOT NULL DEFAULT 'contact',
    name VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    preferred_time VARCHAR(255) NOT NULL DEFAULT '',
    document VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
