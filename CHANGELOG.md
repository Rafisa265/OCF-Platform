# OCF Platform — Changelog

## v2.1 (October 2026) — PostgreSQL Migration & Backend Integration
- **PostgreSQL Database Transition**: Migrated backend database driver from SQLite (`sql.js`) to production-ready PostgreSQL (`pg.Pool`) connecting to Supabase cloud database with SSL.
- **Async Route Architecture**: Converted all Express routes in `routes/index.js` and middleware in `middleware/auth.js` to async/await with parameterized queries and JSONB support.
- **32-Product Catalog Synchronization**: Imported the complete 32-product catalog across Men, Women, and Kids with rich metadata, images, colors, sizes, and age-ranges into PostgreSQL.
- **Review System Integration**: Imported 54 customer reviews with ratings and verified badges into PostgreSQL `reviews` table.
- **Automated Verification**: Added `npm run test:api` and `npm run sync:catalog` test and synchronization scripts.

## v2.0 (June 2026) — Major Enhancement

### New Pages
- Men's Fashion page (dedicated, with 7 category tiles + quick filters + tailoring strip)
- Women's Fashion page (7 categories + bridal section)
- Kids' Fashion page (4 categories + age guide + 6 age-group filter bands)
- Account page (My Orders, Track Order, Profile, Sign Out)

### New Product Catalog
- 32 products total (up from ~10): 11 Men, 12 Women, 9 Kids
- All products have: multi-image array, colors[], sizes[], ageGroup, ageRange, stock, material, care, description, region, badge, review_count, rating

### Complete Reviews System
- Reviews data for all 32 products (2–3 reviews each)
- Write-a-Review form with star picker in product modal
- Average rating calculation displayed in modal header

### Size Management
- Adults: XS, S, M, L, XL, XXL, XXXL with measurement tables
- Children: 2–3yr, 4–5yr, 6–7yr, 8–9yr, 10–12yr, 13–15yr with cm charts
- Age-group visual guide on Kids page
- Filter sidebar for both adult sizes and kids age-groups

### Color System
- 8 standard colors: Black, White, Red, Blue, Green, Yellow, Brown, and Oromo Cultural
- Named color swatches with tooltips
- Color picker in product modal with selected color name display
- Color filter swatches in all sidebars

### Product Modal Enhancements
- Hover-to-zoom on main image
- Front/Back/Side thumbnail slots
- Stock indicator with low-stock warning
- Back-in-stock notification button
- Social share / copy link button
- Downloadable product brochure button
- WhatsApp inquiry button
- Notify me button (out of stock products)

### Advanced Filtering
- Gender, Category, Size (adult + kids), Color, Price range, Collection type filters
- Quick filter pills on Men/Women/Kids/Shop All pages
- FAQ category filter tabs (Sizing, Shipping, Returns, Payment, Custom Orders, Products)
- Kids age-group filter buttons

### Content Sections Added
- 15 extended FAQs across 6 categories
- 5 Oromo regional collections with artisan info
- Customer testimonials section on About page
- Values section on About page
- Press mentions strip on About page
- Working hours table on Contact page
- Bridal consultation section on Women page
- Men's tailoring info strip
- Kids safety/sizing info strip
- Bundle comparison table
- Custom bundle CTA section

### New Functionality
- Order history (saves to localStorage on checkout completion)
- Promo code: WELCOME10, BUNDLE15, WEDDING20
- Account page: view orders, track, edit profile, sign out
- Social share (Web Share API with clipboard fallback)
- Order tracking widget (on Contact and Account pages)
- Add All Wishlist Items to Cart
- Clear Wishlist
- Wishlist item count in header
- Auth button routes to Account when logged in

### Downloads
- Full Catalog, Men's, Women's, Kids' catalogs, Size Guide, Product Brochures
- All generate as downloadable text files

## v1.0 (Initial Release)
- Basic e-commerce layout with Oromo cultural products
- Cart, wishlist, product modal
- Collections preview
CHANGELOG

echo "CHANGELOG written"