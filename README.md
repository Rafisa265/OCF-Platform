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
npm run test:db    # Verify PostgreSQL connection
npm run test:api   # Verify API endpoints against PostgreSQL
npm start          # Start API server on port 5000
```
Then open `index.html` in your browser.

---

## Backend Stack
Node.js + Express · PostgreSQL (Supabase / AWS) · JWT Auth · Connection Pool (pg)

---

*OCF — Preserving Oromo culture, one garment at a time. From Arba Minch to the world. 🇪🇹*
