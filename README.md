# OCF — Oromo Cultural Fashion Platform v2.0
### Complete E-Commerce System | Men · Women · Kids

**Built by:** Group 2, SE G3 Section A — Arba Minch University
**Version:** 2.0 Enhanced

---

## What's Inside

### Frontend (index.html)
A fully self-contained single-file e-commerce platform. Open directly in any browser.

**14 Pages:** Home · Men · Women · Kids · Shop All · Collections · Bundles · About · Contact · FAQ · Size Guide · Wishlist · Checkout · Account

---

## Product Catalog (32 items)

| Gender | Count | Categories |
|--------|-------|-----------|
| Men | 11 | T-Shirts, Polo, Hoodies, Jackets, Traditional, Suits, Wedding, Sportswear |
| Women | 12 | Dresses, Skirts, Blouses, Hijabs, Traditional, Bridal, Sportswear |
| Kids | 9 | Boys, Girls, Uniforms, Traditional (Ages 2–15) |

---

## Size System
Adults: XS S M L XL XXL XXXL
Children: 2–3yr 4–5yr 6–7yr 8–9yr 10–12yr 13–15yr

---

## Key Features

### Languages
- English and Afaan Oromoo interface with a keyboard-accessible language switcher
- Selected language is remembered in browser local storage
- Product and category names/descriptions support both languages; missing Afaan Oromoo text displays English
- Admins can create and edit both language versions independently

### Product
- Multi-image viewer with hover zoom (front/back/side)
- Color picker (Black, White, Red, Blue, Green, Yellow, Brown, Oromo Cultural)
- Stock indicator, back-in-stock notify
- Customer reviews + Write a Review form
- Related products, social share, PDF brochure

### Shopping
- Full sidebar filters: gender, category, size, color, price, collection
- Quick filter pills per gender page
- Wishlist (Add All to Cart / Clear)
- Product comparison (up to 3, compare modal + bar)
- Recently viewed products
- Badges: New, Best Seller, Sale %, Featured, Oromo Cultural

### Cart & Checkout
- Cart drawer with qty controls
- Promo codes: WELCOME10, BUNDLE15, WEDDING20
- 4-step checkout with validation
- Payment: Chapa, PayPal, Visa/MC, Bank Transfer
- Order history

### Account Page
- Register / Login, My Orders, Order Tracking, Profile editor

### Downloads
- Full, Men's, Women's, Kids' catalogs + Size Guide + Product Brochures (PDF)

### Other
- Countdown sale timer, WhatsApp integration, newsletter, FAQ with category filter
- Responsive mobile/tablet/desktop, toast notifications, search with live dropdown

---

## How to Run

### Frontend only
Open index.html in any browser — no server needed.

### With Backend (PostgreSQL)
```bash
cd backend
npm install
npm run migrate   # Apply pending PostgreSQL schema migrations
npm run test:db    # Verify PostgreSQL connection
npm run test:api   # Verify API endpoints against PostgreSQL
npm start          # Start API server on port 5000
```
Then open `index.html` in your browser.

Migration `003_multilingual_catalog.sql` adds the English and Afaan Oromoo catalog columns. It backfills the English columns from existing product/category names and descriptions, retains the legacy columns for API compatibility, and leaves Oromo translations empty until an admin supplies them. Apply it to the intended PostgreSQL database with `npm run migrate`.

### Staging-only migrations
For an explicitly approved, separate staging database, run `npm run migrate:staging` from `backend`. The command requires `OCF_STAGING_ONLY=YES`, `OCF_STAGING_DATABASE_URL`, `OCF_STAGING_ALLOWED_DATABASE_HOST`, and `OCF_STAGING_ALLOWED_DATABASE_NAME`; configure the hostname and database-name allowlist independently from the staging provider console. This entry point does not load dotenv or fall back to `DATABASE_URL`. Do not use the production `npm run migrate` command for staging. If a migration fails or the database has application tables without migration history, stop and inspect the staging schema before retrying; migration 003 is not safe to rerun blindly.

#### Staging migration recovery
If a migration fails, rollback cannot be confirmed, or the `COMMIT` response is lost, stop migration attempts and stop application writes to that staging database. Do not infer the outcome from the client error: an ambiguous `COMMIT` may have succeeded server-side. A qualified operator should take or confirm a staging backup, then use a separately approved read-only inspection to compare `schema_migrations` with the schema and the migration SQL. For `003_multilingual_catalog.sql`, inspect all expected product/category columns, the English backfill, and whether version `003` is recorded. If the schema changes are complete but history is missing, reconcile the history only after independently confirming the database, migration file, and effects; never insert a history row based on assumption. If the schema is partial or its state is unclear, do not rerun migration 003; restore from the verified staging backup or prepare a reviewed corrective migration. Do not apply this recovery procedure to production as an unapproved write operation.

---

## Backend Stack
Node.js + Express · PostgreSQL (Supabase / AWS) · JWT Auth · Connection Pool (pg)

---

*OCF — Preserving Oromo culture, one garment at a time. From Arba Minch to the world. 🇪🇹*
