# Agent.md — Smart Digital Invoicing System (FBR Integrated)
> **This file is the single source of truth for any AI agent working on this codebase.**
> Read this before touching any file. It contains full project context, architecture decisions, data models, and conventions.

---

## 1. Project Overview

**Project Name:** Smart Digital Invoicing System Integrated with FBR
**Type:** Final Year Project (FYP) — Web Application
**Institution:** SZABIST Islamabad, Faculty of Computing and Engineering Sciences
**Semester:** Spring 2026
**Team:** Abdul Rafeh (2280346), Faheem Saeed (2280323), M. Usman (2280365)
**Supervisor:** Sir Adeel Ahmed

### What This System Does
A secure, web-based platform that allows Pakistani businesses (SMEs) to:
1. Create digital invoices manually or upload them in bulk via CSV
2. Automatically validate invoice data against FBR (Federal Board of Revenue) compliance rules
3. Submit invoices to FBR via their official REST API
4. Receive FBR confirmation and generate a QR-coded digital invoice
5. Track payments, manage clients, and view financial analytics

### Who Uses It
- **Admin:** Full access — manages company settings, FBR token, users, reports, audit logs
- **Seller:** Can create invoices, upload CSV, submit to FBR, track payments

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), React Router v6, Axios, Tailwind CSS, Recharts, React Hook Form, React Toastify |
| Backend | Node.js, Express.js |
| Database | PostgreSQL with Sequelize ORM |
| Auth | JWT (access token) + refresh tokens, bcrypt (salt 12) |
| File Upload | Multer (CSV, 5MB limit) |
| CSV Parsing | csv-parser |
| QR Code | qrcode (npm) |
| PDF Generation | pdfkit (or puppeteer) |
| Email | Nodemailer |
| Scheduler | node-cron |
| Security | helmet, express-rate-limit, express-validator, AES-256-GCM (crypto module) |
| Testing | Jest + Supertest (backend), React Testing Library + Vitest (frontend) |
| Dev Tools | ESLint, Prettier, Postman, Git/GitHub |
| Deployment | Express → Render/Railway; React → Vercel/Netlify; DB → Supabase/Render PostgreSQL |
| CI/CD | GitHub Actions |

---

## 3. Repository Structure

```
/
├── client/                   # React frontend (Vite)
│   ├── src/
│   │   ├── pages/            # Route-level page components
│   │   ├── components/       # Reusable UI components
│   │   ├── layouts/          # Layout wrappers (AuthLayout, DashboardLayout)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # Axios API call functions
│   │   ├── context/          # React Context (AuthContext, etc.)
│   │   └── utils/            # Frontend helper functions
│   └── .env                  # VITE_API_URL=<backend url>
│
├── server/                   # Express.js backend
│   ├── config/               # Database config, environment config
│   ├── controllers/          # Route handler logic
│   ├── middleware/            # authenticate, authorize, rateLimiter, auditLogger
│   ├── models/               # Sequelize models
│   ├── routes/               # Express routers
│   ├── services/             # Business logic (fbrService, notificationService)
│   ├── utils/                # Helpers: taxCalculator, csvParser, csvValidator, csvTransformer, encryption, qrGenerator
│   ├── migrations/           # Sequelize migrations (run in order)
│   ├── seeders/              # DB seed data (roles, tax rates)
│   ├── uploads/              # Temporary CSV file storage (gitignored)
│   ├── app.js                # Express app setup
│   └── server.js             # Entry point
│
├── .github/
│   └── workflows/ci.yml      # GitHub Actions CI pipeline
├── docker-compose.yml        # Local dev: app + postgres
└── README.md
```

---

## 4. Database Schema

> All tables use PostgreSQL. Managed via Sequelize migrations. Run migrations in the order listed.

### 4.1 `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | unique |
| password_hash | VARCHAR(255) | bcrypt, salt 12 |
| role | ENUM('admin','seller') | |
| is_active | BOOLEAN | default true |
| failed_attempts | INTEGER | default 0 |
| locked_until | TIMESTAMP | null = not locked |
| created_at / updated_at | TIMESTAMP | |

### 4.2 `companies`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | VARCHAR(255) | |
| ntn | VARCHAR(20) | National Tax Number |
| strn | VARCHAR(20) | Sales Tax Registration Number |
| address | TEXT | |
| email | VARCHAR(255) | |
| phone | VARCHAR(20) | |
| logo_url | VARCHAR(500) | |
| created_at / updated_at | TIMESTAMP | |

### 4.3 `fbr_tokens`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| token_encrypted | TEXT | AES-256-GCM encrypted |
| pos_id | VARCHAR(100) | FBR POS ID |
| environment | ENUM('sandbox','production') | |
| is_active | BOOLEAN | |
| created_at / updated_at | TIMESTAMP | |

> ⚠️ **NEVER** return `token_encrypted` in any API response. Only return token status (active/inactive).

### 4.4 `clients`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| name | VARCHAR(255) | |
| ntn | VARCHAR(20) | 7-digit format |
| cnic | VARCHAR(15) | optional |
| email | VARCHAR(255) | |
| phone | VARCHAR(20) | |
| address | TEXT | |
| city | VARCHAR(100) | |
| is_active | BOOLEAN | soft delete |
| created_at / updated_at | TIMESTAMP | |

### 4.5 `invoices`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| client_id | UUID (FK → clients) | |
| invoice_number | VARCHAR(50) | unique per company, e.g. INV-2026-0001 |
| invoice_date | DATE | |
| due_date | DATE | |
| status | ENUM('draft','submitted','verified','failed','cancelled') | |
| payment_status | ENUM('unpaid','partial','paid','overdue') | |
| subtotal | DECIMAL(15,2) | |
| discount | DECIMAL(15,2) | |
| tax_amount | DECIMAL(15,2) | |
| total_amount | DECIMAL(15,2) | |
| notes | TEXT | |
| fbr_invoice_number | VARCHAR(100) | assigned by FBR on success |
| fbr_status | VARCHAR(50) | FBR response status string |
| qr_code_url | VARCHAR(500) | URL to stored QR image |
| created_by | UUID (FK → users) | |
| created_at / updated_at | TIMESTAMP | |

### 4.6 `invoice_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| invoice_id | UUID (FK → invoices) | |
| product_name | VARCHAR(255) | |
| hsn_code | VARCHAR(20) | Harmonized System Code |
| quantity | DECIMAL(10,3) | |
| unit_price | DECIMAL(15,2) | |
| discount | DECIMAL(15,2) | item-level discount |
| tax_rate | DECIMAL(5,2) | e.g. 17.00 for 17% |
| tax_amount | DECIMAL(15,2) | calculated |
| total_price | DECIMAL(15,2) | calculated |

### 4.7 `csv_uploads`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| filename | VARCHAR(255) | stored filename |
| original_name | VARCHAR(255) | original upload filename |
| row_count | INTEGER | total rows parsed |
| valid_count | INTEGER | |
| error_count | INTEGER | |
| status | ENUM('processing','ready','errors','submitted') | |
| uploaded_by | UUID (FK → users) | |
| created_at | TIMESTAMP | |

### 4.8 `csv_upload_errors`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| upload_id | UUID (FK → csv_uploads) | |
| row_number | INTEGER | 1-indexed |
| field | VARCHAR(100) | field name with error |
| error_message | TEXT | human-readable |

### 4.9 `payments`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| invoice_id | UUID (FK → invoices) | |
| amount_paid | DECIMAL(15,2) | |
| payment_date | DATE | |
| payment_method | ENUM('cash','bank_transfer','cheque','online') | |
| reference_number | VARCHAR(100) | |
| notes | TEXT | |
| recorded_by | UUID (FK → users) | |
| created_at | TIMESTAMP | |

### 4.10 `fbr_submissions`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| invoice_id | UUID (FK → invoices) | |
| attempt_number | INTEGER | |
| status | VARCHAR(50) | |
| fbr_response | JSONB | full FBR response stored |
| submitted_at | TIMESTAMP | |

### 4.11 `fbr_api_logs`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| invoice_id | UUID (FK → invoices) | nullable |
| request_payload_hash | VARCHAR(64) | SHA-256 of payload |
| response_status | INTEGER | HTTP status from FBR |
| fbr_invoice_number | VARCHAR(100) | |
| error_message | TEXT | |
| created_at | TIMESTAMP | |

### 4.12 `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK) | |
| user_id | UUID (FK → users) | |
| action | VARCHAR(100) | e.g. INVOICE_CREATED, CLIENT_UPDATED |
| entity_type | VARCHAR(50) | e.g. Invoice, Client |
| entity_id | UUID | |
| old_values | JSONB | masked: no passwords/tokens |
| new_values | JSONB | masked |
| ip_address | VARCHAR(45) | |
| created_at | TIMESTAMP | |

### 4.13 `notifications`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK) | |
| user_id | UUID (FK → users) | |
| type | VARCHAR(100) | e.g. FBR_VERIFIED, PAYMENT_DUE |
| message | TEXT | |
| is_read | BOOLEAN | default false |
| entity_id | UUID | related entity (invoice id etc) |
| created_at | TIMESTAMP | |

### 4.14 `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| token_hash | VARCHAR(64) | SHA-256 of token |
| expires_at | TIMESTAMP | |
| revoked | BOOLEAN | default false |
| created_at | TIMESTAMP | |

### 4.15 `tax_rates`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | |
| label | VARCHAR(50) | e.g. "Standard GST" |
| rate | DECIMAL(5,2) | e.g. 17.00 |
| is_default | BOOLEAN | |

### 4.16 `company_settings`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| company_id | UUID (FK → companies) | unique |
| invoice_prefix | VARCHAR(20) | e.g. "INV" |
| invoice_counter | INTEGER | current counter |
| invoice_format | VARCHAR(50) | e.g. "INV-YYYY-NNNN" |
| payment_terms_days | INTEGER | default due days |

---

## 5. API Routes Reference

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <JWT>` header.

### Auth
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | /auth/register | No | Register new user + company |
| POST | /auth/login | No | Login, returns JWT + refresh token |
| POST | /auth/logout | Yes | Revoke refresh token |
| POST | /auth/refresh-token | No | Issue new access token |
| POST | /auth/forgot-password | No | Send reset email |
| POST | /auth/reset-password | No | Reset password with token |
| GET | /auth/me | Yes | Get current user profile |

### Companies
| Method | Route | Auth | Role |
|---|---|---|---|
| POST | /companies | Yes | admin |
| GET | /companies/:id | Yes | any |
| PUT | /companies/:id | Yes | admin |
| POST | /companies/:id/fbr-token | Yes | admin |
| GET | /companies/:id/fbr-token/status | Yes | admin |
| DELETE | /companies/:id/fbr-token | Yes | admin |

### Clients
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | /clients | Yes | Paginated, searchable |
| POST | /clients | Yes | |
| GET | /clients/:id | Yes | |
| PUT | /clients/:id | Yes | |
| DELETE | /clients/:id | Yes | Soft delete |
| GET | /clients/:id/invoices | Yes | Paginated invoice history |

### Invoices
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | /invoices | Yes | Paginated with filters |
| POST | /invoices | Yes | Create with line items |
| GET | /invoices/:id | Yes | Full detail |
| PUT | /invoices/:id | Yes | Draft only |
| DELETE | /invoices/:id | Yes | Draft only, soft delete |
| GET | /invoices/:id/pdf | Yes | Stream PDF download |
| GET | /invoices/:id/qr | Yes | Return QR image |
| POST | /invoices/:id/payments | Yes | Record payment |
| GET | /invoices/:id/payments | Yes | Payment history |

### CSV Upload
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | /csv/upload | Yes | Multipart form, CSV only |
| GET | /csv/uploads | Yes | List past uploads |
| GET | /csv/uploads/:id/errors | Yes | Error report |
| GET | /csv/template | Yes | Download blank template |

### FBR Integration
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | /fbr/submit/:invoiceId | Yes | Single invoice |
| POST | /fbr/submit-bulk/:uploadId | Yes | Batch from CSV |
| GET | /fbr/status/:invoiceId | Yes | Poll FBR status |
| POST | /fbr/retry/:invoiceId | Yes | Retry failed |

### Dashboard & Reports
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | /dashboard/summary | Yes | KPI summary |
| GET | /dashboard/sales-chart | Yes | Chart data, param: period |
| GET | /dashboard/fbr-stats | Yes | FBR submission stats |
| GET | /dashboard/tax-summary | Yes | Tax by period |
| GET | /reports/sales | Yes | Filtered sales report |
| GET | /reports/tax | Yes | Tax report |
| GET | /reports/export | Yes | CSV or PDF export |

### Notifications
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | /notifications | Yes | Unread for user |
| PUT | /notifications/:id/read | Yes | Mark read |
| PUT | /notifications/read-all | Yes | Mark all read |

### Audit Logs
| Method | Route | Auth | Role |
|---|---|---|---|
| GET | /audit-logs | Yes | admin |

### Public (No Auth)
| Method | Route | Notes |
|---|---|---|
| GET | /verify/:fbrInvoiceNumber | Public invoice verification page |

---

## 6. Key Business Logic

### Invoice Number Generation
- Format: `{PREFIX}-{YYYY}-{NNNN}` (e.g., `INV-2026-0001`)
- Counter is per company, stored in `company_settings.invoice_counter`
- Use DB row-level locking (`SELECT FOR UPDATE`) when incrementing to prevent duplicates

### Tax Calculation (`utils/taxCalculator.js`)
```
item_net = (quantity × unit_price) - item_discount
item_tax = item_net × (tax_rate / 100)
item_total = item_net + item_tax

invoice_subtotal = sum(item_net for all items)
invoice_discount = invoice-level discount (separate from item discounts)
invoice_tax = sum(item_tax for all items)
invoice_total = invoice_subtotal - invoice_discount + invoice_tax
```
All monetary values rounded to 2 decimal places.

### FBR Token Encryption (`utils/encryption.js`)
- Algorithm: AES-256-GCM
- Key: 32-byte key from `process.env.ENCRYPTION_KEY` (must be set in production)
- IV: 12-byte random IV generated per encryption
- Store: `iv:authTag:ciphertext` (base64) in `fbr_tokens.token_encrypted`
- Decrypt only server-side, never expose raw token in any response

### CSV Validation Rules
Required columns (header names must match exactly):
`client_ntn`, `invoice_date`, `product_name`, `hsn_code`, `quantity`, `unit_price`, `tax_rate`

Validation rules:
- `client_ntn`: 7-digit numeric string
- `invoice_date`: YYYY-MM-DD format, not future date
- `quantity`: positive number, max 3 decimal places
- `unit_price`: positive number, max 2 decimal places
- `tax_rate`: one of allowed rates (0, 5, 10, 17, etc.)
- `hsn_code`: 4–8 digit numeric string

### FBR API Integration (`services/fbrService.js`)
- Base URL (sandbox): set in `FBR_SANDBOX_URL` env variable
- Base URL (production): set in `FBR_PROD_URL` env variable
- Auth: Bearer token from decrypted `fbr_tokens.token_encrypted`
- On success: save `fbr_invoice_number`, generate QR code, update `invoices.status = 'verified'`
- On failure: save error, update `invoices.status = 'failed'`, create notification
- Retry: exponential backoff — 1s, 2s, 4s — max 3 attempts

### Invoice Status Flow
```
draft → submitted → verified
              ↓
            failed → (retry) → submitted → verified
```
- Invoices can only be edited in `draft` status
- Once `submitted`, they are locked (read-only)

### Payment Status Logic
```
if total_paid = 0 → 'unpaid'
if 0 < total_paid < total_amount → 'partial'
if total_paid >= total_amount → 'paid'
if due_date < today AND payment_status != 'paid' → 'overdue'
```

---

## 7. Auth & Security Rules

- **JWT Access Token:** 15 minute expiry, signed with `JWT_SECRET` env var
- **Refresh Token:** 7 day expiry, stored hashed in DB, one per user session
- **Password:** bcrypt, minimum 8 characters, must include letter + number
- **Account Lock:** Lock for 30 minutes after 5 failed login attempts
- **Rate Limit:** Auth routes — 10 requests per 15 minutes per IP
- **CORS:** Only allow origin from `CLIENT_URL` env variable in production
- **Helmet:** Full configuration enabled
- **FBR Token:** Never logged, never returned in API response, AES-256-GCM encrypted at rest
- **Audit Logs:** Mask `password_hash`, `token_encrypted` in `old_values`/`new_values`
- **Company Isolation:** Every DB query MUST filter by `company_id` from `req.user.company_id` — never trust company_id from request body

---

## 8. Environment Variables

### Server (`server/.env`)
```
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fbr_invoicing
DB_USER=postgres
DB_PASSWORD=yourpassword

# Auth
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your_refresh_secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=32_byte_hex_string_for_aes256

# FBR API
FBR_ENV=sandbox
FBR_SANDBOX_URL=https://esp.fbr.gov.pk:8244/api/Live
FBR_PROD_URL=https://esp.fbr.gov.pk:8244/api/Live

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password

# Frontend URL (for CORS)
CLIENT_URL=http://localhost:5173
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:5000/api
```

---

## 9. Conventions & Coding Standards

### Backend
- All controllers use `async/await` with `try/catch`; errors passed to `next(err)` for central error handler
- Central error handler in `middleware/errorHandler.js` returns `{ success: false, message, errors? }`
- Success responses: `{ success: true, data: {...}, message: "..." }`
- Paginated responses: `{ success: true, data: [...], pagination: { page, limit, total, totalPages } }`
- All IDs are UUIDs (use `uuid` npm package or PostgreSQL `gen_random_uuid()`)
- Use Sequelize transactions for operations that touch multiple tables
- All timestamps in UTC

### Frontend
- API calls live in `src/services/` — one file per resource (e.g., `invoiceService.js`)
- Custom hooks in `src/hooks/` handle data fetching with loading/error state
- Toast notifications via `react-toastify` for all user actions
- Form validation via `react-hook-form`
- Route protection via `<ProtectedRoute>` wrapper component
- Page-level components are in `src/pages/`; reusable UI in `src/components/`

### Git
- Branch naming: `feature/phase-X-description`, `fix/bug-description`
- Commit format: `feat: add CSV validation`, `fix: correct tax rounding`, `chore: update deps`
- PRs require passing CI tests before merge to `dev`
- `main` is production-ready only

---

## 10. Scheduled Jobs (node-cron)

| Job | Schedule | Action |
|---|---|---|
| Overdue Invoice Checker | Daily at 1:00 AM | Scan invoices past due date, set payment_status = 'overdue', create notifications |
| Payment Reminder Emails | Daily at 8:00 AM | Email clients for invoices due in 7 days |

---

## 11. Frontend Routes

| Path | Page | Auth |
|---|---|---|
| /login | Login | No |
| /register | Register | No |
| /forgot-password | Forgot Password | No |
| /reset-password | Reset Password | No |
| /verify/:fbrInvoiceNumber | Public Invoice Verify | No |
| /dashboard | Dashboard | Yes |
| /invoices | Invoice Listing | Yes |
| /invoices/new | Create Invoice | Yes |
| /invoices/:id | Invoice Detail | Yes |
| /invoices/bulk-upload | CSV Bulk Upload | Yes |
| /clients | Client Listing | Yes |
| /clients/:id | Client Detail | Yes |
| /reports | Reports | Yes |
| /notifications | Notifications | Yes |
| /settings | Settings (tabs) | Yes (admin) |
| /settings/audit-logs | Audit Log Viewer | Yes (admin) |

---

## 12. Third-Party Integrations

| Service | Purpose | Package |
|---|---|---|
| FBR REST API | Invoice submission and verification | axios |
| Nodemailer | Password reset & payment reminder emails | nodemailer |
| qrcode | QR code generation after FBR success | qrcode |
| pdfkit | PDF invoice generation | pdfkit |
| csv-parser | Parse uploaded CSV files | csv-parser |
| multer | Handle CSV file uploads | multer |
| node-cron | Scheduled background jobs | node-cron |

---

## 13. What Is NOT In Scope

- Mobile app (web-only)
- Real-time chat or collaboration
- POS hardware integration
- Payment gateway integration (only payment recording, not processing)
- Multi-language/localization (English only)
- Inventory or stock management

---

*Last updated: Spring 2026 | Maintained by FYP Team*