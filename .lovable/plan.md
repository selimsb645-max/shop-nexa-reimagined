# Phase 1 — Foundation & Authentication

Keep the existing homepage design untouched. Add Firebase-powered auth, a scalable folder structure, and protected routes. Only the header's Login/Register/Account area gets wired to real auth.

## Folder architecture

```text
src/
  components/
    ui/                    (existing shadcn — untouched)
    layout/                Header, Footer (extracted from index.tsx, visuals unchanged)
    auth/                  LoginForm, RegisterForm, ForgotPasswordForm, GoogleButton, ProtectedRoute
    common/                LoadingSpinner, ErrorMessage, FormField
  context/                 AuthContext (user, loading, signIn/up/out, google, reset, updateProfile)
  hooks/                   useAuth, useRequireAuth
  services/
    firebase/              config.ts (reads VITE_FIREBASE_*), auth.ts, firestore.ts, storage.ts
  types/                   user.ts, auth.ts
  utils/                   validation.ts (zod schemas), errors.ts (Firebase error → readable msg)
  routes/                  (TanStack file routes — see below)
```

Existing `src/routes/index.tsx` stays visually identical; internally its Header/Footer JSX moves to `components/layout/*` and gets re-composed. No color/spacing/copy changes.

## Firebase integration

- Client SDK only (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage`).
- Config via `import.meta.env.VITE_FIREBASE_*` (API key, authDomain, projectId, storageBucket, messagingSenderId, appId).
- Ship `.env.example` with every required key.
- Persistence: `browserLocalPersistence` so sessions survive reloads.
- Firestore `users/{uid}` doc created on signup: `{ uid, email, displayName, photoURL, role: 'customer', createdAt }`. Used later by seller/admin panels.

Because the user explicitly asked for Firebase, we do NOT enable Lovable Cloud. Firebase keys are safe in the client bundle (protected by Firebase Security Rules, which the user configures in their Firebase console).

## Auth features

1. **Email/Password signup** → `createUserWithEmailAndPassword` → `sendEmailVerification` → create Firestore user doc → redirect to `/verify-email` notice.
2. **Email/Password login** → `signInWithEmailAndPassword`. Warn (non-blocking) if `emailVerified === false`.
3. **Google OAuth** → `signInWithPopup(GoogleAuthProvider)` → upsert Firestore user doc.
4. **Forgot password** → `sendPasswordResetEmail`, dedicated `/forgot-password` page + `/reset-password` info page.
5. **Auth state** → `onAuthStateChanged` inside `AuthProvider` at the root; global `loading` gate prevents protected-route flash.
6. **Sign out** → clears Firebase session; header updates reactively.

All forms use `react-hook-form` + `zod` with inline errors, disabled state during submit, `sonner` toasts for success/failure, and Firebase error codes mapped to readable messages (`auth/wrong-password` → "Incorrect email or password.", etc.).

## Routes (TanStack Start file-based)

Public:
- `/` — untouched homepage
- `/login`
- `/register`
- `/forgot-password`
- `/verify-email`

Protected (via `_authenticated` pathless layout that checks `AuthContext` client-side and redirects to `/login?redirect=<path>`):
- `/_authenticated/account` — profile page (display name edit, avatar upload to `avatars/{uid}` in Storage, email display, email-verified badge, link to orders, sign-out)
- `/_authenticated/orders` — placeholder route file that renders an empty-state ("No orders yet") — real order data is Phase 2. This is not fake content; it's the correct empty state for a new account.
- `/_authenticated/seller` — gated by `role === 'seller' | 'admin'`; renders "Seller access required" when not authorized.
- `/_authenticated/admin` — gated by `role === 'admin'`; same pattern.

`_authenticated/route.tsx` is `ssr: false` (Firebase auth lives in browser storage) and redirects unauthenticated users to `/login`.

## Homepage wiring (only change to existing UI)

In the extracted `Header`:
- When `user === null` → show existing "Login / Register" link → routes to `/login`.
- When `user` exists → same slot renders account name + dropdown (Account, Orders, Sign out). Uses existing shadcn `DropdownMenu`, matching current header typography and colors. No new visual style introduced.

Nothing else on the homepage changes.

## Validation, loading, errors

- Zod schemas in `utils/validation.ts` (email, password ≥ 8 with letter+number, displayName 2–50).
- Every async action shows a spinner state on its button and disables the form.
- Root `AuthProvider` renders a full-page spinner until the first `onAuthStateChanged` fires — prevents header flicker and protected-route flash.
- Firebase error mapper produces user-friendly copy; raw codes never surface.

## Deliverables checklist

- [ ] `.env.example` with all `VITE_FIREBASE_*` keys
- [ ] `firebase` package installed
- [ ] Services + context + hooks + types + utils scaffolded
- [ ] Header/Footer extracted, homepage visually identical
- [ ] `/login`, `/register`, `/forgot-password`, `/verify-email` pages
- [ ] `_authenticated` layout + `/account`, `/orders`, `/seller`, `/admin`
- [ ] Avatar upload to Firebase Storage
- [ ] Firestore user doc created on signup + Google sign-in
- [ ] No TODOs, no placeholder text, no dead code

## Note on env

You'll need to paste your Firebase web-app config into a `.env` file (I'll provide `.env.example`). Until real keys are set, auth calls fail with a clear "Firebase not configured" error — the UI still renders.
