# Smart Digital Invoicing System — FBR Integration
## AI Agent Development Plan
> **Project:** Final Year Project (FYP) — SZABIST Islamabad, BSSE Spring 2026
> **Team:** Abdul Rafeh (PM/Backend), Fahim Saeed (Frontend), Muhammad Usman (DB/QA)
> **Supervisor:** Mr. Adeel Ahmed
> **Total Phases:** 12 | **Total Tasks:** 150+

---

## Agent Instructions

You are an AI development agent building a **Smart Digital Invoicing System** integrated with Pakistan's **Federal Board of Revenue (FBR) API**. This system is a web-based platform for SMEs (Small & Medium Enterprises) to create, manage, and submit digital invoices to FBR while handling tax calculation, payment tracking, reporting, and compliance.

### Core Principles for Every Task
- **Never break existing functionality** when adding new features
- **Scope all database queries** by `company_id` (multi-tenancy — no cross-company data leaks)
- **Validate all inputs** server-side regardless of frontend validation
- **Write tests** before or alongside implementation (not after)
- **Log all significant actions** through the AuditLogger service
- **Encrypt sensitive data** (FBR credentials, tokens) — never store plaintext secrets
- **Use soft deletes** everywhere — never hard delete invoice/payment/client records
- **Handle API errors gracefully** — especially FBR API which may be unreliable

### Tech Stack (Flexible — Do Not Hardcode Until Confirmed)
| Layer | Options |
|---|---|
| Frontend |React|
| Backend | Node.js (Express) |
| Database | PostgreSQL |
| Auth | JWT tokens |
| PDF | Puppeteer (Node) |
| Email | SMTP / Nodemailer |
| Queue | Bull (Node) |
| Hosting | Cloud VPS with HTTPS |

---

## System Overview

### 12 Modules
1. User Authentication & Authorization
2. Dashboard & Analytics
3. Client Management
4. Invoice Generation
5. Tax Calculation Engine
6. FBR API Integration
7. Payment Tracking
8. Reports & Export
9. Audit Trail
10. Compliance Validator
11. Multi-Company Support
12. System Settings, Notifications & Backup

### Key External Dependency
**FBR (Federal Board of Revenue) API** — Pakistan's tax authority API for digital invoice submission. All invoices above the legal threshold must be submitted to FBR and receive a USIN (Unique Sales Invoice Number).

---

---

# PHASE 1 — Project Setup & Architecture

**Goal:** Establish the complete project foundation before any feature development begins.
**Prerequisite:** None — this is the starting point.
**Definition of Done:** A running local server, initialized database, working Git repo, and passing CI pipeline with no code yet written for features.

---

## 1.1 — Version Control & Repository

### 1.1.1 — Initialize Git repository
- Create GitHub repository named `smart-invoicing-fbr`
- Initialize with `README.md`, `.gitignore` (tailored to chosen stack), and `LICENSE`
- Set default branch to `main`

### 1.1.2 — Define branching strategy
- `main` — production-ready only
- `develop` — integration branch
- `feature/<task-id>-<short-description>` — per-feature branches (e.g., `feature/2.1.1-user-registration`)
- `hotfix/<description>` — emergency production fixes
- Document this in `CONTRIBUTING.md`

### 1.1.3 — Configure branch protection
- Protect `main` and `develop` branches: require PR review before merge
- Require CI checks to pass before merge
- Disallow force push to protected branches

---

## 1.2 — Development Environment

### 1.2.1 — Local environment setup
- Install and verify runtime NodeJS
- Install package manager (npm)
- Install and configure PostgreSQL 
- Verify all services start cleanly

### 1.2.2 — Code quality tooling
- Configure linter appropriate to stack (ESLint)
- Configure formatter (Prettier for JS/CSS)
- Add `.editorconfig` for consistent indentation across editors
- Add pre-commit hook to run linter before every commit

### 1.2.3 — Environment variable management
- Create `.env.example` with all required keys (no real values)
- Create local `.env` file (gitignored)
- Required keys: `APP_ENV`, `APP_KEY`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `JWT_SECRET`, `FBR_API_URL`, `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`
- Document each key in `README.md`

### 1.2.4 — Postman workspace
- Create Postman workspace: "Smart Invoicing FBR"
- Create environment configs: `local`, `staging`, `production` each with `BASE_URL` and `AUTH_TOKEN` variables
- Share collection link in repository README

---

## 1.3 — Project Architecture & Structure

### 1.3.1 — Define folder structure
```
/
├── app/
│   ├── Controllers/
│   ├── Models/
│   ├── Services/          # Business logic (TaxService, FbrService, AuditLogger)
│   ├── Middlewares/
│   ├── Validators/
│   └── Helpers/
├── routes/
├── database/
│   ├── migrations/
│   └── seeders/
├── resources/
│   ├── views/
│   ├── js/
│   └── css/
├── tests/
│   ├── Unit/
│   └── Feature/
├── storage/
│   ├── logs/
│   ├── backups/
│   └── exports/
└── public/
```

### 1.3.2 — API versioning convention
- All API routes prefixed: `/api/v1/`
- Routes file organized by module (auth.routes, invoices.routes, etc.)
- Establish standard API response envelope:
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "errors": null,
  "meta": { "page": 1, "per_page": 20, "total": 150 }
}
```

### 1.3.3 — Error handling baseline
- Create global exception handler returning consistent JSON error responses
- Map HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Validation Error, 429 Rate Limited, 500 Server Error
- Log all 5xx errors to file with stack trace

---

## 1.4 — Database Architecture

### 1.4.1 — Design complete ER diagram
Design relationships covering all 12 modules. Core entities:
- `companies` ← has many → `users`, `clients`, `invoices`
- `users` ← belongs to → `companies` (via pivot for multi-company)
- `clients` ← has many → `invoices`
- `invoices` ← has many → `invoice_items`, `payments`, `audit_logs`
- `invoices` ← has one → `fbr_submissions`

### 1.4.2 — Database naming conventions
- Tables: `snake_case`, plural (e.g., `invoice_items`)
- Primary keys: `id` (auto-increment integer or UUID — decide and standardize)
- Foreign keys: `{table_singular}_id` (e.g., `invoice_id`)
- Timestamps: always include `created_at`, `updated_at`; soft delete tables add `deleted_at`
- Boolean columns: prefix with `is_` (e.g., `is_active`, `is_deleted`)
- JSON columns: suffix with `_data` (e.g., `fbr_response_data`)

### 1.4.3 — Write core migrations (in order)
Run in this sequence to satisfy foreign key constraints:
1. `create_companies_table`
2. `create_users_table`
3. `create_roles_table` + `create_permissions_table` + `create_role_user_table`
4. `create_clients_table`
5. `create_tax_rates_table`
6. `create_invoices_table`
7. `create_invoice_items_table`
8. `create_payments_table`
9. `create_fbr_submissions_table`
10. `create_audit_logs_table`
11. `create_notifications_table`

### 1.4.4 — Seed test data
- Seed 1 Super Admin user
- Seed 2 test companies
- Seed 5 test clients per company
- Seed 10 test invoices per company in various statuses
- Seed all tax rates (standard GST 17%, reduced rates)

---

## 1.5 — CI/CD Pipeline

### 1.5.1 — GitHub Actions workflow
Create `.github/workflows/ci.yml`:
- Trigger: on push to any branch, on PR to `develop` or `main`
- Steps: checkout → install dependencies → run linter → run tests → report coverage

### 1.5.2 — Staging deployment workflow
Create `.github/workflows/deploy-staging.yml`:
- Trigger: on merge to `develop`
- Steps: SSH to staging server → pull latest → run migrations → restart server

---

---

# PHASE 2 — User Authentication & Authorization

**Goal:** Secure, role-based authentication system. Every subsequent module depends on this.
**Prerequisite:** Phase 1 complete — database and project structure ready.
**Definition of Done:** A user can register, verify email, login, receive a token, access protected routes based on role, and logout. All auth events are logged.

---

## 2.1 — Database Setup

### 2.1.1 — Users table migration
```sql
users:
  id, company_id (FK, nullable for super admin), name, email (unique),
  password (hashed), role_id (FK), status (active/inactive/suspended),
  email_verified_at (nullable timestamp), last_login_at,
  created_at, updated_at, deleted_at
```

### 2.1.2 — Roles and permissions tables
```sql
roles: id, name (super_admin/company_admin/seller/accountant), guard_name, created_at
permissions: id, name, guard_name, created_at
role_has_permissions: role_id, permission_id
model_has_roles: role_id, model_type, model_id
```

### 2.1.3 — Auth tokens table
```sql
personal_access_tokens: id, tokenable_type, tokenable_id, name,
  token (hashed), abilities (JSON), last_used_at, expires_at,
  created_at, updated_at
```

### 2.1.4 — Password reset tokens table
```sql
password_reset_tokens: email, token (hashed), created_at
```

---

## 2.2 — Registration & Email Verification

### 2.2.1 — POST /api/v1/auth/register
**Request body:**
```json
{ "name": "string|required|max:100", "email": "string|required|email|unique", "password": "string|required|min:8|confirmed", "company_name": "string|required" }
```
**Logic:**
1. Validate all fields
2. Hash password with bcrypt (cost factor ≥ 12)
3. Create company record
4. Create user with `company_admin` role
5. Generate email verification token (UUID, store hashed, expires 24h)
6. Send verification email with tokenized link
7. Return 201 with user object (no token yet — require email verification first)
8. Log action via AuditLogger

### 2.2.2 — GET /api/v1/auth/verify-email/{token}
**Logic:**
1. Find token in DB (not expired, not already used)
2. Set `email_verified_at` = now
3. Delete verification token
4. Return 200 with success message

### 2.2.3 — POST /api/v1/auth/resend-verification
**Logic:**
1. Accept email
2. Check user exists and is unverified
3. Rate limit: max 3 resends per hour per email
4. Generate new token (invalidate old), send email

---

## 2.3 — Login & Token Management

### 2.3.1 — POST /api/v1/auth/login
**Request body:** `{ "email", "password" }`
**Logic:**
1. Find user by email
2. Check account is active and email is verified
3. Verify password with bcrypt — if fail: increment failed_attempts, lock after 5 failures for 15 minutes
4. If pass: issue access token (expires 2h) + refresh token (expires 30d)
5. Update `last_login_at`
6. Log login event with IP address and user agent
7. Return: `{ user, access_token, refresh_token, expires_in }`

### 2.3.2 — POST /api/v1/auth/refresh
**Logic:**
1. Validate refresh token (not expired, not revoked)
2. Issue new access token
3. Optionally rotate refresh token (recommended)
4. Return new `access_token`

### 2.3.3 — POST /api/v1/auth/logout
**Logic:**
1. Revoke current access token (delete from DB or add to blacklist)
2. Revoke refresh token
3. Log logout event
4. Return 200

---

## 2.4 — Password Reset

### 2.4.1 — POST /api/v1/auth/forgot-password
**Logic:**
1. Accept email
2. If user exists: generate reset token (UUID, hashed, expires 1h), send email
3. Always return 200 (do not confirm if email exists — prevents user enumeration)

### 2.4.2 — POST /api/v1/auth/reset-password
**Request body:** `{ "token", "email", "password", "password_confirmation" }`
**Logic:**
1. Verify token matches email and is not expired
2. Update password hash
3. Delete all reset tokens for this user
4. Revoke all existing auth tokens (force re-login everywhere)
5. Log password change event

---

## 2.5 — Role-Based Access Control (RBAC)

### 2.5.1 — Define roles and permissions matrix
| Permission | Super Admin | Company Admin | Seller | Accountant |
|---|---|---|---|---|
| Manage companies | ✓ | — | — | — |
| Manage users | ✓ | ✓ | — | — |
| Create/edit invoices | ✓ | ✓ | ✓ | — |
| Delete invoices | ✓ | ✓ | — | — |
| Submit to FBR | ✓ | ✓ | ✓ | — |
| Manage tax rates | ✓ | ✓ | — | — |
| View reports | ✓ | ✓ | own only | ✓ |
| View audit logs | ✓ | ✓ | — | — |
| System settings | ✓ | ✓ | — | — |
| Manage backups | ✓ | ✓ | — | — |

### 2.5.2 — Auth middleware
- Create `AuthMiddleware`: verify token validity, attach user to request context
- Create `RoleMiddleware`: check user has required role(s) for the route
- Create `PermissionMiddleware`: check user has specific permission
- Return 401 if unauthenticated; 403 if authenticated but unauthorized (with message)

### 2.5.3 — Apply middleware to all routes
- All `/api/v1/` routes except `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` must require auth

---

## 2.6 — Two-Factor Authentication (Optional / Phase 2 Extension)

### 2.6.1 — TOTP setup
- POST /api/v1/auth/2fa/enable — generate TOTP secret, return QR code URI
- POST /api/v1/auth/2fa/confirm — verify TOTP code to activate 2FA
- POST /api/v1/auth/2fa/disable — disable with password confirmation

### 2.6.2 — 2FA login flow
- If 2FA enabled: login returns `{ requires_2fa: true, temp_token }` instead of full auth token
- POST /api/v1/auth/2fa/verify — accept temp_token + TOTP code → return full auth token

---

## 2.7 — Frontend Auth UI

### 2.7.1 — Login page
- Fields: email, password (show/hide toggle)
- Client-side validation with inline error messages
- Show loading spinner on submit
- Display lockout message if account temporarily locked
- Link to forgot password

### 2.7.2 — Forgot/Reset password pages
- Forgot: email input → success message (generic, no user enumeration)
- Reset: password + confirm password → redirect to login on success

### 2.7.3 — Protected route guard
- Check for valid auth token on every page load
- Redirect unauthenticated users to `/login`
- Redirect authenticated users away from `/login` to `/dashboard`
- Store role in local context; hide/show UI elements based on role

---

---

# PHASE 3 — Dashboard & Analytics

**Goal:** Role-aware dashboard showing live business metrics and charts.
**Prerequisite:** Phase 2 (auth) complete.
**Definition of Done:** Authenticated users see an accurate, role-filtered dashboard with KPI cards, a revenue chart, and a recent invoices table.

---

## 3.1 — Dashboard Data APIs

### 3.1.1 — GET /api/v1/dashboard/summary
**Scope:** Filter by authenticated user's `company_id`; Seller role filters by `created_by = user_id`
**Returns:**
```json
{
  "total_invoices": 142,
  "draft_invoices": 8,
  "pending_invoices": 34,
  "paid_invoices": 89,
  "overdue_invoices": 11,
  "revenue_this_month": 450000.00,
  "revenue_this_year": 3850000.00,
  "outstanding_amount": 285000.00,
  "fbr_pending_submissions": 5
}
```

### 3.1.2 — GET /api/v1/dashboard/revenue-chart
**Query params:** `period=monthly&year=2024` OR `period=weekly&month=2024-11`
**Returns:** Array of `{ label, revenue, invoice_count }` for chart rendering

### 3.1.3 — GET /api/v1/dashboard/top-clients
**Returns:** Top 5 clients by total invoice value for current year with client name, total billed, total paid

### 3.1.4 — GET /api/v1/dashboard/recent-activity
**Returns:** Last 15 events (invoice created, payment received, FBR submission, etc.) sorted by timestamp

---

## 3.2 — Dashboard UI Components

### 3.2.1 — KPI metric cards row
Build reusable `MetricCard` component with: icon, label, value, optional trend indicator (↑↓ vs last month)
Cards: Total Revenue | Invoices This Month | Outstanding | Overdue | FBR Pending

### 3.2.2 — Revenue chart
- Bar chart: monthly revenue for last 12 months
- Overlay line: invoice count
- Tooltip on hover showing exact values
- Date range selector: This Year / Last 6 Months / Custom

### 3.2.3 — Recent invoices table widget
Columns: Invoice # | Client | Date | Amount | Status (color-coded badge) | Action (View)
Show last 10, link to full invoices page

### 3.2.4 — FBR status widget
Show count of: Submitted Today | Pending Submission | Rejected (needs attention)
Link to FBR submission log page

### 3.2.5 — Quick action buttons
"Create Invoice" | "Add Client" | "Submit to FBR" — prominent CTA buttons on dashboard

---

## 3.3 — Performance

### 3.3.1 — Query optimization
- Add composite indexes: `(company_id, created_at)`, `(company_id, status)`, `(company_id, due_date)`
- Cache dashboard summary for 5 minutes (invalidate on new invoice/payment)
- Use database aggregation (SUM, COUNT with GROUP BY) — not application-level loops

### 3.3.2 — Loading states
- Show skeleton loaders for each widget while data fetches
- Widgets load independently (parallel API calls) — do not block entire dashboard on slowest query

---

---

# PHASE 4 — Client Management

**Goal:** Full CRUD for customers/clients with NTN/CNIC support required for FBR compliance.
**Prerequisite:** Phase 2 complete.
**Definition of Done:** Admin/Seller can create, find, edit, and import clients. FBR-required fields (NTN/CNIC) are validated.

---

## 4.1 — Database

### 4.1.1 — Clients table migration
```sql
clients:
  id, company_id (FK, NOT NULL), name (NOT NULL), email, phone,
  address, city, province, postal_code, country (default: Pakistan),
  client_type (ENUM: individual, business, NOT NULL),
  ntn (nullable, format: 7-digit number),
  cnic (nullable, format: 13-digit number without dashes),
  strn (Sales Tax Registration Number, nullable),
  credit_limit (decimal, nullable),
  payment_terms_days (int, default: 30),
  notes (text, nullable),
  status (ENUM: active, inactive, default: active),
  created_by (FK → users.id),
  created_at, updated_at, deleted_at
```

### 4.1.2 — Unique constraint
`UNIQUE (company_id, ntn)` — when NTN provided, must be unique per company
`UNIQUE (company_id, cnic)` — when CNIC provided, must be unique per company

### 4.1.3 — Client contacts table (optional, for multiple contacts per business)
```sql
client_contacts:
  id, client_id (FK), name, email, phone, designation, is_primary, created_at
```

---

## 4.2 — Client APIs

### 4.2.1 — POST /api/v1/clients
**Validation rules:**
- `name`: required, max 200 chars
- `client_type`: required, enum (individual/business)
- `email`: optional but must be valid format if provided
- `ntn`: optional, exactly 7 digits if provided
- `cnic`: optional, exactly 13 digits if provided; required if `client_type = individual`
- At least one of `ntn` or `cnic` must be provided (FBR requirement for invoicing)

### 4.2.2 — GET /api/v1/clients
**Query params:** `search`, `type`, `status`, `page`, `per_page`
**Search:** Full-text search on name, email, NTN, CNIC
Return paginated list with `{ id, name, client_type, ntn, cnic, email, phone, status, total_invoices, outstanding_balance }`

### 4.2.3 — GET /api/v1/clients/{id}
Return full client with:
- Client details
- Invoice summary: total_invoiced, total_paid, outstanding
- Recent 5 invoices list

### 4.2.4 — PUT /api/v1/clients/{id}
Same validation as create. Scope: user must belong to same company as client.

### 4.2.5 — DELETE /api/v1/clients/{id}
Soft delete only. Block deletion if client has any non-cancelled invoices.
Return 409 Conflict with message if blocked.

---

## 4.3 — Bulk CSV Import

### 4.3.1 — GET /api/v1/clients/import-template
Return downloadable CSV with headers: `name, email, phone, client_type, ntn, cnic, address, city`

### 4.3.2 — POST /api/v1/clients/import
- Accept multipart CSV file (max 5MB, max 1000 rows)
- Parse and validate each row
- Return import report:
```json
{
  "total_rows": 50,
  "imported": 46,
  "failed": 4,
  "errors": [
    { "row": 3, "field": "ntn", "message": "NTN must be 7 digits" },
    { "row": 17, "field": "cnic", "message": "CNIC already exists" }
  ]
}
```
- Successful rows are committed; failed rows are skipped (not rolled back)

---

## 4.4 — Client UI

### 4.4.1 — Client list page
- Search bar (live search with debounce 300ms)
- Filter tabs: All | Active | Inactive
- Filter dropdown: Individual | Business
- Table with sortable columns: Name, Type, NTN/CNIC, Email, Invoices, Outstanding, Status
- Row actions: View | Edit | Delete (with confirmation modal)
- "Add Client" and "Import CSV" buttons in header

### 4.4.2 — Add/Edit client form
Fields: Name*, Type* (radio), NTN, CNIC, STRN, Email, Phone, Address, City, Province, Payment Terms, Notes
Inline validation feedback per field
Show "NTN required for business clients submitting invoices to FBR" hint

### 4.4.3 — Client detail page
- Header: client name, type badge, status badge
- Info section: all contact details
- Financial summary cards: Total Invoiced | Total Paid | Outstanding
- Invoice history table with status and amount
- "Create Invoice for this Client" quick action button

---

---

# PHASE 5 — Invoice Generation

**Goal:** Full invoice lifecycle management with PDF export and QR code generation.
**Prerequisite:** Phases 2, 4 complete.
**Definition of Done:** User can create an invoice, add line items, see tax calculated, generate PDF with QR code, and manage invoice status.

---

## 5.1 — Database

### 5.1.1 — Invoices table migration
```sql
invoices:
  id, invoice_number (UNIQUE per company), company_id (FK), client_id (FK),
  seller_id (FK → users.id, the user who created it),
  issue_date (date, NOT NULL), due_date (date, NOT NULL),
  status (ENUM: draft, sent, partially_paid, paid, overdue, cancelled, NOT NULL, default: draft),
  currency (default: PKR),
  subtotal (decimal 15,2, NOT NULL),
  discount_type (ENUM: percentage, fixed, nullable),
  discount_value (decimal 15,2, default: 0),
  discount_amount (decimal 15,2, default: 0),
  tax_amount (decimal 15,2, default: 0),
  total (decimal 15,2, NOT NULL),
  amount_paid (decimal 15,2, default: 0),
  balance_due (GENERATED column: total - amount_paid),
  notes (text, nullable),
  terms (text, nullable),
  fbr_status (ENUM: not_submitted, pending, submitted, accepted, rejected, default: not_submitted),
  fbr_usin (FBR's Unique Sales Invoice Number, nullable),
  fbr_pos_id (nullable),
  qr_code_data (text, nullable),
  qr_code_path (file path, nullable),
  pdf_path (nullable),
  sent_at (timestamp, nullable),
  created_at, updated_at, deleted_at
```

### 5.1.2 — Invoice items table migration
```sql
invoice_items:
  id, invoice_id (FK, NOT NULL), sort_order (int, default: 0),
  description (NOT NULL, max 500),
  quantity (decimal 10,3, NOT NULL),
  unit (varchar 50, nullable, e.g., "kg", "piece", "hour"),
  unit_price (decimal 15,2, NOT NULL),
  tax_rate_id (FK → tax_rates.id, nullable),
  tax_rate_percentage (decimal 5,2, default: 0, stored at time of invoice creation),
  tax_amount (decimal 15,2, default: 0),
  line_total (decimal 15,2, NOT NULL),
  created_at, updated_at
```
> **Note:** Store `tax_rate_percentage` directly on the item (not just FK) so historical invoices remain accurate if tax rate changes later.

### 5.1.3 — Invoice number sequences table
```sql
invoice_number_sequences:
  id, company_id (FK, UNIQUE), prefix (varchar 20, default: "INV"),
  next_number (int, NOT NULL, default: 1),
  padding (int, default: 4, for zero-padding: 0001),
  format (varchar 50, default: "{prefix}-{year}-{number}")
```

---

## 5.2 — Invoice APIs

### 5.2.1 — POST /api/v1/invoices
**Request body:**
```json
{
  "client_id": 5,
  "issue_date": "2024-11-15",
  "due_date": "2024-12-15",
  "currency": "PKR",
  "items": [
    { "description": "Web Design", "quantity": 1, "unit_price": 50000, "tax_rate_id": 2 }
  ],
  "discount_type": "percentage",
  "discount_value": 5,
  "notes": "Payment due within 30 days",
  "terms": "Standard terms apply"
}
```
**Logic:**
1. Validate all fields
2. Verify `client_id` belongs to user's company
3. **Atomically** assign invoice number (use DB transaction + SELECT FOR UPDATE on sequences table)
4. Calculate line totals, tax per line, discount, grand total using TaxCalculationService
5. Save invoice + items
6. Generate QR code (async acceptable)
7. Log via AuditLogger
8. Return full invoice object

### 5.2.2 — GET /api/v1/invoices
**Query params:** `status`, `client_id`, `seller_id`, `date_from`, `date_to`, `amount_min`, `amount_max`, `search` (invoice number / client name), `page`, `per_page`, `sort_by`, `sort_dir`
Return paginated list with summary fields (no line items in list view)

### 5.2.3 — GET /api/v1/invoices/{id}
Return full invoice including `items[]`, `payments[]`, `fbr_submission` object

### 5.2.4 — PUT /api/v1/invoices/{id}
**Restriction:** Only editable when `status = draft`
If invoice has been submitted to FBR (`fbr_status != not_submitted`), block all edits and return 409 with message "Invoice has been submitted to FBR and cannot be modified."

### 5.2.5 — DELETE /api/v1/invoices/{id}
Soft delete. Only allow when `status = draft`. Block if any payments recorded.

### 5.2.6 — POST /api/v1/invoices/{id}/duplicate
Clone invoice as new draft (new invoice number, today's date, reset all FBR/payment fields). Return new invoice.

### 5.2.7 — POST /api/v1/invoices/{id}/send
Mark `status = sent`, record `sent_at = now`. Optionally trigger email to client.

### 5.2.8 — POST /api/v1/invoices/{id}/cancel
Set `status = cancelled`. Only allowed if no payments made. Log reason.

---

## 5.3 — Invoice Numbering

### 5.3.1 — Auto-increment (race-condition safe)
```
BEGIN TRANSACTION
  SELECT next_number FROM invoice_number_sequences WHERE company_id = ? FOR UPDATE
  SET @num = next_number
  UPDATE invoice_number_sequences SET next_number = next_number + 1 WHERE company_id = ?
COMMIT

format_number(prefix, year, @num, padding)
→ "INV-2024-0047"
```

### 5.3.2 — Custom prefix per company
Configurable in Company Settings. Changing prefix does not affect existing invoice numbers.

---

## 5.4 — QR Code Generation

### 5.4.1 — QR code data format
```json
{
  "v": "1",
  "inv": "INV-2024-0047",
  "seller_ntn": "1234567",
  "buyer_ntn": "7654321",
  "date": "2024-11-15",
  "total": "59000.00",
  "tax": "9000.00",
  "fbr_usin": "XXXX-XXXX"
}
```

### 5.4.2 — QR generation process
- Generate QR code as SVG or PNG upon invoice creation
- Store at `storage/qrcodes/{company_id}/{invoice_id}.png`
- Store URL path in `invoices.qr_code_path`
- If FBR USIN not yet available: generate QR without it, regenerate after FBR submission

---

## 5.5 — PDF Generation

### 5.5.1 — Invoice PDF template design
Required elements:
- Company logo, name, address, NTN, phone
- "TAX INVOICE" heading (required for FBR compliance)
- Invoice number, issue date, due date
- Client name, address, NTN/CNIC
- Line items table: Description | Qty | Unit | Unit Price | Tax % | Tax Amount | Line Total
- Subtotal, Discount, Tax breakdown (each rate), Grand Total
- QR code (bottom right)
- FBR USIN (if submitted)
- Payment terms and notes footer

### 5.5.2 — GET /api/v1/invoices/{id}/pdf
- Generate PDF on first request, cache to disk
- Invalidate cache on invoice update
- Return binary PDF with `Content-Disposition: attachment; filename="INV-2024-0047.pdf"`
- Regenerate if invoice was updated since last PDF generation

---

## 5.6 — Invoice UI

### 5.6.1 — Invoice list page
- Status filter tabs: All | Draft | Sent | Paid | Overdue | FBR Submitted | Cancelled
- Search by invoice number or client name
- Table: Invoice # | Client | Issue Date | Due Date | Total | Paid | Status | FBR Status | Actions
- Bulk select: bulk download PDF, bulk submit to FBR
- "New Invoice" button

### 5.6.2 — Invoice creation page
- Client selector (searchable dropdown with type-ahead; shows NTN/CNIC next to name)
- Date pickers: Issue Date, Due Date
- Line items section (dynamic rows):
  - Add Item button
  - Each row: Description | Qty | Unit | Unit Price | Tax Rate (dropdown) | Line Total (calculated)
  - Drag-to-reorder rows
  - Delete row button
- Discount section: type toggle (% or fixed) + value input
- Totals panel (sticky/right sidebar): Subtotal | Discount | Tax breakdown | Total
- Notes and Terms text areas
- Actions: Save as Draft | Save and Send

### 5.6.3 — Invoice detail/view page
- Full invoice preview (mimics PDF layout)
- Status timeline: Created → Sent → Payment Received → Paid / Overdue
- FBR submission status badge
- Action buttons (role-dependent): Edit | Download PDF | Send to Client | Submit to FBR | Record Payment | Cancel
- Payments tab: payment history table
- Activity tab: audit log for this invoice

---

---

# PHASE 6 — Tax Calculation Engine

**Goal:** Flexible, accurate tax handling supporting FBR-compliant GST and Sales Tax.
**Prerequisite:** Phase 5 (invoices DB in place).
**Definition of Done:** Tax rates are configurable per company, correctly applied per line item, and clearly broken down in invoice totals and PDFs.

---

## 6.1 — Database

### 6.1.1 — Tax rates table
```sql
tax_rates:
  id, company_id (FK), name (e.g., "Standard GST 17%", "Reduced GST 5%"),
  rate_percentage (decimal 5,2, NOT NULL),
  tax_type (ENUM: GST, SalesTax, WHT, Exempt, ZeroRated),
  description (varchar 255, nullable),
  is_default (boolean, default: false),
  is_active (boolean, default: true),
  created_at, updated_at
```
> Only one tax rate per company can have `is_default = true` (enforce in application logic).

### 6.1.2 — Tax exemptions table
```sql
tax_exemptions:
  id, company_id (FK), client_id (FK → clients.id),
  exemption_type (ENUM: full, partial),
  certificate_number (varchar 100),
  valid_from (date), valid_until (date, nullable),
  notes (text),
  created_at, updated_at
```

---

## 6.2 — TaxCalculationService

### 6.2.1 — Core service interface
```
TaxCalculationService::calculate(items[], discount, client_id, company_id) → TaxResult

TaxResult {
  items: [{ ...item, tax_rate_pct, tax_amount, line_total }],
  subtotal: decimal,
  discount_amount: decimal,
  tax_breakdown: [{ name, rate, taxable_amount, tax_amount }],
  total_tax: decimal,
  grand_total: decimal
}
```

### 6.2.2 — Tax calculation rules
1. Check if client has active exemption → override rates to 0%
2. For each item: `tax_amount = (unit_price × quantity) × (tax_rate / 100)`
3. `line_total = (unit_price × quantity) + tax_amount`
4. Apply discount to subtotal (before tax) for percentage discount
5. Aggregate tax by rate for breakdown display
6. All amounts rounded to 2 decimal places (banker's rounding)

### 6.2.3 — Tax-inclusive pricing support
If `price_includes_tax = true`:
- `net_price = listed_price / (1 + tax_rate/100)`
- `tax_amount = listed_price - net_price`

### 6.2.4 — Multiple tax rates on one invoice
Support line items with different tax rates. Display each rate as a separate row in tax breakdown:
```
Subtotal:          PKR 100,000
GST 17% on 80,000: PKR  13,600
WHT 3% on 20,000:  PKR     600
Total Tax:         PKR  14,200
Grand Total:       PKR 114,200
```

---

## 6.3 — Tax APIs

### 6.3.1 — CRUD for tax rates
- GET /api/v1/tax-rates — list company's tax rates
- POST /api/v1/tax-rates — create new rate
- PUT /api/v1/tax-rates/{id} — update (validation: cannot change rate on a rate used in existing invoices — create new rate instead)
- DELETE /api/v1/tax-rates/{id} — soft delete (block if used in invoices)

### 6.3.2 — POST /api/v1/tax-rates/preview
**Purpose:** Real-time tax calculation for invoice creation page
Accept partial invoice data (items + discount + client_id) → return TaxResult
Called on every keypress change in invoice form (debounced 400ms)

---

---

# PHASE 7 — FBR API Integration

**Goal:** Fully automated, reliable submission of invoices to Pakistan's FBR digital invoicing system.
**Prerequisite:** Phases 5, 6 complete.
**Definition of Done:** An invoice can be submitted to FBR, receive a USIN, and its status is reflected in the system. Failures are queued for retry and clearly reported to the user.

---

## 7.1 — FBR Configuration

### 7.1.1 — FBR config table
```sql
fbr_configs:
  id, company_id (FK, UNIQUE), pos_id (varchar 50, NOT NULL),
  username (varchar 100, NOT NULL),
  password_encrypted (text, NOT NULL),
  api_token_encrypted (text, nullable),
  token_expires_at (timestamp, nullable),
  environment (ENUM: sandbox, production, default: sandbox),
  is_active (boolean, default: true),
  last_synced_at (timestamp),
  created_at, updated_at
```

### 7.1.2 — FBR submissions log table
```sql
fbr_submissions:
  id, invoice_id (FK, NOT NULL), company_id (FK),
  attempt_number (int, default: 1),
  submitted_at (timestamp),
  status (ENUM: pending, success, rejected, error),
  fbr_usin (varchar 100, nullable),
  request_payload (JSON),
  response_raw (JSON),
  error_code (varchar 50, nullable),
  error_message (text, nullable),
  next_retry_at (timestamp, nullable),
  created_at
```

---

## 7.2 — FBR Token Management

### 7.2.1 — POST to FBR auth endpoint
```
POST {FBR_BASE_URL}/api/Live/FBRToken
Body: { "Username": "...", "Password": "...", "POSID": "..." }
Response: { "Token": "Bearer xxxxx", "ExpiresAt": "..." }
```

### 7.2.2 — Token lifecycle
- On first FBR operation: check if token exists and not expired → if not, request new token
- Store token encrypted in `fbr_configs.api_token_encrypted`
- Auto-refresh if token expires within 5 minutes
- On 401 response from FBR: immediately refresh token and retry once

### 7.2.3 — FbrTokenService
```
getValidToken(company_id) → decrypted_token
  if no token OR expires_at < now + 5min:
    fetchNewToken(company_id)
  return decrypt(api_token_encrypted)
```

---

## 7.3 — Invoice Submission

### 7.3.1 — FBR invoice payload mapping
Map internal invoice to FBR API schema:
```json
{
  "InvoiceNumber": "INV-2024-0047",
  "POSID": "xxxxx",
  "USIN": "",
  "DateTime": "15/11/2024 10:30:00",
  "BuyerNTN": "7654321",
  "BuyerCNIC": "3520112345671",
  "BuyerName": "Ahmad Traders",
  "BuyerPhoneNumber": "03001234567",
  "TotalSaleValue": 100000.00,
  "TotalQuantity": 5,
  "TotalBillAmount": 117000.00,
  "TaxCharged": 17000.00,
  "Discount": 0,
  "FurtherTax": 0,
  "PaymentMode": 1,
  "Items": [
    { "ItemCode": "001", "ItemName": "Web Design", "Quantity": 1, "PCTCode": "...", "TaxRate": 17, "SaleValue": 100000, "TaxCharged": 17000, "TotalAmount": 117000 }
  ]
}
```
> Validate all required FBR fields are present BEFORE calling the API (use ComplianceValidatorService from Phase 10)

### 7.3.2 — POST /api/v1/invoices/{id}/submit-fbr
**Logic:**
1. Run ComplianceValidatorService — block if mandatory rules fail
2. Get valid FBR token
3. Build FBR payload
4. POST to FBR API with 30-second timeout
5. On success (200 + USIN returned):
   - Update `invoices.fbr_status = accepted`, `invoices.fbr_usin = USIN`
   - Log to `fbr_submissions` with full request/response
   - Regenerate QR code with USIN included
6. On FBR API rejection (error code returned):
   - Log to `fbr_submissions` with error
   - Update `invoices.fbr_status = rejected`
   - Map FBR error code to human-readable message (see 7.4.2)
7. On network/timeout error:
   - Log attempt, set `invoices.fbr_status = pending`
   - Queue for retry (see 7.3.3)

### 7.3.3 — Retry queue for failed submissions
- On failure: create job in queue with `invoice_id`, `attempt_number`, `next_retry_at`
- Retry schedule: +5min, +15min, +1h, +6h, +24h (max 5 attempts)
- After 5 failed attempts: mark as `error`, alert admin via notification
- Do not retry rejected invoices (data error — needs manual fix)

---

## 7.4 — CSV Bulk Upload

### 7.4.1 — GET /api/v1/fbr/csv-template
Return FBR-format CSV template with all required column headers

### 7.4.2 — POST /api/v1/fbr/bulk-submit-csv
- Accept CSV file
- Parse and validate each row against FBR schema
- Submit valid rows to FBR API (batch or sequential based on FBR API limits)
- Return results per row: `{ row, invoice_number, status, fbr_usin, error }`

### 7.4.3 — FBR error code mapping table
Maintain a lookup of FBR error codes → human-readable messages:
```
"1001" → "Seller NTN not registered with FBR"
"1002" → "Buyer CNIC format invalid"
"1003" → "Invoice already submitted with this number"
"1004" → "Tax amount does not match calculated value"
...
```

---

## 7.5 — FBR Status Sync

### 7.5.1 — Scheduled job: FBR status poll
- Run every 30 minutes
- Query FBR API for status of all invoices with `fbr_status = pending`
- Update local status based on FBR response
- Notify admin of any status changes (especially rejections)

### 7.5.2 — FBR submission log page (UI)
Table: Invoice # | Submitted At | Attempt | FBR USIN | Status | Error Message | Actions (Retry / View Invoice)
Filter by: status, date range
Show total counts: Accepted | Pending | Rejected | Error

---

---

# PHASE 8 — Payment Tracking

**Goal:** Record, track, and report payments against invoices with aging analysis.
**Prerequisite:** Phase 5 complete.
**Definition of Done:** Payments can be recorded (full or partial), invoice balances are accurately computed, and overdue invoices are automatically flagged.

---

## 8.1 — Database

### 8.1.1 — Payments table
```sql
payments:
  id, invoice_id (FK, NOT NULL), company_id (FK),
  amount_paid (decimal 15,2, NOT NULL, > 0),
  payment_date (date, NOT NULL),
  payment_method_id (FK → payment_methods.id),
  reference_number (varchar 100, nullable, e.g., cheque #, bank transfer ref),
  notes (text, nullable),
  recorded_by (FK → users.id),
  created_at, updated_at
```

### 8.1.2 — Payment methods table
```sql
payment_methods:
  id, company_id (FK), name (e.g., "Cash", "Bank Transfer", "Cheque", "Online Payment"),
  is_active (boolean, default: true), sort_order (int),
  created_at, updated_at
```

### 8.1.3 — Invoice balance tracking
After every payment insert/delete, recalculate `invoices.amount_paid = SUM(payments.amount_paid WHERE invoice_id = ?)`
Update `invoices.status`:
- `amount_paid = 0` → `sent` or `overdue`
- `0 < amount_paid < total` → `partially_paid`
- `amount_paid >= total` → `paid`

---

## 8.2 — Payment APIs

### 8.2.1 — POST /api/v1/invoices/{id}/payments
**Validation:**
- `amount_paid > 0`
- `amount_paid <= invoices.balance_due` (prevent overpayment, or flag with warning)
- `payment_date <= today`
**Logic:**
1. Insert payment record
2. Recalculate invoice `amount_paid` and update `status`
3. Log via AuditLogger
4. Send payment received notification (to admin/seller)

### 8.2.2 — GET /api/v1/invoices/{id}/payments
Return all payments for invoice, ordered by `payment_date DESC`, with running balance

### 8.2.3 — DELETE /api/v1/invoices/{id}/payments/{payment_id}
Soft delete. Recalculate invoice totals after deletion. Log via AuditLogger.

---

## 8.3 — Overdue Processing

### 8.3.1 — Scheduled job: mark overdue invoices
- Run daily at 00:01 AM
- Find all invoices where `due_date < today AND status IN (sent, partially_paid)`
- Update `status = overdue`
- Create in-app notification for each overdue invoice

### 8.3.2 — Payment reminder emails
Configurable triggers per company (in Settings):
- X days before due date (default: 3)
- On the due date
- X days after due date (default: 7, 14)
Email includes: invoice number, amount due, due date, payment link (or bank details)

### 8.3.3 — Accounts receivable aging report
Group outstanding invoices into buckets by days overdue:
- Current (not yet due)
- 1-30 days overdue
- 31-60 days overdue
- 61-90 days overdue
- 90+ days overdue
Show per client and totals

---

---

# PHASE 9 — Reports & Export

**Goal:** Generate actionable financial reports with PDF and Excel export.
**Prerequisite:** Phases 5, 6, 8 complete.
**Definition of Done:** Admin can generate any report type, apply filters, view results in-browser, and export to PDF or Excel.

---

## 9.1 — Report Types

### 9.1.1 — Sales Report
Filters: date range, client, seller, status
Columns: Invoice # | Client | Date | Subtotal | Discount | Tax | Total | Status
Totals row: sum of each numeric column
Summary: Count of invoices, Average invoice value

### 9.1.2 — Tax Report
Filters: date range, tax type
Groups: by tax rate name
Columns: Tax Name | Rate | Number of Invoices | Taxable Amount | Tax Collected
Required for FBR compliance reporting

### 9.1.3 — Payment Report
Filters: date range, payment method, client
Columns: Payment Date | Invoice # | Client | Method | Reference | Amount
Summary: Total received, outstanding total

### 9.1.4 — FBR Compliance Report
Shows: Submitted invoices count, Accepted, Rejected, Pending, Not Submitted
Breakdown by month
List of rejected invoices with error reasons

### 9.1.5 — Client Ledger Report
Per-client view: all invoices and payments in chronological order with running balance
Used by accounting firms for client reconciliation

### 9.1.6 — Aging Report
(As described in Phase 8.3.3 — also exposed as a report here)

---

## 9.2 — Report APIs

### 9.2.1 — GET /api/v1/reports/{type}
`type` = sales | tax | payments | fbr-compliance | client-ledger | aging
Query params: `date_from`, `date_to`, `client_id`, `seller_id`, `status`, `page`, `per_page`
Return paginated JSON data for in-browser table rendering

### 9.2.2 — GET /api/v1/reports/{type}/export
Query params: same as above + `format=pdf|excel`
For large datasets (>1000 rows): generate async, return `{ job_id }` — poll for completion
For small datasets: return file directly

---

## 9.3 — Export Engines

### 9.3.1 — PDF report export
- Header: Company name/logo, Report title, Date range, Generated at
- Data table with proper column alignment and alternating row shading
- Totals/summary section
- Footer: Page X of Y

### 9.3.2 — Excel export
- Sheet 1: Report data with formatted cells (currency, dates)
- Sheet 2: Summary totals
- Auto-size columns
- Bold headers with background color
- Freeze top row

### 9.3.3 — FBR CSV export
Export invoices in exact FBR-required CSV column order for manual upload to FBR portal (fallback when API fails)

---

---

# PHASE 10 — Audit Trail & Compliance Validator

**Goal:** Immutable record of all system actions and automated FBR compliance checking.
**Prerequisite:** All modules.
**Definition of Done:** Every significant action is logged immutably. Every invoice is automatically checked against FBR rules before submission.

---

## 10.1 — Audit Log System

### 10.1.1 — Audit logs table
```sql
audit_logs:
  id, user_id (FK, nullable for system events), company_id (FK),
  action (varchar 100, e.g., "invoice.created", "payment.recorded", "user.login"),
  entity_type (varchar 50, e.g., "Invoice", "Client", "User"),
  entity_id (int, nullable),
  old_values (JSON, nullable — snapshot before change),
  new_values (JSON, nullable — snapshot after change),
  ip_address (varchar 45),
  user_agent (text, nullable),
  extra_data (JSON, nullable — any additional context),
  created_at (NOT NULL)
```
> **No `updated_at` or `deleted_at` on this table** — audit logs must be immutable.

### 10.1.2 — AuditLogger service
```
AuditLogger::log(action, entity_type, entity_id, old_values, new_values, extra_data)
  - Automatically captures: user_id from auth context, company_id, ip_address, user_agent
  - Writes to audit_logs table
  - Non-blocking (queue async if high volume)
```

### 10.1.3 — Events to log (minimum)
| Module | Events |
|---|---|
| Auth | login.success, login.failed, logout, password.reset, email.verified, role.changed |
| Invoices | invoice.created, invoice.updated, invoice.deleted, invoice.sent, invoice.cancelled, invoice.pdf_downloaded |
| Payments | payment.recorded, payment.deleted |
| FBR | fbr.submission_attempted, fbr.submission_success, fbr.submission_rejected, fbr.token_refreshed |
| Clients | client.created, client.updated, client.deleted |
| Settings | settings.updated, user.created, user.deactivated |
| Backup | backup.created, backup.downloaded |

---

## 10.2 — FBR Compliance Validator

### 10.2.1 — ComplianceValidatorService
```
ComplianceValidatorService::validate(invoice_id) → ValidationResult

ValidationResult {
  passed: boolean,
  rules: [
    { rule_id, name, severity, passed, message, field }
  ]
}
```

### 10.2.2 — Validation rules
| Rule ID | Rule | Severity | Field |
|---|---|---|---|
| FBR-001 | Seller NTN must be present in company profile | BLOCK | company.ntn |
| FBR-002 | Buyer NTN or CNIC must be present on client | BLOCK | client.ntn/cnic |
| FBR-003 | Invoice total must be > 0 | BLOCK | invoice.total |
| FBR-004 | At least one line item required | BLOCK | invoice.items |
| FBR-005 | Each item must have description | BLOCK | item.description |
| FBR-006 | Issue date must not be in the future | BLOCK | invoice.issue_date |
| FBR-007 | Tax amount must match calculated tax | BLOCK | invoice.tax_amount |
| FBR-008 | Invoice already submitted to FBR | BLOCK | invoice.fbr_status |
| FBR-009 | Client phone number missing | WARN | client.phone |
| FBR-010 | No tax rate applied (check if intentional) | WARN | invoice.tax_amount |

### 10.2.3 — Integration points
- Called automatically in: POST /api/v1/invoices/{id}/submit-fbr (before submission)
- Called on demand: GET /api/v1/invoices/{id}/compliance-check
- Show compliance badge on invoice detail page: ✓ Ready for FBR | ⚠ Warnings | ✗ Not Ready

---

## 10.3 — Audit UI

### 10.3.1 — Audit log viewer (Admin only)
- Filters: user, entity type, action, date range, IP address
- Table: Timestamp | User | Action | Entity | IP Address | Details
- Click row to expand: show old_values / new_values JSON diff
- Export to CSV

### 10.3.2 — Per-invoice activity timeline
On invoice detail page, show chronological activity:
- `Nov 15, 10:32 AM — Invoice created by Abdul Rafeh`
- `Nov 15, 11:00 AM — Invoice sent to client`
- `Nov 16, 09:15 AM — Submitted to FBR (USIN: XXXX-YYYY)`
- `Nov 20, 02:30 PM — Payment of PKR 50,000 recorded by Fahim Saeed`

---

---

# PHASE 11 — Multi-Company, Settings & Notifications

**Goal:** Full tenant isolation, configurable system settings, and a notification engine.
**Prerequisite:** All previous phases.
**Definition of Done:** Multiple companies can exist with no data leakage between them. All system behavior is configurable per company.

---

## 11.1 — Multi-Company Support

### 11.1.1 — Companies table
```sql
companies:
  id, name (NOT NULL), ntn (varchar 20, nullable),
  strn (Sales Tax Registration Number, nullable),
  address, city, province, country (default: Pakistan),
  phone, email, website,
  logo_path (nullable),
  fiscal_year_start (ENUM: Jan, Apr, Jul, Oct — for financial year definition),
  currency (default: PKR),
  invoice_prefix (varchar 20, default: INV),
  invoice_starting_number (int, default: 1),
  invoice_due_days (int, default: 30),
  invoice_default_notes (text, nullable),
  invoice_default_terms (text, nullable),
  timezone (default: Asia/Karachi),
  status (ENUM: active, suspended, default: active),
  created_at, updated_at
```

### 11.1.2 — Tenant isolation enforcement
Create `ScopeByCompany` middleware/trait that:
- Automatically appends `WHERE company_id = auth_user.company_id` to all queries
- Applied globally on all model queries except super admin context
- Write integration test: attempt to access another company's invoice → expect 404 (not 403, to not confirm existence)

### 11.1.3 — Company switcher
For users belonging to multiple companies:
- `company_user` pivot table: `company_id, user_id, role_id, is_primary`
- Include `active_company_id` in JWT payload or session
- POST /api/v1/auth/switch-company — issue new token scoped to different company
- Show company name and switcher dropdown in navbar

---

## 11.2 — System Settings

### 11.2.1 — Company profile settings
Fields: Company name, Logo upload, NTN, STRN, Address, Phone, Email, Timezone, Fiscal year start
Logo upload: validate image (JPEG/PNG, max 2MB), resize to 300×100px, store in `storage/logos/`

### 11.2.2 — Invoice settings
Fields: Invoice number prefix, Starting number, Default due days, Default terms text, Default notes text, Currency
Changing starting number only applies to future invoices

### 11.2.3 — Payment method management
CRUD for company's payment methods (Cash, Bank Transfer, Cheque, Online)
Toggle active/inactive

### 11.2.4 — User management (Company Admin)
- List all users in company with role and status
- POST /api/v1/users/invite — send invitation email with tokenized setup link
- PUT /api/v1/users/{id}/role — change user's role
- PUT /api/v1/users/{id}/deactivate — deactivate user (cannot delete if they have invoices)

---

## 11.3 — Notification System

### 11.3.1 — Notifications table
```sql
notifications:
  id (UUID), company_id (FK), user_id (FK),
  type (varchar 100, e.g., "invoice.overdue", "fbr.rejected"),
  title (varchar 255),
  message (text),
  data (JSON, nullable, e.g., { "invoice_id": 42 }),
  read_at (timestamp, nullable),
  created_at
```

### 11.3.2 — In-app notification center
- Bell icon in navbar showing unread count (badge)
- GET /api/v1/notifications — paginated list, unread first
- POST /api/v1/notifications/{id}/read — mark single as read
- POST /api/v1/notifications/read-all
- Auto-dismiss after 30 days

### 11.3.3 — Notification triggers
| Event | Recipients | Channel |
|---|---|---|
| Invoice marked overdue | Company Admin + assigned Seller | In-app + Email |
| FBR submission rejected | Company Admin | In-app + Email (immediate) |
| Payment recorded on invoice | Invoice creator | In-app |
| New user joined company | Company Admin | In-app |
| Backup completed | Company Admin | In-app |
| Backup failed | Company Admin | In-app + Email |
| Payment reminder due | Client (external email) | Email only |

### 11.3.4 — Notification preferences
Per user, per notification type: enable/disable email, enable/disable in-app
Table: `notification_preferences: user_id, notification_type, email_enabled, inapp_enabled`

---

## 11.4 — Backup & Data Management

### 11.4.1 — Automated backup job
- Run daily at 2:00 AM
- Dump database (only company's scoped data for non-super-admin, full for super admin)
- Compress with gzip
- Encrypt backup file (AES-256)
- Store in `storage/backups/YYYY-MM-DD/backup-{company_id}.sql.gz.enc`
- Retain last 30 daily backups; delete older

### 11.4.2 — Manual backup
POST /api/v1/settings/backup/create — trigger on-demand backup
GET /api/v1/settings/backup/download/{id} — download encrypted backup (Admin only, log download)
GET /api/v1/settings/backup/list — list available backups

### 11.4.3 — Data export (user data portability)
POST /api/v1/settings/export-data — generate complete data export:
- All invoices as CSV
- All clients as CSV
- All payments as CSV
- All audit logs as CSV
- Zipped together for download

---

---

# PHASE 12 — Testing, Security & Deployment

**Goal:** Production-ready, secure, well-documented, deployed system.
**Prerequisite:** All 11 phases complete.
**Definition of Done:** 70%+ test coverage, OWASP checklist passed, deployed to cloud with HTTPS, CI/CD live, full documentation delivered.

---

## 12.1 — Automated Testing

### 12.1.1 — Unit tests — Service layer
Write unit tests for:
- `TaxCalculationService::calculate()` — test all cases: standard rate, multiple rates, exemption, inclusive pricing, zero amount
- `FbrSubmissionService::buildPayload()` — test field mapping correctness
- `ComplianceValidatorService::validate()` — test each rule passes/fails independently
- `AuditLogger::log()` — verify correct data written
- Invoice number sequence — test race condition (run 100 concurrent requests, verify no duplicate numbers)

### 12.1.2 — Feature/integration tests — API endpoints
Test every API endpoint:
- Happy path (correct request → expected response)
- Auth failure (no token → 401)
- Authorization failure (wrong role → 403)
- Validation failure (missing required field → 422 with field errors)
- Not found (wrong ID → 404)
- Multi-tenancy (user A cannot access company B's data → 404)

### 12.1.3 — Critical flow end-to-end tests
- Full invoice lifecycle: create → submit FBR → record payment → mark paid
- FBR submission retry: simulate FBR timeout → verify queued → retry succeeds
- CSV import: valid file → correct import count; file with errors → error report returned

### 12.1.4 — Coverage targets
- Unit tests: 85% coverage on service layer
- API tests: 100% endpoint coverage (all status codes)
- Run `./vendor/bin/phpunit --coverage-html reports/coverage` and review uncovered lines

---

## 12.2 — Security Audit

### 12.2.1 — OWASP Top 10 checklist
| Vulnerability | Check |
|---|---|
| Injection | All DB queries use parameterized statements / ORM — no raw string interpolation |
| Broken Auth | JWT properly validated; logout revokes tokens; session fixation prevented |
| Sensitive Data Exposure | FBR credentials encrypted at rest; passwords hashed; HTTPS enforced |
| XML External Entities | N/A (JSON API) |
| Broken Access Control | Company scoping on all queries; RBAC middleware on all routes; tested above |
| Security Misconfiguration | Debug mode OFF in production; no stack traces in API responses; directory listing disabled |
| XSS | All output HTML-escaped; Content Security Policy header set |
| Insecure Deserialization | No unserialize() calls on user input |
| Vulnerable Dependencies | Run composer audit / npm audit; patch all HIGH/CRITICAL |
| Insufficient Logging | Audit log covers all sensitive operations; login attempts logged with IP |

### 12.2.2 — Input sanitization audit
Review all user input points:
- CSV import: validate each cell, reject files with script content
- Invoice notes/terms: HTML-escape before rendering in PDF and on page
- File upload (logo): validate MIME type server-side (not just extension); virus scan if available

### 12.2.3 — FBR credential security
- Verify credentials are encrypted with AES-256 using app-level encryption key (not DB-level)
- Verify encryption key is in `.env` (never committed to Git)
- Verify tokens are never logged in plain text (redact in logs)

### 12.2.4 — Rate limiting configuration
- Login endpoint: 5 attempts per IP per 15 minutes
- Password reset: 3 requests per email per hour
- API globally: 60 requests per minute per authenticated user
- FBR submission: 10 submissions per minute per company (FBR API limits)

---

## 12.3 — Performance Testing

### 12.3.1 — Database index audit
Verify indexes exist on:
- `invoices (company_id, status)`, `invoices (company_id, due_date)`, `invoices (company_id, created_at)`
- `invoice_items (invoice_id)`
- `payments (invoice_id)`
- `audit_logs (company_id, created_at)`, `audit_logs (entity_type, entity_id)`
- `clients (company_id, name)`, `clients (company_id, ntn)`

### 12.3.2 — Load testing
Using Apache JMeter or k6:
- Simulate 100 concurrent users creating invoices (should complete < 3s each)
- Simulate 50 concurrent FBR submissions (verify queue handles backpressure)
- Dashboard load with 10,000 invoices in DB (should respond < 2s)

### 12.3.3 — Caching
- Dashboard summary: cache per company for 5 minutes (key: `dashboard:summary:{company_id}`)
- Tax rates list: cache per company for 1 hour (invalidate on rate change)
- Report queries for completed months: cache indefinitely (historical data doesn't change)

---

## 12.4 — Deployment

### 12.4.1 — Server setup
- Ubuntu 22.04 LTS on cloud VPS (minimum: 2 vCPU, 4GB RAM, 50GB SSD)
- Install: Nginx, PHP-FPM (or Node.js), MySQL, Redis (for queues/caching)
- Configure Nginx: HTTPS only, redirect HTTP → HTTPS, set security headers
- SSL: Let's Encrypt via Certbot with auto-renewal cron

### 12.4.2 — Production environment
- Set `APP_ENV=production`, `APP_DEBUG=false`
- Configure production database (separate from dev DB)
- Set strong `APP_KEY`, `JWT_SECRET`
- FBR API config: switch to production URL, configure real POS ID
- Configure SMTP for transactional emails

### 12.4.3 — Deployment pipeline (GitHub Actions)
```yaml
# .github/workflows/deploy-production.yml
on:
  push:
    branches: [main]
steps:
  - Run CI tests (must pass)
  - SSH to server
  - git pull origin main
  - composer install --no-dev --optimize-autoloader
  - php artisan migrate --force
  - php artisan config:cache && php artisan route:cache
  - Reload PHP-FPM / restart Node process
```

### 12.4.4 — Cron jobs on server
```cron
# Daily at 00:01 — mark overdue invoices
1 0 * * * php artisan invoices:mark-overdue

# Every 30 min — sync FBR submission statuses
*/30 * * * * php artisan fbr:sync-statuses

# Daily at 02:00 — automated backup
0 2 * * * php artisan backup:run

# Hourly — process queue jobs (retry failed FBR submissions)
0 * * * * php artisan queue:work --max-jobs=100 --stop-when-empty
```

### 12.4.5 — Monitoring
- Application error logging to file (`storage/logs/laravel.log`) with daily rotation
- Set up log alerts: email admin if ERROR level logged
- Uptime monitoring: configure UptimeRobot or similar for health check endpoint
- GET /api/v1/health → `{ "status": "ok", "db": "ok", "queue": "ok", "timestamp": "..." }`

---

## 12.5 — Documentation & FYP Deliverables

### 12.5.1 — API documentation
- Export complete Postman collection as JSON
- Alternatively generate Swagger/OpenAPI 3.0 spec
- Every endpoint documented: method, URL, auth required, request body, response schema, example request/response, error codes

### 12.5.2 — System architecture document
- System architecture diagram (components, data flows)
- Complete ER diagram (final version)
- Module dependency map
- FBR integration data flow diagram
- Deployment architecture diagram

### 12.5.3 — User manual
- Chapter per module
- Screenshots of every major screen
- Step-by-step guides: Create your first invoice | Submit to FBR | Record a Payment | Generate a Report

### 12.5.4 — FYP final report structure
```
1. Abstract
2. Introduction (problem statement, objectives, scope)
3. Literature Review (ERP comparisons, FBR background, e-invoicing standards)
4. System Design (architecture, ER diagram, use case diagrams, wireframes)
5. Implementation (tech stack rationale, key algorithms, screenshots)
6. Testing (test plan, results, coverage report)
7. Results & Discussion
8. Conclusion & Future Work
9. References
Appendices: API docs, ER diagram, user manual
```

### 12.5.5 — FYP defense preparation
- 15-minute demo video covering complete user journey: login → create invoice → submit to FBR → record payment → view report
- Presentation slides (12-15 slides): Problem | Solution | Architecture | Demo screenshots | Challenges | Results
- Prepare for Q&A on: FBR API security, multi-tenancy approach, tax calculation edge cases, scalability

---

---

## Appendix A — Database Schema Quick Reference

| Table | Key Columns | Relations |
|---|---|---|
| companies | id, name, ntn, strn | has many: users, clients, invoices |
| users | id, company_id, email, role_id | belongs to: companies |
| clients | id, company_id, name, ntn, cnic | has many: invoices |
| invoices | id, company_id, client_id, invoice_number, status, fbr_status | has many: items, payments, audit_logs |
| invoice_items | id, invoice_id, description, quantity, unit_price, tax_rate_id | belongs to: invoices |
| tax_rates | id, company_id, name, rate_percentage, tax_type | used by: invoice_items |
| payments | id, invoice_id, amount_paid, payment_date | belongs to: invoices |
| fbr_submissions | id, invoice_id, status, fbr_usin, request_payload, response_raw | belongs to: invoices |
| audit_logs | id, user_id, action, entity_type, entity_id, old_values, new_values | immutable, append-only |
| notifications | id, user_id, type, title, read_at | belongs to: users |
| fbr_configs | id, company_id, pos_id, api_token_encrypted | belongs to: companies |

---

## Appendix B — API Endpoints Quick Reference

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| POST | /api/v1/auth/register | No | — |
| POST | /api/v1/auth/login | No | — |
| POST | /api/v1/auth/logout | Yes | Any |
| GET | /api/v1/dashboard/summary | Yes | Any |
| GET/POST/PUT/DELETE | /api/v1/clients | Yes | Admin/Seller |
| POST | /api/v1/clients/import | Yes | Admin |
| GET/POST/PUT/DELETE | /api/v1/invoices | Yes | Admin/Seller |
| GET | /api/v1/invoices/{id}/pdf | Yes | Admin/Seller |
| POST | /api/v1/invoices/{id}/submit-fbr | Yes | Admin/Seller |
| POST | /api/v1/invoices/{id}/payments | Yes | Admin/Seller |
| GET | /api/v1/tax-rates | Yes | Any |
| GET | /api/v1/reports/{type} | Yes | Admin/Accountant |
| GET | /api/v1/reports/{type}/export | Yes | Admin |
| GET | /api/v1/audit-logs | Yes | Admin only |
| GET/POST | /api/v1/settings/* | Yes | Admin |
| GET | /api/v1/health | No | — |

---

## Appendix C — FBR Integration Notes

- **Sandbox URL:** `https://gw.fbr.gov.pk/imssandbox/api/Live/` (for testing)
- **Production URL:** `https://gw.fbr.gov.pk/imsnew/api/Live/`
- **Token endpoint:** `POST /FBRToken`
- **Invoice submission:** `POST /GetInvoiceNumberByPOS`
- **Required seller fields:** POS ID, NTN
- **Required buyer fields:** NTN (businesses) OR CNIC (individuals)
- **Invoice must be submitted within 72 hours of issue date** (FBR rule)
- **Always test against sandbox before enabling production mode**

---

*Document version: 1.0 | Generated for FYP BSSE Spring 2026, SZABIST Islamabad*
*This document is intended for use by AI coding agents and human developers. Each task is atomic and independently implementable.*
