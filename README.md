# Shop Nexa (Aventa Shop)

A full-featured e-commerce platform built with TanStack Start, React 19, Firebase, and Tailwind CSS v4.

## Features

- Multi-role authentication (buyer, seller, admin) via Firebase Auth
- Product catalog with categories, subcategories, search, and filters
- Seller dashboard with inventory management, orders, and settlements
- Admin panel with user management, banners, flash sales, and coupons
- Shopping cart with guest and authenticated modes (auto-merge on login)
- Wishlist with persistence
- Order tracking with status flow and notifications
- AI shopping assistant (configurable provider: local, OpenAI, or mock)
- Multi-language support (English / Bangla) with i18n
- OTP-based phone verification
- Responsive, mobile-first design

## Tech Stack

- **Framework:** TanStack Start (SSR) + TanStack Router
- **UI:** React 19, Tailwind CSS v4, Radix UI, shadcn/ui
- **Backend:** Firebase (Auth, Firestore, Storage)
- **State:** React Context + TanStack Query
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Notifications:** Sonner

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Firebase project (Auth, Firestore, Storage enabled)

### Installation

```bash
git clone https://github.com/selimsb645-max/shop-nexa-reimagined.git
cd shop-nexa-reimagined
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Key variables:
- Firebase config (API key, auth domain, project ID, storage bucket)
- AI assistant config (provider, model, API key)
- See `.env.example` for the full list

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Project Structure

```
src/
├── routes/              # File-based routes (TanStack Router)
│   ├── _authenticated/  # Protected routes (orders, admin, seller)
│   └── product.$slug/   # Dynamic product pages
├── context/            # React contexts (Auth, Cart, Wishlist)
├── services/
│   └── firebase/       # Firebase service layer
├── components/         # Reusable UI components
├── lib/                # Utilities, server functions, i18n
├── types/              # TypeScript type definitions
└── i18n/               # Internationalization
```

## License

MIT — see LICENSE file.
