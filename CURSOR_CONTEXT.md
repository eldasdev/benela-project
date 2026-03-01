# BENELA AI — Owner Admin Dashboard (Super Admin Panel)

## Vision
Build a completely separate, password-protected **Owner Dashboard** at `benela.dev/admin` that gives the platform owner (you) god-level visibility and control over every client, business, subscription, payment, and notification on the platform. This is NOT the end-user dashboard — this is the **command center** for running Benela AI as a business.

Think: Stripe Dashboard × Vercel Admin × Linear — dark, data-dense, professional.

---

## Read First
Read `CURSOR_CONTEXT.md` for full project context before starting. Follow all design rules (inline styles, dark theme, same color tokens).

---

## Architecture Overview

```
benela.dev/admin                    → Admin login (separate from main auth)
benela.dev/admin/dashboard          → Overview & KPIs
benela.dev/admin/clients            → All client organizations
benela.dev/admin/clients/:id        → Single client deep-dive
benela.dev/admin/subscriptions      → All plans & billing
benela.dev/admin/payments           → Payment history & invoices
benela.dev/admin/notifications      → Send notifications to clients
benela.dev/admin/analytics          → Platform-wide analytics
benela.dev/admin/settings           → Admin settings & config
```

Completely separate from the main app. Different layout, different auth guard, different sidebar.

---

## STEP 1 — Backend: Database Models

Add to `backend/database/models.py`:

```python
class PlanTier(str, enum.Enum):
    trial      = "trial"
    starter    = "starter"
    pro        = "pro"
    enterprise = "enterprise"

class PlanStatus(str, enum.Enum):
    active    = "active"
    expired   = "expired"
    cancelled = "cancelled"
    suspended = "suspended"
    trial     = "trial"

class PaymentStatus(str, enum.Enum):
    paid    = "paid"
    pending = "pending"
    failed  = "failed"
    refunded = "refunded"

class NotificationType(str, enum.Enum):
    info    = "info"
    warning = "warning"
    success = "success"
    critical = "critical"

class NotificationTarget(str, enum.Enum):
    all        = "all"
    plan_tier  = "plan_tier"
    specific   = "specific"

class ClientOrg(Base):
    """Represents a business/enterprise using Benela AI"""
    __tablename__ = "client_orgs"
    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(255), nullable=False)          # Company name
    slug           = Column(String(100), unique=True, nullable=False)  # e.g. "acme-corp"
    owner_name     = Column(String(255), nullable=False)          # Primary contact
    owner_email    = Column(String(255), unique=True, nullable=False)
    owner_phone    = Column(String(50), nullable=True)
    industry       = Column(String(100), nullable=True)           # e.g. "SaaS", "Finance"
    company_size   = Column(String(50), nullable=True)            # e.g. "1-10", "50-200"
    country        = Column(String(100), nullable=True)
    logo_url       = Column(String(500), nullable=True)
    is_active      = Column(Boolean, default=True)
    is_suspended   = Column(Boolean, default=False)
    notes          = Column(Text, nullable=True)                  # Internal admin notes
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())

class Subscription(Base):
    """A client's plan subscription"""
    __tablename__ = "subscriptions"
    id             = Column(Integer, primary_key=True, index=True)
    client_id      = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"))
    plan_tier      = Column(Enum(PlanTier), nullable=False)
    status         = Column(Enum(PlanStatus), default=PlanStatus.trial)
    price_monthly  = Column(Float, nullable=False)               # Monthly price in USD
    seats          = Column(Integer, default=10)                  # Max user seats
    modules        = Column(String(500), default="finance,hr")   # Comma-separated enabled modules
    billing_cycle  = Column(String(20), default="monthly")       # monthly / annual
    trial_ends_at  = Column(DateTime, nullable=True)
    current_period_start = Column(DateTime, default=func.now())
    current_period_end   = Column(DateTime, nullable=True)
    cancelled_at   = Column(DateTime, nullable=True)
    cancel_reason  = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())

class Payment(Base):
    """Individual payment records"""
    __tablename__ = "payments"
    id              = Column(Integer, primary_key=True, index=True)
    client_id       = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"))
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    amount          = Column(Float, nullable=False)
    currency        = Column(String(10), default="USD")
    status          = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    payment_method  = Column(String(50), nullable=True)          # card, bank_transfer, etc.
    transaction_id  = Column(String(255), nullable=True)         # External payment ref
    description     = Column(String(500), nullable=True)
    invoice_number  = Column(String(100), nullable=True)
    paid_at         = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=func.now())

class AdminNotification(Base):
    """Notifications sent by admin to clients"""
    __tablename__ = "admin_notifications"
    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String(255), nullable=False)
    message        = Column(Text, nullable=False)
    type           = Column(Enum(NotificationType), default=NotificationType.info)
    target         = Column(Enum(NotificationTarget), default=NotificationTarget.all)
    target_value   = Column(String(255), nullable=True)  # plan tier name OR client id(s)
    is_sent        = Column(Boolean, default=False)
    sent_at        = Column(DateTime, nullable=True)
    recipient_count = Column(Integer, default=0)
    created_at     = Column(DateTime, default=func.now())

class ClientActivity(Base):
    """Audit log of client actions and admin actions"""
    __tablename__ = "client_activity"
    id          = Column(Integer, primary_key=True, index=True)
    client_id   = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"))
    action      = Column(String(255), nullable=False)   # e.g. "Plan upgraded to Pro"
    actor       = Column(String(100), nullable=True)    # "admin" or user email
    metadata    = Column(Text, nullable=True)            # JSON string for extra data
    created_at  = Column(DateTime, default=func.now())
```

---

## STEP 2 — Backend: Schemas

Create `backend/database/admin_schemas.py`:

```python
# ClientOrg schemas
class ClientCreate(BaseModel):
    name, slug, owner_name, owner_email, owner_phone, industry, company_size, country, notes

class ClientUpdate(BaseModel):
    # all fields optional

class ClientOut(BaseModel):
    id, name, slug, owner_name, owner_email, owner_phone, industry,
    company_size, country, is_active, is_suspended, notes, created_at
    class Config: from_attributes = True

# Subscription schemas
class SubscriptionCreate(BaseModel):
    client_id, plan_tier, status, price_monthly, seats, modules, billing_cycle

class SubscriptionUpdate(BaseModel):
    # all optional — for upgrades/downgrades/cancellations

class SubscriptionOut(BaseModel):
    id, client_id, plan_tier, status, price_monthly, seats, modules,
    billing_cycle, trial_ends_at, current_period_start, current_period_end,
    cancelled_at, created_at
    class Config: from_attributes = True

# Payment schemas
class PaymentCreate(BaseModel):
    client_id, amount, currency, status, payment_method, description, invoice_number

class PaymentOut(BaseModel):
    id, client_id, subscription_id, amount, currency, status,
    payment_method, transaction_id, description, invoice_number, paid_at, created_at
    class Config: from_attributes = True

# Notification schemas
class NotificationCreate(BaseModel):
    title: str
    message: str
    type: NotificationType
    target: NotificationTarget
    target_value: Optional[str] = None  # "pro" for plan tier, "1,2,3" for specific clients

class NotificationOut(BaseModel):
    id, title, message, type, target, target_value, is_sent,
    sent_at, recipient_count, created_at
    class Config: from_attributes = True
```

---

## STEP 3 — Backend: CRUD

Create `backend/database/admin_crud.py`:

```python
# Platform-wide summary (for admin overview dashboard)
def get_platform_summary(db):
    total_clients  = db.query(func.count(ClientOrg.id)).scalar() or 0
    active_clients = db.query(func.count(ClientOrg.id)).filter(ClientOrg.is_active == True).scalar() or 0
    suspended      = db.query(func.count(ClientOrg.id)).filter(ClientOrg.is_suspended == True).scalar() or 0
    total_mrr      = db.query(func.sum(Subscription.price_monthly)).filter(Subscription.status == "active").scalar() or 0
    trial_count    = db.query(func.count(Subscription.id)).filter(Subscription.status == "trial").scalar() or 0
    paid_this_month = db.query(func.sum(Payment.amount)).filter(
        Payment.status == "paid",
        Payment.paid_at >= datetime.now().replace(day=1)
    ).scalar() or 0
    plan_breakdown = {
        tier: db.query(func.count(Subscription.id)).filter(
            Subscription.plan_tier == tier, Subscription.status == "active"
        ).scalar() or 0
        for tier in ["trial", "starter", "pro", "enterprise"]
    }
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "suspended": suspended,
        "monthly_recurring_revenue": round(total_mrr, 2),
        "paid_this_month": round(paid_this_month, 2),
        "trials_active": trial_count,
        "plan_breakdown": plan_breakdown,
    }

# Clients with their subscription joined
def get_clients_with_subscriptions(db):
    clients = db.query(ClientOrg).order_by(ClientOrg.created_at.desc()).all()
    result = []
    for c in clients:
        sub = db.query(Subscription).filter(Subscription.client_id == c.id).order_by(Subscription.created_at.desc()).first()
        result.append({ "client": c, "subscription": sub })
    return result

# Revenue over last 12 months (for chart)
def get_revenue_chart(db):
    # Returns list of { month: "Jan 2025", revenue: 4200.0 }
    ...

# All clients, subscriptions, payments, notifications CRUD
# send_notification — marks is_sent=True, sets sent_at, calculates recipient_count
# log_activity — creates ClientActivity record
# suspend_client / unsuspend_client / cancel_subscription
```

---

## STEP 4 — Backend: Admin API Router

Create `backend/api/admin.py`:

```python
router = APIRouter(prefix="/admin", tags=["Admin"])

# --- Overview ---
@router.get("/summary")                          # Platform KPIs

# --- Clients ---
@router.get("/clients")                          # All clients + their subscriptions
@router.get("/clients/{id}")                     # Single client full profile
@router.post("/clients")                         # Create new client
@router.put("/clients/{id}")                     # Update client
@router.delete("/clients/{id}")                  # Delete client
@router.patch("/clients/{id}/suspend")           # Suspend client
@router.patch("/clients/{id}/unsuspend")         # Unsuspend client

# --- Subscriptions ---
@router.get("/subscriptions")                    # All subscriptions
@router.get("/subscriptions/{id}")
@router.post("/subscriptions")                   # Create subscription for a client
@router.put("/subscriptions/{id}")               # Upgrade / downgrade / change plan
@router.patch("/subscriptions/{id}/cancel")      # Cancel with reason

# --- Payments ---
@router.get("/payments")                         # All payments (filterable by status/client)
@router.get("/payments/client/{client_id}")      # Payments for specific client
@router.post("/payments")                        # Record manual payment
@router.patch("/payments/{id}/status")           # Mark as paid/failed/refunded

# --- Notifications ---
@router.get("/notifications")                    # All sent + draft notifications
@router.post("/notifications")                   # Create notification
@router.post("/notifications/{id}/send")         # Send notification to targets
@router.delete("/notifications/{id}")            # Delete draft

# --- Activity ---
@router.get("/activity")                         # Global activity log
@router.get("/activity/client/{client_id}")      # Client-specific activity

# --- Analytics ---
@router.get("/analytics/revenue")               # Monthly revenue chart data
@router.get("/analytics/growth")                # Client growth over time
@router.get("/analytics/churn")                 # Cancellations / churn rate
```

Register in `main.py`:
```python
from api.admin import router as admin_router
app.include_router(admin_router)
```

---

## STEP 5 — Frontend: Admin Route Group

Create this folder structure:
```
frontend/app/
├── admin/
│   ├── layout.tsx          ← Admin layout (different sidebar)
│   ├── page.tsx            ← Redirects to /admin/dashboard
│   ├── login/page.tsx      ← Separate admin login
│   └── dashboard/
│       └── page.tsx        ← Main admin page
```

---

## STEP 6 — Admin Login Page

`frontend/app/admin/login/page.tsx`:

- Completely separate from the main login
- Shows "Admin Access" with a lock icon
- Simple email + password form
- Hardcode admin credentials check OR use a separate Supabase role check:
  ```ts
  // After Supabase login, check if user has admin metadata
  const { data } = await getSupabase().auth.getUser();
  if (data.user?.user_metadata?.role !== "admin") {
    // not admin — redirect to main login
    router.push("/login");
  }
  ```
- On success → redirect to `/admin/dashboard`
- Subtle red accent instead of purple to visually distinguish from user login:
  - Accent color: `#ef4444` instead of `#7c6aff`
  - Badge: "ADMIN PANEL" in red above the form

---

## STEP 7 — Admin Layout

`frontend/app/admin/layout.tsx`:

A completely different layout from the main app. Left sidebar with admin navigation:

```
┌─────────────────────────────────────────────────────────┐
│  🔴 BENELA ADMIN   [badge: OWNER]                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  NAVIGATION                                             │
│  ▸ Overview          (LayoutDashboard icon)             │
│  ▸ Clients           (Building2 icon)                   │
│  ▸ Subscriptions     (CreditCard icon)                  │
│  ▸ Payments          (DollarSign icon)                  │
│  ▸ Notifications     (Bell icon)                        │
│  ▸ Analytics         (TrendingUp icon)                  │
│  ▸ Settings          (Settings icon)                    │
│                                                         │
│  ─────────────────────                                  │
│                                                         │
│  QUICK STATS                                            │
│  MRR: $X,XXX                                            │
│  Clients: XX                                            │
│  Trials: X                                              │
│                                                         │
│  ─────────────────────                                  │
│  [← Back to Platform]    [Logout]                       │
└─────────────────────────────────────────────────────────┘
```

---

## STEP 8 — Admin Dashboard Page (Overview)

`frontend/app/admin/dashboard/page.tsx` — the main admin view.

### Top KPI Row (6 cards)
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  MRR     │ │ Clients  │ │ Active   │ │ Trials   │ │ Paid/Mo  │ │Suspended │
│ $12,400  │ │   48     │ │   41     │ │    6     │ │  $8,200  │ │    2     │
│ +8% ↑   │ │ +3 ↑    │ │ 85%     │ │ → 3 pro  │ │          │ │ ⚠       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Card accent colors:
- MRR → #34d399 (green)
- Total Clients → #60a5fa (blue)
- Active → #7c6aff (purple)
- Trials → #fbbf24 (yellow)
- Paid This Month → #34d399 (green)
- Suspended → #f87171 (red)

### Plan Breakdown Row
4 mini cards side by side:
```
Trial: 6    Starter: 14    Pro: 22    Enterprise: 6
```
Each with colored left border and count.

### Two-column layout below
**Left (60%) — Revenue Chart:**
- Simple bar chart using pure CSS (no chart library needed)
- Last 12 months of revenue as vertical bars
- Each bar has height proportional to revenue
- Month label below, amount on hover tooltip
- Title: "Monthly Revenue" with total YTD

```tsx
// Pure CSS bar chart
const maxRevenue = Math.max(...chartData.map(d => d.revenue));
{chartData.map(d => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
    <span style={{ fontSize: "10px", color: "#555" }}>${(d.revenue/1000).toFixed(1)}k</span>
    <div style={{
      width: "32px",
      height: `${(d.revenue / maxRevenue) * 160}px`,
      background: "linear-gradient(180deg, #7c6aff, #4f3de8)",
      borderRadius: "4px 4px 0 0",
      minHeight: "4px",
      transition: "opacity 0.15s",
      cursor: "pointer"
    }} />
    <span style={{ fontSize: "10px", color: "#333" }}>{d.month}</span>
  </div>
))}
```

**Right (40%) — Recent Activity Feed:**
- Live feed of latest client actions
- Each item: icon + action text + client name + time ago
- Icons: UserPlus (new client), CreditCard (payment), AlertTriangle (suspension), ArrowUp (upgrade)
- Color coded by type
- "View all activity →" link at bottom

### Bottom — Recent Clients Table
Last 10 clients with columns:
`Company | Owner | Plan | Status | MRR | Joined | Actions`

Actions: View profile button.

---

## STEP 9 — Clients Page

`frontend/app/admin/dashboard/clients.tsx` (or separate route):

### Header
- Title "Clients" + subtitle "X total organizations"
- Search bar (filter by name/email in real-time)
- Filter dropdown: All / Active / Suspended / Trial
- "+ Add Client" button (purple)

### Client Cards Grid (or table toggle)

**Card View** — 3 per row:
```
┌──────────────────────────────────┐
│  [Logo/Avatar]  Acme Corp        │
│                 acme-corp        │
│                                  │
│  John Doe · john@acme.com       │
│  🏢 SaaS  👥 50-200  🌍 US     │
│                                  │
│  ┌─────────┐  MRR: $149/mo      │
│  │  PRO   │  Seats: 25/50       │
│  └─────────┘  Status: ● Active  │
│                                  │
│  [View Profile]  [⚙ Actions ▾] │
└──────────────────────────────────┘
```

**Actions dropdown** on each card:
- Edit Client
- Manage Subscription
- View Payments
- Send Notification
- Suspend Client (red)
- Delete Client (red)

### Client Profile Modal or Page (`/admin/clients/:id`)

Full-page deep-dive when "View Profile" clicked:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Clients                                              │
│                                                                 │
│  [Avatar] ACME CORP                    [Edit] [Suspend] [Delete]│
│           John Doe · john@acme.com                              │
│           SaaS · 50-200 employees · United States               │
│                                                                 │
├────────────────────────┬────────────────────────────────────────┤
│  SUBSCRIPTION          │  PAYMENT HISTORY                       │
│  ┌──────────────────┐  │  INV-001  $149  ● Paid   Feb 1, 2025  │
│  │  PRO PLAN        │  │  INV-002  $149  ● Paid   Jan 1, 2025  │
│  │  $149/mo         │  │  INV-003  $149  ● Failed Dec 1, 2024  │
│  │  25/50 seats     │  │  [View all payments →]                 │
│  │  Renews Mar 1    │  │                                        │
│  │  [Upgrade Plan]  │  │                                        │
│  │  [Cancel]        │  │                                        │
│  └──────────────────┘  │                                        │
│                        │                                        │
│  ENABLED MODULES       │  ACTIVITY LOG                          │
│  ✓ Finance             │  ● Plan upgraded to Pro    2 days ago  │
│  ✓ HR                  │  ● Payment received $149   3 days ago  │
│  ✗ Sales               │  ● Account created         30 days ago │
│  ✗ Support             │                                        │
│  [Edit modules]        │                                        │
│                        │                                        │
│  INTERNAL NOTES        │                                        │
│  [Textarea - editable] │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

---

## STEP 10 — Subscriptions Page

Table view of ALL subscriptions across all clients:

Columns: `Client | Plan | Status | Price | Seats | Billing | Period End | Actions`

- Color-coded plan badges:
  - trial → #fbbf24 yellow
  - starter → #60a5fa blue
  - pro → #7c6aff purple
  - enterprise → #f59e0b gold

- Status badges same pattern as other modules

- Filters: Plan tier dropdown + Status dropdown

- Bulk actions checkbox: "Upgrade selected", "Send reminder"

- "Expiring Soon" tab — shows subscriptions ending in next 7 days (highlighted in amber)

---

## STEP 11 — Payments Page

Full payment history table:

Columns: `Invoice # | Client | Amount | Method | Status | Date | Actions`

- Summary row at top: Total Collected, Pending, Failed (this month)
- Filter by: Status / Date range / Client
- Failed payments highlighted with red left border
- "Mark as Paid" button on pending payments
- "Retry" button on failed payments
- "Refund" button on paid payments (with confirmation modal)
- Export button (CSV download of filtered results)

---

## STEP 12 — Notifications Center

The most powerful feature. Send targeted messages to clients.

### Left Panel — Compose Notification
```
┌─────────────────────────────┐
│  COMPOSE NOTIFICATION       │
│                             │
│  Title                      │
│  [_________________________]│
│                             │
│  Message                    │
│  [                         ]│
│  [    (textarea)           ]│
│  [_________________________]│
│                             │
│  Type                       │
│  ○ Info  ○ Warning          │
│  ○ Success  ○ Critical      │
│                             │
│  Send To                    │
│  ○ All clients (48)         │
│  ○ By plan tier             │
│    [Trial ▾] (6 clients)   │
│  ○ Specific clients         │
│    [Search clients...]      │
│                             │
│  Preview: 6 recipients      │
│                             │
│  [Save Draft] [Send Now →] │
└─────────────────────────────┘
```

### Right Panel — Sent History
List of all sent notifications:
- Title + type badge + sent date
- "X recipients" count
- Preview of message (truncated)
- Resend button (sends again to same target)

### Notification type colors:
- info → #60a5fa (blue bell icon)
- warning → #fbbf24 (triangle icon)
- success → #34d399 (check icon)
- critical → #f87171 (red alert icon)

---

## STEP 13 — Analytics Page

Pure CSS charts (no external libraries).

### Row 1 — Revenue Chart (full width)
Monthly revenue bar chart for last 12 months (same as overview but bigger).

### Row 2 — Two charts side by side

**Left — Client Growth Line Chart (CSS)**
Show cumulative client count by month:
```tsx
// Simple CSS line approximation using borders
// Plot points as dots connected by a line
// Use SVG for actual line if needed — simple polyline
<svg width="100%" height="200">
  <polyline
    points={chartData.map((d, i) => `${(i / (chartData.length-1)) * 100}%,${100 - (d.count / maxCount) * 80}%`).join(" ")}
    fill="none" stroke="#7c6aff" strokeWidth="2"
  />
  {chartData.map((d, i) => (
    <circle cx={`${(i / (chartData.length-1)) * 100}%`} cy={`${100 - (d.count / maxCount) * 80}%`} r="4" fill="#7c6aff" />
  ))}
</svg>
```

**Right — Plan Distribution Donut (CSS)**
Donut chart using conic-gradient:
```tsx
const total = Object.values(planBreakdown).reduce((a, b) => a + b, 0);
// Calculate percentages and build conic-gradient
const gradient = `conic-gradient(
  #fbbf24 0% ${trial_pct}%,
  #60a5fa ${trial_pct}% ${trial_pct + starter_pct}%,
  #7c6aff ${trial_pct + starter_pct}% ${trial_pct + starter_pct + pro_pct}%,
  #f59e0b ${trial_pct + starter_pct + pro_pct}% 100%
)`;

<div style={{ width: "160px", height: "160px", borderRadius: "50%", background: gradient, position: "relative" }}>
  {/* Hole in center */}
  <div style={{ position: "absolute", inset: "30px", borderRadius: "50%", background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f5" }}>{total}</span>
  </div>
</div>
```

### Row 3 — Stats Table
Monthly breakdown table: Month | New Clients | Churned | Net | Revenue | MRR Change

---

## STEP 14 — Seed Admin Data

Add to `backend/seed.py`:

```python
from database.models import ClientOrg, Subscription, Payment, AdminNotification, ClientActivity
from database.models import PlanTier, PlanStatus, PaymentStatus, NotificationType, NotificationTarget

clients = [
    ClientOrg(name="Acme Corp",      slug="acme-corp",      owner_name="John Doe",    owner_email="john@acme.com",    industry="SaaS",     company_size="50-200",  country="US"),
    ClientOrg(name="TechStart Ltd",  slug="techstart",      owner_name="Jane Smith",  owner_email="jane@techstart.com", industry="Tech",   company_size="10-50",   country="UK"),
    ClientOrg(name="GlobalCo",       slug="globalco",       owner_name="Mike Brown",  owner_email="mike@globalco.com",  industry="Finance", company_size="200+",   country="DE"),
    ClientOrg(name="FastGrow Inc",   slug="fastgrow",       owner_name="Amy Lee",     owner_email="amy@fastgrow.com",   industry="E-comm",  company_size="1-10",   country="US"),
    ClientOrg(name="NovaCorp",       slug="novacorp",       owner_name="Bob Wilson",  owner_email="bob@novacorp.com",   industry="Health",  company_size="10-50",  country="CA"),
    ClientOrg(name="Innovate Ltd",   slug="innovate",       owner_name="Sara Jones",  owner_email="sara@innovate.com",  industry="Legal",   company_size="1-10",   country="AU"),
]
db.add_all(clients); db.flush()

subscriptions = [
    Subscription(client_id=clients[0].id, plan_tier=PlanTier.pro,        status=PlanStatus.active,  price_monthly=149, seats=50,  modules="finance,hr,sales,support"),
    Subscription(client_id=clients[1].id, plan_tier=PlanTier.starter,    status=PlanStatus.active,  price_monthly=49,  seats=10,  modules="finance,hr"),
    Subscription(client_id=clients[2].id, plan_tier=PlanTier.enterprise, status=PlanStatus.active,  price_monthly=499, seats=200, modules="finance,hr,sales,support,legal,marketing,supply_chain,procurement,insights"),
    Subscription(client_id=clients[3].id, plan_tier=PlanTier.trial,      status=PlanStatus.trial,   price_monthly=0,   seats=5,   modules="finance,hr"),
    Subscription(client_id=clients[4].id, plan_tier=PlanTier.starter,    status=PlanStatus.active,  price_monthly=49,  seats=10,  modules="finance,hr"),
    Subscription(client_id=clients[5].id, plan_tier=PlanTier.trial,      status=PlanStatus.trial,   price_monthly=0,   seats=5,   modules="finance"),
]
db.add_all(subscriptions); db.flush()

payments = [
    Payment(client_id=clients[0].id, amount=149, status=PaymentStatus.paid,    description="Pro Plan - February 2025", invoice_number="ADM-001"),
    Payment(client_id=clients[0].id, amount=149, status=PaymentStatus.paid,    description="Pro Plan - January 2025",  invoice_number="ADM-002"),
    Payment(client_id=clients[2].id, amount=499, status=PaymentStatus.paid,    description="Enterprise - February",    invoice_number="ADM-003"),
    Payment(client_id=clients[1].id, amount=49,  status=PaymentStatus.pending, description="Starter Plan - March",     invoice_number="ADM-004"),
    Payment(client_id=clients[4].id, amount=49,  status=PaymentStatus.failed,  description="Starter Plan - February",  invoice_number="ADM-005"),
]
db.add_all(payments)
db.commit()
```

---

## STEP 15 — Admin Auth Guard

Create `frontend/app/admin/layout.tsx`:

```tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") { setAuthed(true); return; }
    getSupabase().auth.getUser().then(({ data }) => {
      const isAdmin = data.user?.user_metadata?.role === "admin";
      if (!data.user || !isAdmin) router.push("/admin/login");
      else setAuthed(true);
    });
  }, []);

  if (!authed) return <LoadingSpinner />;
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#060608" }}>
      <AdminSidebar />
      <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
```

To make yourself admin in Supabase:
1. Go to Supabase dashboard → Authentication → Users
2. Find your user → click → Edit → Add to user_metadata: `{ "role": "admin" }`

---

## Design Rules for Admin Panel

Use slightly different dark tones to feel distinct from the main app:

```
Page background:  #060608  (slightly darker than main app's #080808)
Sidebar:          #0a0a0f
Cards:            #0e0e14
Borders:          #1e1e2a
Admin accent:     #ef4444 (red — power/danger feel for owner tools)
Secondary accent: #7c6aff (same purple for non-destructive actions)
```

The admin panel should FEEL more powerful and serious than the client app. Tighter spacing, more data per screen, denser tables.

---

## File Checklist

### Backend
- [ ] `database/models.py` — add 5 new models
- [ ] `database/admin_schemas.py` — new file with all admin schemas
- [ ] `database/admin_crud.py` — new file with all admin CRUD
- [ ] `api/admin.py` — new file with all admin routes
- [ ] `main.py` — register admin router
- [ ] `seed.py` — add client/subscription/payment seed data

### Frontend
- [ ] `app/admin/login/page.tsx` — admin-only login
- [ ] `app/admin/layout.tsx` — admin layout with auth guard
- [ ] `app/admin/page.tsx` — redirect to /admin/dashboard
- [ ] `app/admin/dashboard/page.tsx` — overview with KPIs + charts + tables
- [ ] `components/admin/AdminSidebar.tsx` — admin navigation
- [ ] `components/admin/ClientsView.tsx` — clients grid + search + filter
- [ ] `components/admin/ClientProfile.tsx` — single client deep-dive
- [ ] `components/admin/SubscriptionsView.tsx` — subscriptions table
- [ ] `components/admin/PaymentsView.tsx` — payments table + actions
- [ ] `components/admin/NotificationsView.tsx` — compose + history
- [ ] `components/admin/AnalyticsView.tsx` — charts + stats table

---

## Expected Final Result

1. Go to `benela.dev/admin` → redirected to `/admin/login`
2. Login with admin credentials → enters admin dashboard
3. Overview shows real MRR, client count, plan breakdown, revenue chart
4. Clients page shows all organizations with plan badges and actions
5. Can create, edit, suspend, delete any client
6. Can manage subscriptions — upgrade/downgrade/cancel any plan
7. Can view and manage all payments — mark paid, retry failed, refund
8. Can compose notifications and blast them to all/filtered/specific clients
9. Analytics shows growth charts and monthly breakdown
10. All data persists to PostgreSQL
11. Completely separate from the main client app — different URL, different auth, different design