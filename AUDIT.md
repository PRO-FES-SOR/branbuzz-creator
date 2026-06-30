# Creator & Review Seeding Platform — Audit & Improvement Report

**Scope:** Vanilla JS + Vite front-end (`index.html`, `admin.html`, `creator-dashboard.html`, `admin-dashboard.html`, `setup.html`) on a Supabase backend. Findings are analysis + recommendations only — no code was rewritten.

**Workflow as built:** Creator applies (`interested`) → uploads purchase proof + UPI (`screenshot_uploaded`) → admin verifies (`screenshot_verified`) → admin refunds (`refunded`) → creator submits review (`review_submitted`) → admin verifies (`review_verified`) → creator submits reel (`reel_submitted`) → admin approves & pays (`completed`); reels can be rejected back to `reel_rejected` for resubmission.

The build is clean, the design system is coherent, and the state machine is well thought out. The serious problems are concentrated in **security** (the trust model) and a handful of **workflow/state bugs**. Below, ranked by severity.

---

## 🔴 Critical — Security & Trust Model

### S1. `setup.html` is public and mints admin accounts forever
`setup.html` calls `signUp(email, password, name, 'admin')` with no gate. Anyone who visits `/setup.html` can create a fully privileged admin, then read every creator's PII and approve payments. "One-time setup" is not enforced anywhere.
**Fix (no rewrite):** Delete `setup.html` from the deployed build after the first admin exists, or guard it: on load, query whether any `profiles.role = 'admin'` exists and, if so, hide the form. Long term, create admins manually in the Supabase dashboard.

### S2. Role is self-assignable at signup → privilege escalation
`signUp()` (`src/auth.js`) writes `role` into `auth` user-metadata and into `profiles` from the **client**. Creator signup hardcodes `'creator'`, but nothing stops a user from calling `supabase.auth.signUp({ ..., data:{ role:'admin' } })` directly from the console, or upserting their own `profiles` row with `role:'admin'`.
**Fix:** Roles must be assigned server-side. Drop `role` from client-writable paths; assign it via a DB trigger / admin-only process, and never trust `user_metadata.role` for authorization (use a `profiles` table that users cannot update).

### S3. All authorization is client-side — everything rides on Supabase RLS
`requireAuth()` only redirects in the browser; it is cosmetic. Every read/write goes straight from the browser to Supabase with the public anon key. If Row-Level Security on `profiles`, `orders`, `products`, and the `uploads` storage bucket is not strict, then **any logged-in user can**:
- `select *` from `orders` and read **every creator's** name, phone, Instagram, UPI ID, and Amazon order ID (a serious PII breach — the creator dashboard's `.eq('creator_id', currentUser.id)` filter is trivially removed by an attacker);
- `update` any order to `status:'completed'` with an arbitrary `payment_amount`, or to `refunded`, i.e. self-approve their own payouts;
- modify or delete `products`.
**Fix:** This is the single most important item. Verify/author RLS policies: creators may `select`/`update` **only their own** order rows and only specific columns (never `status`, `payment_amount`, `refund_amount`, `admin_notes`); status transitions and payouts should be admin-only (ideally behind Postgres RPC/Edge Functions with `auth.jwt()` role checks), not direct table writes. Lock the storage bucket to per-user folders.

### S4. Stored XSS throughout the admin dashboard → admin account takeover
Roughly 16 `innerHTML` sinks interpolate **unsanitized** user-controlled fields (`creator_name`, `instagram_id`, `contact_number`, `review_text`, `admin_notes`, `product.title`, `product.description`, image URLs) directly into markup — e.g. `admin/dashboard.js:163, 347, 484, 745`, `creator/dashboard.js:130, 300`. A creator who signs up with a name like `<img src=x onerror=...>` executes script **in the admin's session** when the admin opens the dashboard — letting the payload approve payments or exfiltrate data. Inline `onclick="...('${order.screenshot_url}')"` handlers are part of the same surface (a quote in a value breaks out of the attribute).
**Fix (incremental, no rewrite):** Escape all interpolated values with a small `esc()` helper (`&`, `<`, `>`, `"`, `'`) before injecting; set text via `textContent` where possible; replace inline `onclick` string-handlers with event delegation using `data-id` attributes. Add a Content-Security-Policy header as defense-in-depth.

### S5. `target="_blank"` / `window.open` without `noopener`
No `rel="noopener noreferrer"` anywhere (Amazon links, reel links at `admin/dashboard.js:557, 880`; `window.open` in `creator/dashboard.js`). The opened page can manipulate `window.opener` (reverse tab-nabbing).
**Fix:** Add `rel="noopener noreferrer"` to external anchors and pass `'noopener'` to `window.open`.

---

## 🟠 High — Functional Bugs & Workflow Gaps

### F1. Orders awaiting a reel vanish from the creator's "Pending Action" tab
`creator/dashboard.js:279` — the `pending` filter omits `review_verified`, which is precisely the state where the creator must act (submit the reel). Those orders show under "Active"/"All" but not "Pending Action," so creators miss the next step.
**Fix:** Add `'review_verified'` to the pending filter array.

### F2. `review_verified` missing from the admin All-Orders status filter
`admin-dashboard.html` `#order-status-filter` lists every status **except** `review_verified`, so an admin can't isolate orders that passed review but have no reel yet.
**Fix:** Add `<option value="review_verified">Review Verified</option>`.

### F3. Amazon redirect after applying is silently popup-blocked
`creator/dashboard.js:218` opens Amazon inside `setTimeout(... window.open ..., 1500)`. Because it's detached from the original click gesture, most browsers block it — the creator never reaches Amazon (only the toast fires). The per-order "Go to Amazon" button is the only reliable path.
**Fix:** Open Amazon synchronously inside the submit click, or rely on the explicit button and drop the timeout.

### F4. Payout reads the *live* product, not a snapshot — wrong/zero payments
`approveReel` (`admin/dashboard.js:573`) computes pay from `products.find(p => p.id === order.product_id)`. If the admin later edits the product's `reel_payment`/`review_payment`, the creator is paid the **new** figure, not what was advertised at apply time; if the product was **deleted**, `product` is `undefined` and the suggested total silently becomes **₹0**.
**Fix:** Snapshot `review_payment` and `reel_payment` onto the order row at apply time (as you already do for `product_title`/`product_price`) and read those at payout.

### F5. No status guard on updates → double-processing / stale-view races
Every `.update().eq('id', …)` lacks an expected-status guard (confirmed: zero `.eq('status', …)` in the codebase). Two admin tabs, a double-click, or a stale list can complete/pay the same order twice, or act on an order a creator just changed.
**Fix:** Add `.eq('status', <expectedCurrentStatus>)` to each transition update and treat a 0-row result as "already changed — refresh."

### F6. No duplicate-application / duplicate-order-ID protection
Nothing stops a creator from applying to the same product repeatedly, or reusing one Amazon order ID / screenshot across multiple orders to farm refunds and payouts.
**Fix:** Unique constraint on `(creator_id, product_id)` for active orders; uniqueness check on `amazon_order_id`; flag re-used screenshot URLs.

### F7. Deleting a product orphans its orders
`deleteProduct` (`admin/dashboard.js:308`) hard-deletes with no referential check. Orders survive (title/price are snapshotted) but payout math breaks (see F4) and "Go to Amazon" on older orders fails.
**Fix:** Soft-delete (set `is_active=false`) instead of `delete`, or block deletion when orders reference the product.

### F8. The "refund" step has no queue or badge — orders get stranded
Screenshots, reviews, and reels each have a sidebar section + pending badge, but `screenshot_verified` (awaiting refund) does not. The "Mark Refunded" action lives only inside the All-Orders table, so verified-but-not-refunded orders are easy to lose.
**Fix:** Add a "Pending Refunds" section/badge filtering `status === 'screenshot_verified'`, mirroring the other queues.

### F9. "Total Payouts" stat is inaccurate
`admin/dashboard.js:121` sums `payment_amount + refund_amount` only for `completed` orders. Refunds disbursed on orders that were refunded but later rejected or stalled (still real money out) are never counted, so the figure understates actual spend.
**Fix:** Track money-out by event (sum all `refund_amount` where refunded, plus all `payment_amount` where paid) rather than gating on `completed`.

### F10. Review/screenshot rejection is terminal, but reels allow resubmission
`rejectOrder` sets the terminal `rejected` for both screenshot and review failures, while `rejectReel` lets the creator retry. A creator who was already **refunded** and then has their review rejected keeps the free product with no recovery path, and the refund leaves the payout tracking.
**Fix:** Decide policy deliberately — either allow review resubmission (a `review_rejected` state mirroring `reel_rejected`), or document that post-refund rejection is intentional and reconcile the refund.

---

## 🟡 Medium — Design, UX & Accessibility

### D1. No visible keyboard focus on buttons, nav, tabs, or links
`main.css:131` sets `button { outline: none; }` globally, and the only `:focus` styling in the whole stylesheet is on form inputs (`main.css:309`). Keyboard and screen-reader users get **no** visible focus indicator on any button, sidebar link, or tab — a WCAG 2.4.7 failure.
**Fix:** Add a `:focus-visible` ring for `.btn, .nav-link, .sidebar-link, .section-tab, a` (e.g. `outline: 2px solid var(--color-accent-violet); outline-offset: 2px;`).

### D2. Icon-only controls lack accessible names; modals don't manage focus
Eye (👁), logout (🚪), and close (✕) buttons convey meaning by emoji + `title` only — no `aria-label`. `openModal` (`components/modal.js`) doesn't move focus into the dialog, trap it, or restore it on close, and isn't marked `role="dialog"`/`aria-modal`.
**Fix:** Add `aria-label`s; on open, focus the first field and restore focus to the trigger on close; trap Tab within the overlay.

### D3. No real-time or auto-refresh — counts go stale
Badges and lists only update after a manual reload or tab switch. An admin watching the queue won't see new submissions; a creator won't see an approval until they navigate.
**Fix:** Use Supabase Realtime subscriptions on `orders` (you already depend on supabase-js), or a lightweight poll, to refresh affected sections and badges.

### D4. Whole-dashboard re-render on every change
`updateDashboard()` (`admin/dashboard.js:116`) re-renders recent orders, the product table, **and** all three verification queues every time it's called — even for hidden sections. Fine at small scale, wasteful as data grows.
**Fix:** Render only the active section; refresh others lazily on navigation (the `refreshSection` hook already exists).

### D5. No pagination / virtualization
`loadOrders` pulls **all** orders into memory and the All-Orders table renders every row into the DOM. This degrades as volume grows.
**Fix:** Server-side pagination (`.range()`) + a page size, or virtualized rows; load "recent" for the dashboard and page the full table.

### D6. Broken-image handling is missing
Product, screenshot, and proof `<img>` tags have no `onerror` fallback, so a dead URL shows a broken-image glyph.
**Fix:** Add `onerror` to swap in the 📦 placeholder / a "proof unavailable" state.

### D7. One-click verify/approve with no confirmation
`verifyScreenshot` and `approveReview` act immediately on click (refund and payment correctly use modals). A misclick verifies a purchase.
**Fix:** Add a small confirm step or an undo window for these two.

### D8. Data-quality: inconsistent Instagram handle formatting
Creators may enter `@name` or `name`; the admin views render `@${instagram_id}`, producing `@@name` for some and `@name` for others (`admin/dashboard.js:348, 472, 750`).
**Fix:** Normalize on input (strip a leading `@` before saving) and store bare handles.

### D9. Pervasive inline styles
Cards and table cells carry large inline `style="…"` blocks, which bloat the JS, hinder theming, and block a strict CSP. Not a bug, but a maintainability and security tax.
**Fix:** Migrate repeated inline styles to the existing class system incrementally.

---

## 🟢 Low — Code Quality & Robustness

- **C1. Brittle profile creation.** `signUp` relies on a `setTimeout(500ms)` then a client upsert to `profiles`; if email confirmation is enabled there's no session and the immediate dashboard redirect bounces. Prefer a Postgres trigger on `auth.users` to create profiles. (`src/auth.js`)
- **C2. `updated_at` set client-side** on every update; use a DB default/trigger so it can't be forged or forgotten.
- **C3. Duplicated `sections` map** in `setupNavigation` and `switchToSection` (`creator/dashboard.js:40, 66`) — single source of truth.
- **C4. Magic status strings** are repeated across files (including a hand-maintained 10-element status array at `admin/dashboard.js:807`). Centralize a status list + allowed-transition map (extend the existing `statusConfig` in `statusBadge.js`) to drive both UI and guards (ties into F1/F2/F5).
- **C5. No input validation** on phone/UPI/Amazon-order-ID formats; add lightweight patterns to cut bad data and disputes.
- **C6. `src/assets/hero.png`** appears unused; prune dead assets.

---

## Recommended order of attack

1. **S1 + S2 + S3** — close the admin-creation hole, stop client-assigned roles, and lock down RLS. Nothing else matters until the trust model holds.
2. **S4** — escape output to kill stored XSS against admins.
3. **F4, F5, F6** — protect the money: snapshot payouts, guard transitions, prevent duplicate claims.
4. **F1, F2, F8** — close the workflow gaps so orders don't get stranded.
5. **D1, D2** — restore keyboard/focus accessibility.
6. Everything else as polish.

*Items 1–3 are the ones that can cause real financial or privacy harm; treat them as blockers before onboarding real creators.*
