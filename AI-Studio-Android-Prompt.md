You are an expert mobile engineer. Build a complete, production-quality **Android app** (Flutter, latest stable, Material 3, Dart null-safety) for a **Creator & Review Seeding Platform**. The app has TWO roles in one binary — **Creator** and **Admin** — gated by the signed-in user's profile role. Reuse an existing **Supabase** backend (Postgres + Auth + Storage). Generate the full project: folder tree, `pubspec.yaml`, all Dart files, reusable widgets, state management, routing, and a `README.md` with setup steps. If output is truncated, continue until every file is complete.

## Product summary
Brands seed Amazon products to micro-influencers ("creators"). A creator applies for a product, buys it on Amazon, submits a purchase screenshot, gets refunded, posts an Amazon review (with proof), then submits an Instagram/YouTube reel. An admin verifies each step and pays the creator. Currency is INR (₹), locale en_IN.

## Tech stack
- Flutter + Dart, Material 3, light theme.
- `supabase_flutter` for auth, Postgres queries, Storage, and **Realtime** subscriptions.
- State management: **Riverpod** (flutter_riverpod). Routing: **go_router** with auth/role redirects.
- `image_picker` + `file_picker` for uploads, `cached_network_image` for images, `intl` for currency/date formatting.
- No secrets hardcoded: read `SUPABASE_URL` and `SUPABASE_ANON_KEY` via `--dart-define` (document in README).

## Backend (existing Supabase — match this schema exactly)
**Table `profiles`**: `id uuid (=auth.users.id, PK)`, `display_name text`, `role text check in ('creator','admin')`, `created_at timestamptz`.
**Table `products`**: `id uuid PK`, `title text`, `description text`, `price numeric`, `amazon_url text`, `image_url text`, `is_active bool`, `review_payment numeric`, `reel_payment numeric`, `created_at`, `updated_at`.
**Table `orders`**: `id uuid PK`, `creator_id uuid → profiles.id`, `product_id uuid → products.id`, `creator_name text`, `contact_number text`, `instagram_id text`, `status text`, `product_title text` (snapshot), `product_price numeric` (snapshot), **`review_payment numeric` (snapshot)**, **`reel_payment numeric` (snapshot)**, `screenshot_url text`, `amazon_order_id text`, `upi_id text`, `review_text text`, `review_proof_url text`, `reel_url text`, `refund_amount numeric`, `payment_amount numeric`, `admin_notes text`, `created_at`, `updated_at`.
**Storage bucket `uploads`** with per-user paths: `screenshots/{userId}/{orderId}/...`, `review-proofs/{userId}/{orderId}/...`, `reels/{userId}/{orderId}/...`.

Also OUTPUT the SQL to create these tables, the status `check` constraint, a unique constraint on `(creator_id, product_id)`, a unique index on `amazon_order_id`, and **Row-Level Security policies** (see Security below). Include a Postgres trigger that auto-creates a `profiles` row on new `auth.users` signup.

## Status state machine (single source of truth)
`interested → screenshot_uploaded → screenshot_verified → refunded → review_submitted → review_verified → reel_submitted → completed`, with branches `reel_submitted → reel_rejected → reel_submitted` (resubmit) and any step `→ rejected`. Implement this as a Dart enum + a transition map. Every status write must be guarded with the expected current status (see Security #4).

Allowed transitions:
- **Creator:** apply → `interested`; upload purchase proof (sets `amazon_order_id`, `upi_id`, `screenshot_url`) → `screenshot_uploaded`; submit review (sets `review_text`, `review_proof_url`, only from `refunded`) → `review_submitted`; submit reel (sets `reel_url`, from `review_verified` OR `reel_rejected`) → `reel_submitted`.
- **Admin:** verify screenshot (`screenshot_uploaded`→`screenshot_verified`); mark refunded (`screenshot_verified`→`refunded`, sets `refund_amount`); verify review (`review_submitted`→`review_verified`); approve & pay (`reel_submitted`→`completed`, sets `payment_amount`); reject reel (`reel_submitted`→`reel_rejected`, sets `admin_notes`, clears `reel_url`); reject order (any active → `rejected`, sets `admin_notes`).

## Creator screens
1. **Auth** — sign in / sign up tabs. Sign-up collects name, email, password (min 8) and ALWAYS creates role `creator` (never let the client choose role). After auth, route by role.
2. **Products** — grid of active products (image, title, price ₹, "Earn up to ₹{review_payment+reel_payment}"). Tap → apply sheet collecting name (prefilled), contact number, Instagram handle. On submit: snapshot product title/price/review_payment/reel_payment into the order, create order as `interested`, then open `amazon_url` (use url_launcher, external). Block duplicate active applications for the same product with a friendly message.
3. **My Orders** — tabs All / Active / Pending Action / Completed. Each card shows a horizontal **status stepper timeline**, a status badge, order details, refund/payment amounts when present, and a contextual action button driven by status. NOTE: "Pending Action" MUST include `review_verified` (submit reel), `interested`, `refunded`, `screenshot_verified`, and `reel_rejected`.
4. **Upload purchase proof** — Amazon Order ID + UPI ID + screenshot image; validate formats; submit-disabled until all present.
5. **Submit review** — review text + proof screenshot.
6. **Submit reel** — reel link (Instagram/YouTube URL) OR uploaded video (max 100 MB); one is required.

## Admin screens
1. **Dashboard** — stat cards: Active Products, Total Orders, Pending Screenshots, Pending Reviews, **Total money paid out** (sum every `refund_amount` actually refunded + every `payment_amount` actually paid — do NOT gate this on `completed`). Recent-orders list. Sidebar/bottom-nav badges show pending counts and update in realtime.
2. **Product Manager** — list + add/edit form (title, description, price, amazon_url, image_url, active, review_payment, reel_payment). **Soft-delete** (set `is_active=false`); never hard-delete products that have orders.
3. **Pending Screenshots** — queue of `screenshot_uploaded`; show details + screenshot; Verify / Reject (reject requires reason).
4. **Pending Refunds** — queue of `screenshot_verified`; show UPI + Amazon order; Mark Refunded (enter amount, default = product price). *(This queue is intentionally added — make it a first-class section with its own badge.)*
5. **Review Proofs** — queue of `review_submitted`; show review text + proof; Verify / Reject.
6. **Reels** — queue of `reel_submitted`; open reel link or download uploaded video; Approve & Pay (amount defaults to the order's snapshotted review_payment+reel_payment) / Reject reel (reason, allows resubmit).
7. **All Orders** — searchable (creator name, Instagram) + status filter that includes EVERY status (including `review_verified`). Row tap opens an **Order Detail** screen with an activity-log timeline, media thumbnails (tap to zoom), review text, admin notes, and timestamps.

## Security & correctness — REQUIRED (these are hard rules)
1. **Never trust the client for authorization.** Role comes from the `profiles` table. Sign-up always writes `creator`; there is NO in-app admin-creation screen — admins are provisioned in the Supabase dashboard. Do not store the role in user-editable metadata.
2. **Assume and enforce RLS.** Output RLS so that: a creator can `select`/`insert`/`update` ONLY their own order rows and only non-privileged columns (never `status`, `payment_amount`, `refund_amount`, `admin_notes`); status transitions and payouts are performed by admins (role-checked) — prefer Postgres RPC functions for transitions over raw table updates. Products are admin-write, public-read-when-active. Storage policies restrict each user to their own folder.
3. **Sanitize/validate all input:** phone, UPI ID, Amazon Order ID formats; strip a leading `@` from Instagram handles before saving; trim text. Never render raw HTML.
4. **Guard every status update** with `.eq('status', expectedCurrentStatus)`; if 0 rows change, show "This order changed — refreshing" and reload (prevents double-pay / stale-view races).
5. **Pay from the order snapshot,** not the live product, so later product edits or deletions can't change or zero a creator's payout.
6. **Realtime:** subscribe to `orders` so admin queues/badges and creator order status update live; add pull-to-refresh as fallback.
7. External links opened safely; file uploads validated for type and size; show clear error states on every network call.

## Design
Material 3, light theme. Seed/primary violet `#7C3AED`; accents teal `#0891B2`, green `#10B981`, orange `#F59E0B`, red `#EF4444`; Inter font. Rounded cards with soft shadows, color-coded status badges, a stepper-style status timeline, SnackBars for toasts, shimmer/skeleton loaders, friendly empty states with an icon, confirm dialogs on destructive actions, and visible focus/`Semantics` labels for accessibility. Provide a bottom navigation bar for creators and a drawer/rail for admins.

## Deliverables
Complete, runnable Flutter project: organized `lib/` by feature (auth, products, orders, admin, shared), `models/`, a `SupabaseService`, Riverpod providers, go_router config with role redirects, reusable widgets (StatusBadge, StatusTimeline, UploadField, EmptyState, etc.), the SQL migration + RLS file, and a `README.md` covering Supabase setup, `--dart-define` keys, bucket creation, and `flutter run`. Write clean, commented, idiomatic code. Build the whole thing — don't stub.
