# Glonni — Cashback-First Marketplace (Next.js)

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open in browser
open http://localhost:3000
```

## 📦 Production Build

```bash
npm run build
npm start
```

## 🌐 Deploy to Vercel

```bash
npx vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for auto-deploys.

## 📁 Project Structure

```
glonni/
├── public/
│   └── glonni-app.js          # Core app logic (11,829 lines)
├── src/
│   ├── app/
│   │   ├── globals.css        # All styles (686 lines)
│   │   ├── layout.js          # Root layout (HTML structure)
│   │   └── page.js            # Entry page
│   ├── components/
│   │   └── GlonniApp.js       # Client component (loads app script)
│   └── lib/                   # (for future refactoring)
├── .env.local                 # Supabase credentials
├── next.config.js             # Next.js configuration
└── package.json               # Dependencies
```

## 🏗️ Architecture

This is a **Phase 1 migration** from a single-file SPA to Next.js:

- **Current state**: All app logic runs client-side via `public/glonni-app.js`
- **Routing**: Hash-based (`/#shop`, `/#cart`, etc.) — managed by the app's `go()` function
- **Data**: Direct Supabase REST calls from the browser
- **Rendering**: DOM manipulation via innerHTML (original pattern preserved)

## 🔄 Incremental Migration Path (Future)

To convert individual pages to proper React components:

1. Pick a page (e.g., Shop)
2. Create `src/app/shop/page.js` as a React component
3. Move the rendering logic from `glonni-app.js` into the React component
4. Use `useState`/`useEffect` instead of DOM manipulation
5. Update the `go()` function to use Next.js `router.push()`
6. Repeat for each page

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |

## 📋 Features

- 🛍️ Multi-vendor marketplace
- 💰 Cashback on every purchase
- 🏪 Vendor dashboard & product management
- 📊 Admin panel with 8-section sidebar
- 📂 Category tree builder with cascading dropdowns
- 🤖 AI-powered product catalog (Gemini)
- 🧾 GST/Tax management with HSN codes
- 💸 Commission rules engine
- 🔗 Affiliate/referral system
- 📱 PWA support (install to home screen)
- 🔍 Fuzzy search with voice input
- 🏷️ Sponsored placements system
- 📦 Order management with invoice generation
- 💳 Wallet system with withdrawals
