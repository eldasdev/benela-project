# BENELA AI × 1C INTEGRATION — CODEX MASTER PROMPT
> Use with: GPT-5.4 (Thinking mode ON) / OpenAI Codex
> Project: Benela AI ERP Platform — github.com/eldasdev/benela-project

---

## YOUR ROLE

You are a senior backend engineer working on **Benela AI** — a production Next.js + FastAPI ERP platform deployed at `benela.dev`. Your task is to build a complete, production-grade **1C:Enterprise integration layer** that becomes the platform's biggest competitive advantage in the Central Asian market.

Think deeply before writing any code. Reason through edge cases, security risks, and UX implications. Every decision must be justified.

---

## PROJECT CONTEXT

### Stack
```
Frontend:  Next.js 16 (App Router, TypeScript) — benela.dev — DigitalOcean App Platform
Backend:   FastAPI (Python 3.11) — benela-backend-vtjir.ondigitalocean.app
Database:  PostgreSQL on DigitalOcean
Auth:      Supabase (@supabase/ssr)
AI:        Anthropic Claude (claude-haiku-4-5-20251001) via base_agent.py
Repo:      github.com/eldasdev/benela-project (frontend/ and backend/ dirs)
```

### Design System (ALL inline styles, NO Tailwind, NO CSS modules)
```
Background: #080808 (page), #0d0d0d (cards)
Borders:    #1c1c1c, #222 (inputs)
Text:       #f0f0f5 (primary), #555, #444 (muted)
Accent:     #7c6aff → #4f3de8 (purple), #34d399 (green), #f87171 (red)
```

### Key Existing Files
```
backend/
├── agents/
│   ├── base_agent.py          # Claude API calls (urllib, no SDK), accepts context param
│   ├── finance_agent.py       # Extends BaseAgent for finance
│   └── data_fetcher.py        # get_context_for_section(section) — injects DB data into AI
├── api/
│   ├── agents.py              # POST /{section} — AI chat endpoint
│   ├── finance.py             # Finance CRUD routes
│   ├── hr.py                  # HR CRUD routes
│   └── projects.py            # Projects CRUD routes
├── database/
│   └── models.py              # SQLAlchemy models: Transaction, Invoice, Employee, Project, etc.
└── main.py                    # FastAPI app, router includes

frontend/
├── components/
│   ├── AIPanel.tsx            # AI chat sidebar — sends POST /{section}, shows response
│   ├── FinancePage.tsx        # Finance module UI
│   └── Dashboard.tsx          # Main dashboard
└── types/index.ts             # Shared TypeScript types
```

### How AI Context Injection Works (CRITICAL — study this)
```python
# backend/agents/data_fetcher.py
async def get_finance_context() -> str:
    # Queries PostgreSQL, returns formatted string like:
    # "Recent transactions: [...], Total income: $X, Total expenses: $Y"

async def get_context_for_section(section: str) -> str:
    # Returns the right context string per section
    # This string gets injected into Claude's system prompt in base_agent.py

# backend/agents/base_agent.py
async def chat(self, message: str, context: str = "") -> str:
    system_prompt = f"""You are a business assistant...
    {context}  # <-- real DB data injected here
    Rules: no markdown, answer in 3-5 sentences..."""
    # Calls Anthropic API via urllib
```

---

## THE TASK

Build a **complete 1C:Enterprise integration system** with THREE tiers of connectivity, a data normalization pipeline, and a seamless AI chat experience. This must be production-ready, secure, and built to Benela's existing code style.

---

## WHAT TO BUILD — COMPLETE SPECIFICATION

### TIER 1: FILE IMPORT BRIDGE (MVP — build this first)

**Purpose:** Zero-friction onboarding. Companies export their data from 1C to Excel/CSV and upload to Benela. No server access required.

#### `backend/integrations/onec/file_parser.py`
Build a robust file parser that handles:

```python
class OneCFileParser:
    """
    Parses 1C exported files into normalized Benela data structures.
    
    1C export formats to support:
    - Excel (.xlsx) — most common, used by accountants
    - CSV with Cyrillic headers (UTF-8 and Windows-1251 encoding)
    - MXL format (1C native — convert to CSV first using LibreOffice)
    - XML exports from 1C:Enterprise 8.3+
    
    1C report types to detect and parse:
    - Оборотно-сальдовая ведомость (Trial Balance) — accounts, opening/closing balances
    - Карточка счёта (Account Card) — individual account transactions
    - Анализ счёта (Account Analysis) — debit/credit per period
    - Движение денежных средств (Cash Flow Statement)
    - Отчёт по продажам (Sales Report)
    - Список контрагентов (Counterparty List) — customers/vendors
    - Складской отчёт (Inventory/Stock Report)
    - Зарплатная ведомость (Payroll Report)
    - Акт сверки (Reconciliation Act)
    """
    
    async def detect_report_type(self, df: pd.DataFrame) -> str:
        """Detect which 1C report type this is by analyzing headers and structure."""
    
    async def parse_trial_balance(self, df: pd.DataFrame) -> List[Dict]:
        """Parse ОСВ into account balances."""
    
    async def parse_cash_flow(self, df: pd.DataFrame) -> List[Transaction]:
        """Parse cash movements into Benela Transaction model."""
    
    async def parse_sales_report(self, df: pd.DataFrame) -> List[Invoice]:
        """Parse sales into Benela Invoice model."""
    
    async def parse_counterparties(self, df: pd.DataFrame) -> List[Dict]:
        """Parse контрагентов into contacts/clients."""
    
    async def parse_inventory(self, df: pd.DataFrame) -> List[Dict]:
        """Parse stock report into inventory items."""
    
    async def parse_payroll(self, df: pd.DataFrame) -> List[Dict]:
        """Parse payroll into HR salary records."""
    
    async def normalize_date(self, date_str: str) -> date:
        """Handle all 1C date formats: DD.MM.YYYY, MM/DD/YYYY, YYYY-MM-DD"""
    
    async def normalize_amount(self, amount_str: str) -> Decimal:
        """Handle 1C number formats: '1 234 567,89' (Russian) and '1,234,567.89' (English)"""
    
    async def normalize_cyrillic_header(self, header: str) -> str:
        """Map 1C Cyrillic column names to Benela field names."""
```

**Cyrillic header mapping dict (must be complete):**
```python
ONEC_HEADER_MAP = {
    # Financial
    "Дата": "date",
    "Сумма": "amount",
    "Сумма операции": "amount",
    "Контрагент": "counterparty",
    "Организация": "organization",
    "Валюта": "currency",
    "Счёт": "account",
    "Дебет": "debit",
    "Кредит": "credit",
    "Остаток": "balance",
    "Входящий остаток": "opening_balance",
    "Исходящий остаток": "closing_balance",
    "Назначение платежа": "description",
    "Статья ДДС": "cash_flow_item",
    "Вид операции": "operation_type",
    # Sales
    "Номенклатура": "product_name",
    "Количество": "quantity",
    "Цена": "unit_price",
    "Скидка": "discount",
    "НДС": "vat",
    "Номер документа": "document_number",
    # HR
    "Сотрудник": "employee_name",
    "Должность": "position",
    "Подразделение": "department",
    "Оклад": "salary",
    "Начислено": "accrued",
    "Удержано": "deducted",
    "К выплате": "net_pay",
    # Inventory
    "Товар": "product_name",
    "Склад": "warehouse",
    "Единица": "unit",
    "Начальный остаток": "opening_stock",
    "Конечный остаток": "closing_stock",
    "Приход": "incoming",
    "Расход": "outgoing",
    # add any others encountered
}
```

---

#### `backend/integrations/onec/normalizer.py`
```python
class OneCNormalizer:
    """
    Maps parsed 1C data to Benela's SQLAlchemy models.
    Handles deduplication, conflict resolution, and incremental updates.
    """
    
    async def to_transactions(self, parsed_data: List[Dict], company_id: int) -> List[Transaction]:
        """Convert 1C cash movements → Benela Transaction rows."""
    
    async def to_invoices(self, parsed_data: List[Dict], company_id: int) -> List[Invoice]:
        """Convert 1C sales docs → Benela Invoice rows."""
    
    async def to_employees(self, parsed_data: List[Dict], company_id: int) -> List[Employee]:
        """Convert 1C HR data → Benela Employee rows."""
    
    async def to_inventory(self, parsed_data: List[Dict], company_id: int) -> List[Dict]:
        """Convert 1C stock data → Benela inventory structure."""
    
    async def deduplicate(self, new_records: List, existing_records: List) -> List:
        """Prevent duplicate imports using SHA256 hash of key fields."""
    
    async def detect_conflicts(self, new_record: Dict, existing_record: Dict) -> ConflictResolution:
        """When same document exists in both 1C and Benela — return resolution strategy."""
```

---

#### `backend/database/onec_models.py`
New SQLAlchemy models for the integration layer:

```python
class OneCImportJob(Base):
    """Tracks every file import from 1C."""
    __tablename__ = "onec_import_jobs"
    
    id: int (PK)
    company_id: int (FK → client_orgs)
    filename: str
    file_size_bytes: int
    report_type: str          # "trial_balance", "cash_flow", "sales", "inventory", "payroll"
    status: str               # "pending", "processing", "completed", "failed"
    records_parsed: int
    records_imported: int
    records_skipped: int      # duplicates
    records_failed: int
    error_message: str (nullable)
    period_start: date (nullable)
    period_end: date (nullable)
    imported_by: str          # Supabase user ID
    created_at: datetime
    completed_at: datetime (nullable)

class OneCRecord(Base):
    """Raw parsed 1C data — kept for audit trail and re-processing."""
    __tablename__ = "onec_raw_records"
    
    id: int (PK)
    import_job_id: int (FK → onec_import_jobs)
    company_id: int
    record_type: str          # "transaction", "invoice", "employee", "inventory_item"
    raw_data: JSONB           # original parsed row from 1C
    normalized_data: JSONB    # after normalization
    benela_record_id: int (nullable)  # FK to Transaction/Invoice/etc after import
    benela_table: str (nullable)      # "transactions", "invoices", etc
    import_hash: str          # SHA256(key fields) for deduplication
    created_at: datetime

class OneCConnection(Base):
    """Stores API/database connection config for Tier 2 & 3."""
    __tablename__ = "onec_connections"
    
    id: int (PK)
    company_id: int (FK → client_orgs)
    connection_type: str      # "file", "database", "http_api"
    
    # For database connections (Tier 2)
    db_host: str (encrypted)
    db_port: int
    db_name: str
    db_username: str (encrypted)
    db_password: str (encrypted)  # store encrypted with Fernet
    db_type: str              # "postgresql", "mssql", "file_1cd"
    
    # For HTTP API connections (Tier 3)
    api_base_url: str
    api_username: str (encrypted)
    api_password: str (encrypted)
    api_version: str          # "8.2", "8.3", "8.3.20"
    
    # Sync settings
    sync_enabled: bool
    sync_interval_minutes: int  # 60, 360, 1440
    last_sync_at: datetime (nullable)
    last_sync_status: str (nullable)
    
    is_active: bool
    created_at: datetime
```

---

#### `backend/api/onec.py` — File Import Router

```python
# Prefix: /onec
# All routes require authentication (Supabase JWT)

POST   /onec/import/upload
    """
    Upload a 1C export file. Accepts multipart/form-data.
    File types: .xlsx, .csv, .xml, .mxl
    Max size: 50MB
    
    Process:
    1. Validate file type and size
    2. Create OneCImportJob with status="pending"
    3. Return job_id immediately (async processing)
    4. Trigger background task: process_import_job(job_id)
    """
    Body: file (multipart), company_id (int), report_type_hint (str, optional)
    Returns: { job_id: int, status: "pending", message: str }

GET    /onec/import/jobs
    """List all import jobs for the authenticated company."""
    Returns: List[OneCImportJob]

GET    /onec/import/jobs/{job_id}
    """Get status and details of a specific import job."""
    Returns: OneCImportJob + stats

GET    /onec/import/jobs/{job_id}/records
    """Get parsed records from a completed import (paginated)."""
    Params: page (int), per_page (int, max 100), status filter
    Returns: Paginated List[OneCRecord]

POST   /onec/import/jobs/{job_id}/confirm
    """
    User confirms the import after previewing records.
    This triggers actual database writes to Benela models.
    Two-step process: parse first, confirm to commit.
    """
    Returns: { imported: int, skipped: int, failed: int }

DELETE /onec/import/jobs/{job_id}
    """Cancel a pending job or rollback a completed one."""

GET    /onec/import/template/{report_type}
    """Download a sample 1C export template (Excel) so users know correct format."""
    Returns: .xlsx file download
```

---

#### Background Task: `backend/integrations/onec/processor.py`

```python
async def process_import_job(job_id: int, db: AsyncSession):
    """
    Background task that runs the full parsing pipeline.
    
    Pipeline:
    1. Load file from temp storage
    2. Detect encoding (UTF-8 vs Windows-1251 — critical for Cyrillic)
    3. Auto-detect report type if not provided
    4. Run appropriate parser
    5. Run normalizer
    6. Deduplicate against existing records
    7. Store raw + normalized in onec_raw_records
    8. Update job status with progress
    9. DO NOT write to main tables yet — wait for user confirmation
    
    Error handling:
    - Per-row error capture (don't fail entire job for one bad row)
    - Encoding errors → try Windows-1251 fallback
    - Missing required fields → mark row as "failed" with reason
    - Amount parsing errors → flag for manual review
    """
```

---

### TIER 2: DATABASE DIRECT SYNC

**Purpose:** Automated scheduled sync by connecting directly to the company's 1C database (read-only). Company's IT admin provides DB credentials once.

#### `backend/integrations/onec/db_connector.py`

```python
class OneCDatabaseConnector:
    """
    Connects directly to the database backend used by 1C.
    
    1C uses different databases depending on version/config:
    - 1C File mode (.1CD file) — SQLite-compatible format
    - PostgreSQL (enterprise mode) — most common in Uzbekistan
    - Microsoft SQL Server — used by large enterprises
    
    IMPORTANT: Always connect READ-ONLY. Never write to 1C database.
    """
    
    async def connect(self, connection: OneCConnection) -> bool:
        """Test connection. Returns True if successful."""
    
    async def get_1c_tables(self) -> List[str]:
        """List all 1C tables (they have encoded names like _Document123)."""
    
    async def get_chart_of_accounts(self) -> List[Dict]:
        """
        Fetch account plan — Benela needs this to understand 1C account codes.
        1C account codes follow Uzbek Plan of Accounts (standard in UZ):
        - 5000-5999: Cash and bank accounts
        - 4000-4999: Receivables
        - 6000-6999: Payables
        - 9000-9999: Revenue
        - etc.
        """
    
    async def get_transactions(
        self, 
        date_from: date, 
        date_to: date,
        account_codes: List[str] = None
    ) -> List[Dict]:
        """Fetch journal entries from 1C for a date range."""
    
    async def get_counterparties(self) -> List[Dict]:
        """Fetch all customers and vendors."""
    
    async def get_inventory_balances(self, as_of_date: date) -> List[Dict]:
        """Fetch stock levels as of a specific date."""
    
    async def get_employees(self) -> List[Dict]:
        """Fetch employee list and positions."""
    
    async def get_payroll(self, month: date) -> List[Dict]:
        """Fetch payroll data for a month."""
    
    async def get_sales_docs(self, date_from: date, date_to: date) -> List[Dict]:
        """Fetch реализации (sales invoices)."""
    
    async def get_purchase_docs(self, date_from: date, date_to: date) -> List[Dict]:
        """Fetch поступления (purchase invoices)."""
```

#### `backend/integrations/onec/scheduler.py`

```python
async def run_scheduled_sync(connection_id: int):
    """
    Scheduled sync job — runs at configured interval.
    
    Logic:
    1. Load OneCConnection config
    2. Connect to 1C database
    3. Fetch only NEW records since last_sync_at (incremental)
    4. Run normalizer pipeline
    5. Auto-import (no manual confirmation needed for scheduled syncs)
    6. Update last_sync_at
    7. Send notification to company if errors found
    
    Incremental strategy:
    - Track last synced document date per document type
    - Only fetch documents modified AFTER that date
    - Use 1C's internal modification timestamps where available
    """

# Register with APScheduler in main.py:
# scheduler.add_job(
#     sync_all_active_connections,
#     'interval', 
#     minutes=1,  # check every minute
#     id='onec_sync_check'
# )
```

---

### TIER 3: 1C HTTP SERVICES (Real-time API)

**Purpose:** 1C:Enterprise 8.3+ supports publishing HTTP services. This is the most powerful integration — real-time data, two-way sync possible.

#### `backend/integrations/onec/http_client.py`

```python
class OneCHTTPClient:
    """
    Communicates with 1C via its built-in HTTP services.
    
    The 1C server must have HTTP services configured (by their 1C developer).
    Benela provides a ready-made 1C configuration file (.epf External Processing)
    that companies can install to enable the HTTP endpoints.
    
    Authentication: HTTP Basic Auth over HTTPS
    
    Standard endpoints Benela expects from the 1C HTTP service:
    GET  /hs/benela/v1/balance          — account balances
    GET  /hs/benela/v1/transactions     — recent transactions (with date_from param)
    GET  /hs/benela/v1/counterparties   — customers and vendors
    GET  /hs/benela/v1/inventory        — stock levels
    GET  /hs/benela/v1/employees        — employee list
    GET  /hs/benela/v1/payroll/{month}  — payroll for month
    GET  /hs/benela/v1/documents/sales  — sales invoices
    GET  /hs/benela/v1/ping             — connection test
    """
    
    async def ping(self) -> bool:
        """Test if 1C HTTP service is reachable."""
    
    async def get_realtime_balance(self, account_code: str = None) -> Dict:
        """Get live account balance right now."""
    
    async def get_recent_transactions(self, hours_back: int = 24) -> List[Dict]:
        """Get transactions from last N hours."""
    
    async def get_inventory_snapshot(self) -> List[Dict]:
        """Current stock levels across all warehouses."""
```

---

### THE AI LAYER — 1C-Aware Intelligence

This is the game-changer. Once 1C data flows into Benela, the AI must become dramatically smarter.

#### `backend/agents/data_fetcher.py` — Add 1C context functions

```python
async def get_onec_context(company_id: int) -> str:
    """
    Build rich AI context from synced 1C data.
    
    Returns a structured context string that tells Claude:
    - When data was last synced from 1C
    - What 1C report types have been imported
    - Key financial metrics derived from 1C data
    - Any anomalies detected during normalization
    
    Example output:
    ---
    1C INTEGRATION DATA (last synced: 2025-03-15 14:32):
    
    ACCOUNT BALANCES (from ОСВ):
    - Cash on hand (5010): 45,230,000 UZS
    - Bank account (5110): 287,450,000 UZS  
    - Accounts receivable (4010): 156,780,000 UZS [12 counterparties]
    - Accounts payable (6010): 89,340,000 UZS [8 suppliers]
    
    RECENT ACTIVITY (last 30 days):
    - Revenue from sales: 890,000,000 UZS (47 invoices)
    - Top customer: Tashkent Textile LLC — 234,000,000 UZS (26% of revenue)
    - Cost of goods: 623,000,000 UZS
    - Gross margin: 30.0%
    
    INVENTORY (as of today):
    - Total SKUs: 342
    - Low stock alerts: 14 items below reorder point
    - Most moved item: Article #A-2341 — 1,240 units sold this month
    
    PAYROLL (last month):
    - Total employees: 47
    - Payroll disbursed: 67,800,000 UZS
    - Average salary: 1,442,553 UZS
    ---
    """

async def get_onec_anomalies(company_id: int) -> str:
    """
    Detect and describe anomalies in 1C data for the AI to surface.
    
    Detect:
    - Transactions without counterparties
    - Negative inventory balances
    - Unusual amount spikes (>3x average)
    - Missing payroll months
    - Accounts with zero activity for 90+ days
    - Round-number transactions (potential manual entries)
    - Mismatched debit/credit totals
    """

async def get_onec_cashflow_forecast(company_id: int) -> str:
    """
    Use 1C historical data to generate cash flow projection context.
    
    Logic:
    - Average monthly inflow from last 3 months
    - Known upcoming payables (from 1C AP aging)
    - Receivables due this month (from 1C AR aging)
    - Project 30/60/90 day cash position
    """
```

#### Updated `backend/agents/finance_agent.py`

```python
class FinanceAgent(BaseAgent):
    """
    Enhanced finance agent — aware of 1C data vs manual Benela data.
    
    System prompt additions when 1C data is present:
    
    "You have access to the company's ACTUAL 1C accounting data,
    not just manually entered Benela transactions. This data comes
    from their official accounting system and should be treated as
    the source of truth.
    
    When answering finance questions:
    1. Cite specific account codes when referencing balances
    2. Compare 1C data vs manually entered Benela data if discrepancies exist
    3. Flag if 1C data hasn't been synced in more than 24 hours
    4. Answer in the user's preferred language (Uzbek/Russian)
    5. Use Uzbek sum (UZS) as default currency unless otherwise specified
    6. Reference Uzbek accounting standards (NSBU) when relevant
    7. Never expose raw account codes to users — translate to plain language
    
    You can answer questions like:
    - 'Какой у нас остаток на расчётном счёте?' (What's our bank balance?)
    - 'Кто нам должен больше всего?' (Who owes us the most?)
    - 'Сколько товара X осталось на складе?' (How much of product X is in stock?)
    - 'Почему упала выручка в прошлом месяце?' (Why did revenue drop last month?)
    "
    """
    
    async def chat_with_1c(
        self, 
        message: str, 
        company_id: int,
        include_anomalies: bool = True
    ) -> str:
        """
        Chat endpoint that auto-enriches context with 1C data.
        Falls back gracefully if no 1C integration configured.
        """
```

---

### FRONTEND — 1C Integration UI

#### `frontend/components/OneCPanel.tsx`

Build a dedicated 1C integration panel in the Finance module. Style follows Benela design system (all inline styles, dark theme).

**UI Sections:**

```typescript
// 1. CONNECTION STATUS CARD
// Shows: connected/disconnected, last sync time, sync type (file/db/api)
// Action buttons: "Sync Now", "Configure", "Disconnect"

// 2. FILE IMPORT SECTION  
// Drag & drop zone (dashed border, #7c6aff accent on hover)
// Supported formats listed: .xlsx, .csv, .xml
// Shows: upload progress → parsing progress → preview table → confirm button
// Preview table: first 20 rows with detected column mappings highlighted

// 3. IMPORT HISTORY TABLE
// Columns: Date, Filename, Report Type, Records, Status, Actions
// Status badges: pending (yellow), processing (blue pulse), completed (green), failed (red)
// Click row → see individual record details

// 4. SYNC SETTINGS (Tier 2/3)
// Connection type selector: File | Database | HTTP API
// Form fields per type with masked password input
// Test Connection button with real-time feedback
// Sync schedule: Hourly / Every 6h / Daily / Manual only

// 5. DATA HEALTH DASHBOARD
// Mini cards: "Last Sync", "Records Imported", "Anomalies Found", "Coverage Period"
// Anomaly list (collapsible): each anomaly with description and suggested action
```

#### `frontend/components/AIPanel.tsx` — Modifications

When 1C data is present, enhance the AI panel:

```typescript
// Add a "Data Source" badge near the input area:
// [Benela Data] or [1C + Benela] — toggleable
// When 1C data source is active, the placeholder changes:
// "Ask anything about your 1C data... (last synced 2h ago)"

// Add quick-action chips above the input for 1C-specific queries:
const ONEC_QUICK_QUERIES = [
  "What's our current bank balance?",
  "Who are our top 5 debtors?", 
  "Show low stock alerts",
  "Compare this month vs last month revenue",
  "What's our payroll cost this month?",
  "Cash flow forecast for next 30 days",
]
// These appear as clickable purple chips — clicking populates the input
```

---

### SECURITY REQUIREMENTS

These are non-negotiable. Think through every one before implementing:

1. **Encryption at rest** — All 1C credentials in `onec_connections` must be encrypted using `cryptography.fernet`. Store the Fernet key in environment variables, never in the database.

2. **Read-only enforcement** — Database connector must use a read-only database user. Validate this on connection: run `SHOW transaction_read_only` and reject if writable.

3. **File validation** — Before parsing any uploaded file:
   - Check MIME type (not just extension)
   - Scan for ZIP bombs (max uncompressed size 100MB)
   - Limit rows per import to 500,000
   - Reject files with macros (xlsm)

4. **Data isolation** — Every query must filter by `company_id`. Never let one company access another's 1C data. Add a `company_id` check at the API middleware level.

5. **Audit trail** — Every import, sync, and AI query that touches 1C data must be logged in `onec_import_jobs` with the user ID who triggered it.

6. **Rate limiting** — File upload endpoint: max 10 uploads per hour per company. Sync endpoint: max 1 sync per 5 minutes per connection.

7. **Credential masking** — Never return raw credentials in API responses. Return masked versions: `***encrypted***` or last 4 chars only.

---

### UZBEK LOCALIZATION REQUIREMENTS

1C is deeply localized for Uzbekistan. Your parser must handle:

```python
UZBEK_SPECIFIC = {
    # Uzbek Plan of Accounts (NSBU standard)
    "account_plan": "uz_nsbu_2024",
    
    # Tax types in Uzbek 1C
    "tax_codes": {
        "QQS": "VAT (12%)",           # Қўшилган қиймат солиғи
        "INPS": "Social tax (12%)",   # Ижтимоий суғурта бадали
        "JShDSh": "Personal income tax (12%)",  # Жисмоний шахслардан даромад солиғи
        "Yer soligi": "Land tax",
    },
    
    # Currency
    "default_currency": "UZS",
    "currency_symbol": "сўм",
    
    # Date format used in Uzbek 1C
    "date_format": "DD.MM.YYYY",
    
    # Number format: space as thousands separator, comma as decimal
    "number_format": "1 234 567,89",
    
    # Common Uzbek counterparty suffixes to recognize
    "legal_forms": ["МЧЖ", "АЖ", "ХК", "ДК", "ФХ", "ЯТТ", "IP", "OOO", "AO"],
    
    # Warehouse names often in Uzbek
    "warehouse_prefixes": ["Склад", "Омбор", "Mahsulot"],
}
```

---

### API RESPONSE STANDARDS

Follow existing Benela backend patterns exactly:

```python
# Success
return {"status": "success", "data": {...}, "message": "Import completed"}

# Error  
raise HTTPException(status_code=422, detail="Could not detect report type. Please specify manually.")

# Async job started
return {"status": "pending", "job_id": 42, "message": "Processing started. Check /onec/import/jobs/42 for status."}
```

---

### ENVIRONMENT VARIABLES TO ADD

```bash
# .env additions
ONEC_ENCRYPTION_KEY=          # Fernet key for credential encryption (generate with Fernet.generate_key())
ONEC_MAX_UPLOAD_MB=50
ONEC_MAX_ROWS_PER_IMPORT=500000
ONEC_SYNC_TIMEOUT_SECONDS=120
```

Add these to `frontend/Dockerfile` ARGs and DigitalOcean backend env vars.

---

### DATABASE MIGRATIONS

Use Alembic. Create migration: `alembic revision --autogenerate -m "add_onec_integration_tables"`

Tables to create:
- `onec_import_jobs`
- `onec_raw_records`  
- `onec_connections`

Indexes to add:
```sql
CREATE INDEX idx_onec_raw_records_company_id ON onec_raw_records(company_id);
CREATE INDEX idx_onec_raw_records_import_job ON onec_raw_records(import_job_id);
CREATE INDEX idx_onec_raw_records_hash ON onec_raw_records(import_hash);
CREATE INDEX idx_onec_import_jobs_company ON onec_import_jobs(company_id, created_at DESC);
CREATE INDEX idx_onec_connections_company ON onec_connections(company_id, is_active);
```

---

### REQUIRED PACKAGES

Add to `backend/requirements.txt`:
```
pandas>=2.0.0          # File parsing
openpyxl>=3.1.0        # Excel reading
chardet>=5.0.0         # Encoding detection (critical for Cyrillic)
cryptography>=41.0.0   # Fernet encryption for credentials
sqlalchemy[asyncio]    # Already present
aiofiles>=23.0.0       # Async file handling
python-multipart       # Already present (needed for file upload)
lxml>=4.9.0            # XML parsing for 1C XML exports
```

---

### TESTING REQUIREMENTS

Create test files in `backend/tests/test_onec/`:

1. `test_file_parser.py` — Unit tests for each parser with sample 1C export fixtures
2. `test_normalizer.py` — Test currency/date normalization edge cases
3. `test_api_upload.py` — Integration test: upload → parse → confirm flow
4. `test_ai_context.py` — Verify 1C context injection into Claude prompts

Include fixture files: sample CSVs/Excel files that look like real 1C exports (use mock data, not real financial data).

---

### DELIVERY CHECKLIST

Before considering this done, verify every item:

- [ ] File upload accepts .xlsx, .csv, .xml
- [ ] Cyrillic headers correctly mapped via ONEC_HEADER_MAP
- [ ] Windows-1251 encoding detected and handled
- [ ] Amounts parse correctly: "1 234 567,89" → Decimal("1234567.89")
- [ ] Dates parse correctly: "15.03.2025" → date(2025, 3, 15)
- [ ] Duplicate detection works via SHA256 hash
- [ ] Two-step import (parse → preview → confirm) implemented
- [ ] Import job status updates in real-time
- [ ] 1C credentials encrypted with Fernet in database
- [ ] AI context includes 1C data when available
- [ ] Quick-query chips in AIPanel for 1C questions
- [ ] Uzbek tax codes handled
- [ ] All routes protected with Supabase auth
- [ ] company_id isolation enforced everywhere
- [ ] Alembic migration created and tested
- [ ] All new packages added to requirements.txt
- [ ] Environment variables documented

---

## FINAL INSTRUCTION TO CODEX

Build this incrementally in this exact order:
1. Database models + Alembic migration
2. File parser (Tier 1) — start with Excel/CSV only
3. Normalizer
4. Background processor
5. API routes (/onec/*)
6. AI context functions in data_fetcher.py
7. Frontend OneCPanel.tsx
8. AIPanel.tsx quick-query chips
9. Database connector (Tier 2)
10. HTTP client (Tier 3)

At each step, write tests before moving to the next. If you encounter ambiguity in the 1C data format, make the most defensive choice — validate strictly, fail loudly with clear error messages, and never silently corrupt financial data.

This integration will be the reason Uzbek companies choose Benela over any competitor. Build it like it matters.
