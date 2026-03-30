# Benela 1C Setup Guide for Client Finance Dashboards

This guide explains how a client team connects 1C:Enterprise data to Benela's Finance dashboard and finance AI assistant.

It is written for two working roles:
- Finance operators who need to upload or validate accounting data inside Benela
- IT administrators or 1C specialists who prepare exports, read-only database access, or 1C HTTP endpoints

A successful setup means:
- 1C data is visible in the Finance module
- imports or sync jobs complete without cross-company leakage
- anomalies and coverage period are visible in the 1C panel
- the finance AI assistant can answer questions using `1C + Benela` data

If you need the fastest onboarding path, start with the file import bridge. If you need scheduled or near-real-time updates, use direct database sync or HTTP API sync.

Implementation references used by this guide:
- [1C panel UI](../frontend/components/OneCPanel.tsx)
- [Finance page integration](../frontend/components/FinancePage.tsx)
- [1C client library](../frontend/lib/onec.ts)
- [1C API router](../backend/api/onec.py)
- [1C service layer](../backend/integrations/onec/service.py)
- [1C parser](../backend/integrations/onec/file_parser.py)
- [1C DB connector](../backend/integrations/onec/db_connector.py)
- [1C HTTP client](../backend/integrations/onec/http_client.py)
- [1C scheduler](../backend/integrations/onec/scheduler.py)
- [AI context fetcher](../backend/agents/data_fetcher.py)

## 1. Overview

Benela currently supports three 1C integration modes.

| Integration mode | Best for | Data freshness | Client-side access required | Recommendation |
| --- | --- | --- | --- | --- |
| File import bridge | Fast onboarding, pilots, finance teams working from exported reports | Manual, per upload | Ability to export 1C reports to `.xlsx`, `.csv`, or `.xml` | Recommended for fastest initial rollout |
| Database direct sync | Companies that want scheduled sync from a central 1C database | Scheduled, based on sync interval | Read-only DB credentials and network reachability | Recommended for stable scheduled integration |
| HTTP API sync | Companies with strong 1C technical support and published HTTP services | Near-real-time or frequent sync | HTTPS endpoint, Basic Auth credentials, 1C developer/admin support | Recommended when you want the strongest live integration |

### Choose the right setup path

Use file import if:
- you do not have server or database access
- you are in pilot or onboarding phase
- manual uploads every day, week, or month are acceptable

Use database sync if:
- your IT team can provide read-only credentials
- Benela must poll data on a schedule
- your 1C backend is PostgreSQL or an approved file-mode source

Use HTTP API if:
- your 1C team can publish HTTPS endpoints
- you want the cleanest operational sync path
- you need more live access than manual file uploads provide

## 2. What the integration powers in Benela

Once connected, 1C data affects these surfaces:
- The Finance module, where the 1C panel is mounted inside [`FinancePage.tsx`](../frontend/components/FinancePage.tsx)
- The dedicated 1C integration panel in [`OneCPanel.tsx`](../frontend/components/OneCPanel.tsx)
- Import history, preview rows, confirm-import flow, and sync health indicators
- Coverage period and anomaly indicators shown in the panel overview
- The finance AI assistant in [`AIPanel.tsx`](../frontend/components/AIPanel.tsx), including `Data Source` switching between Benela-only and `1C + Benela`

The current panel supports these core actions:
- Upload a file export and preview normalized rows before confirmation
- Review import history and row counts
- Create, update, test, sync, or remove a 1C connection
- Monitor anomalies and coverage period
- Trigger a manual sync when a connection exists

## 3. Prerequisites

### Client-side operational prerequisites
- An active Benela client workspace with linked company billing context
- Access to the Finance module in Benela
- A finance operator who knows which 1C reports should be imported
- Permission to export reports from 1C, or support from the client's IT or 1C specialist

### IT and integration prerequisites

For file import:
- Ability to export `.xlsx`, `.csv`, or `.xml` from 1C
- Ability to convert `.mxl` into `.csv` or `.xlsx` before upload

For database sync:
- Read-only database credentials only
- Host, port, database name, username, and password
- Network path from Benela backend to the target database
- Confirmation that direct MSSQL sync is not enabled in this build

For HTTP API sync:
- A published 1C HTTP service over HTTPS
- Basic Auth username and password
- A base URL that Benela can reach from the backend
- Client 1C developer or administrator support to maintain the endpoint

### Platform and environment notes
These are server-side Benela settings. Clients do not type them into the dashboard, but they matter for deployment and support:
- `ONEC_ENCRYPTION_KEY`
- `ONEC_MAX_UPLOAD_MB`
- `ONEC_MAX_ROWS_PER_IMPORT`
- `ONEC_SYNC_TIMEOUT_SECONDS`

These are loaded from backend configuration in [`backend/core/config.py`](../backend/core/config.py).

## 4. Data types supported

### Supported report and data types
The current parser and routes support these primary 1C data categories:
- cash flow
- sales
- inventory
- payroll
- trial balance
- account card
- account analysis
- reconciliation
- counterparties

### Supported file types
- `.xlsx`
- `.csv`
- `.xml`
- `.mxl` is not parsed directly and must be converted before upload

### Important note about what becomes a first-class Benela record
At the moment:
- cash flow imports can map into Benela finance transactions
- sales imports can map into Benela invoices
- inventory and payroll imports are preserved for audit, anomaly detection, and AI context, even if they do not yet become full standalone tables in the Finance UI

## 5. Integration path selection

Use this decision rule before configuring the panel:

1. Choose `File bridge` if you need to start immediately with exported files.
2. Choose `Database` if you have a central 1C database and can grant safe read-only access.
3. Choose `HTTP API` if the client's 1C team can publish and maintain a stable HTTPS service.

Do not choose database sync unless the client can supply read-only credentials. Benela explicitly rejects writable database access.

## 6. File import setup

The file import bridge is the correct starting point for most new client rollouts.

### Step-by-step procedure
1. Open the Finance module in Benela.
2. Find the `1C integration` card and the `1C bridge` panel.
3. In `File import bridge`, choose a `Report type hint` or leave it on auto-detect.
4. Optionally download a Benela sample template.
   - The current panel exposes cash flow sample download buttons directly.
   - The backend also supports templates for `cash_flow`, `sales`, `inventory`, and `payroll` through `/onec/import/template/{report_type}`.
5. Export the needed report from 1C.
6. Upload the file by clicking the drop zone or dragging the file into it.
7. Wait for the parse job to finish.
8. Open the job from `Import history`.
9. Review the preview rows in `Preview and data health`.
10. If the preview is correct, click `Confirm import`.
11. Recheck Finance transactions or invoices, depending on the report type you imported.

### What happens during upload
The upload path is handled by [`backend/api/onec.py`](../backend/api/onec.py) and the parser pipeline under [`backend/integrations/onec/`](../backend/integrations/onec).

Benela will:
- validate file type and file size
- reject macro-enabled Excel files
- parse the uploaded file in the background
- detect or use the provided report type hint
- normalize headers and values
- store raw and normalized rows for audit
- show preview rows before anything is imported into core finance tables

### Preview and confirm behavior
The preview stage is parse-only. It does not write Finance transactions or invoices yet.

Before confirmation:
- rows can be marked as `ready`, `duplicate`, or `failed`
- duplicates are detected before import
- failed rows remain visible for audit and troubleshooting
- preview rows show normalized values, not only raw source fields

After confirmation:
- supported record types are written into Benela tables
- transactions are inserted into `transactions`
- sales documents are inserted into `invoices`
- duplicate rows are skipped rather than silently duplicated

### File import routes used by the panel
Benela uses these routes for the import bridge:
- `/onec/import/upload`
- `/onec/import/jobs`
- `/onec/import/jobs/{id}`
- `/onec/import/jobs/{id}/records`
- `/onec/import/jobs/{id}/confirm`
- `/onec/import/template/{report_type}`

## 7. Direct database sync setup

This path is for companies that want scheduled read-only sync from their 1C database.

### Client IT preparation
The client IT team must provide:
- a read-only database account only
- host or file-mode path
- port
- database name
- username and password
- firewall or network allowances so Benela can reach the database

Current implementation notes from [`db_connector.py`](../backend/integrations/onec/db_connector.py):
- PostgreSQL is supported
- file-mode `1CD` is supported through read-only file access flow
- MSSQL direct sync is not enabled in this build
- PostgreSQL connections are verified with `SHOW transaction_read_only`
- writable connections are rejected

### Benela-side configuration steps
1. Open Finance and go to the `Sync settings` section of the 1C panel.
2. Select `Database` as `Connection type`.
3. Fill these fields:
   - `Label`
   - `Database type`
   - `Port`
   - `Host / path`
   - `Database name`
   - `Username`
   - `Password`
4. Set `Sync enabled` if scheduled sync is required.
5. Set the sync interval in minutes.
6. Save the connection.
7. Click `Test connection`.
8. If the test succeeds, click `Sync now` for the first import.
9. Recheck overview, import history, and Finance records.

### Sync verification
A successful direct database setup should show:
- `Connected` in the overview
- a meaningful `Last sync`
- import history rows from the sync process
- updated anomaly count and coverage period if applicable
- Finance data visible when the imported record type maps into Benela finance tables

### Important operational notes
- Direct sync is incremental by last successful sync window, not a full historical reload each time.
- Sync schedule is configured in minutes in the saved connection.
- Use a dedicated read-only user for Benela. Do not reuse an operator account with write privileges.

## 8. HTTP API setup

This is the strongest client setup when the 1C team can publish HTTP services.

### Required endpoint family
The current Benela HTTP client expects these 1C endpoints:
- `/hs/benela/v1/ping`
- `/hs/benela/v1/balance`
- `/hs/benela/v1/transactions`
- `/hs/benela/v1/counterparties`
- `/hs/benela/v1/inventory`
- `/hs/benela/v1/employees`
- `/hs/benela/v1/payroll/{month}`
- `/hs/benela/v1/documents/sales`

Reference: [`backend/integrations/onec/http_client.py`](../backend/integrations/onec/http_client.py)

### Client 1C team preparation
The client's 1C developer or administrator must:
1. Publish the 1C HTTP service over HTTPS.
2. Create Basic Auth credentials for Benela.
3. Confirm the base URL is reachable from the public or private network Benela will use.
4. Confirm the endpoint returns JSON in the expected shape.

### Benela-side configuration steps
1. Open Finance.
2. In `Sync settings`, select `HTTP API`.
3. Fill these fields:
   - `Label`
   - `API base URL`
   - `Username`
   - `Password`
   - `Version`
4. Set `Sync enabled` and sync interval if needed.
5. Save the connection.
6. Click `Test connection`.
7. If it succeeds, click `Sync now`.
8. Review overview, history, and anomaly output.

### Verification
A correct HTTP API setup should produce:
- successful ping result from the test action
- completed import jobs after sync
- updated last sync time and status
- imported or ready rows visible in overview and job history

## 9. Security model

The 1C integration is designed to enforce strict operational controls.

### Credentials
- Database and HTTP credentials are encrypted at rest using Fernet.
- Encryption and decryption logic lives in [`security.py`](../backend/integrations/onec/security.py).
- The UI receives masked values, not raw credentials.
- Credential masking is handled through the connection serialization path in [`service.py`](../backend/integrations/onec/service.py).

### File safety
Before parsing an uploaded file, Benela validates:
- filename and supported extension
- MIME type
- maximum upload size
- row count limit
- macro-enabled Excel rejection
- archive safety rules for Excel containers

The validation entrypoint is in [`file_parser.py`](../backend/integrations/onec/file_parser.py).

### Read-only enforcement
For database sync:
- Benela connects in read-only mode
- PostgreSQL connections are checked with `SHOW transaction_read_only`
- writable connections are rejected

### Data isolation
- every 1C route resolves a company-scoped account before reading or writing
- all import jobs, raw rows, and connections are linked to `company_id`
- cross-company access is not allowed through the 1C routes

### Audit trail
The system keeps an audit trail for:
- imports
- sync jobs
- raw normalized rows
- AI finance requests that explicitly use 1C-backed context

These are tracked through `onec_import_jobs` and `onec_raw_records`.

## 10. Uzbek 1C localization notes

Benela already normalizes several Uzbekistan-specific 1C conventions.

Supported patterns include:
- Cyrillic financial headers such as `Дата`, `Сумма`, `Контрагент`, `Склад`, `Начальный остаток`
- Uzbek sum as default currency where no better value is available
- date format `DD.MM.YYYY`
- numeric format such as `1 234 567,89`
- common legal-form suffixes such as `МЧЖ`, `АЖ`, `ХК`, `ЯТТ`, `OOO`, `AO`
- warehouse naming patterns such as `Склад` and `Омбор`

Benela normalizes these values before import so the preview and downstream Finance mapping use consistent internal field names.

## 11. What happens to imported data

Benela keeps two layers of imported 1C data.

### Raw audit layer
Raw imported rows are stored so they can be:
- reviewed later
- audited
- re-checked when anomalies are reported
- used to support troubleshooting without asking the client to re-export immediately

### Normalized layer
Benela also stores normalized versions of each row so the system can:
- preview standardized values
- detect duplicates via hash
- map supported finance records into core Benela tables
- feed AI context and anomaly detection

### Current mapping behavior
- cash flow imports can create finance transactions
- sales imports can create invoices
- inventory and payroll imports can still appear in data health and AI context even when they are not rendered as standalone Finance tables
- duplicates are marked and skipped rather than inserted again

## 12. AI finance assistant with 1C data

When 1C data exists, the finance AI assistant becomes materially more useful.

### Data source mode
The current finance AI surface supports two data-source modes:
- `Benela Data`
- `1C + Benela`

When `1C + Benela` is active:
- the finance context includes imported 1C data
- anomalies can be surfaced in the answer
- stale sync conditions can influence the answer
- the request is auditable as a 1C-backed AI query

Reference files:
- [`backend/agents/data_fetcher.py`](../backend/agents/data_fetcher.py)
- [`backend/agents/finance_agent.py`](../backend/agents/finance_agent.py)
- [`backend/api/agents.py`](../backend/api/agents.py)

### Good example prompts
Use prompts like these after you confirm imports or run a sync:
- What is our current bank balance?
- Who are our top debtors?
- Show low stock alerts.
- Compare this month vs last month revenue.
- What is our payroll cost this month?
- Give me a 30-day cash flow forecast.

### Important behavior note
If the latest sync is stale or anomalies are present, the AI may state that directly. That is expected and should be treated as an operational signal, not a bug.

## 13. Troubleshooting

### Upload rejected because of unsupported file type
Symptom:
- The upload is rejected immediately.

Likely cause:
- The file is not `.xlsx`, `.csv`, or `.xml`, or it is a macro-enabled Excel file.

Corrective action:
- Export again in a supported format.
- Convert `.mxl` to `.csv` or `.xlsx` before upload.
- Do not use `.xlsm`.

### Report type cannot be detected
Symptom:
- The parser finishes with a report-type detection error.

Likely cause:
- The exported file headers do not match expected structures strongly enough.

Corrective action:
- Re-upload with the correct `Report type hint` selected.
- Use a Benela sample template as a structural reference.

### Windows-1251 CSV displays incorrectly
Symptom:
- Cyrillic values look broken or garbled.

Likely cause:
- The CSV was exported with legacy encoding or altered after export.

Corrective action:
- Re-export directly from 1C.
- Keep the original delimiter and encoding.
- If needed, save the file again preserving Windows-1251 or export a fresh UTF-8-compatible file.

### Parse completed but rows are duplicates
Symptom:
- Preview shows duplicates or the confirm step imports fewer rows than expected.

Likely cause:
- The same business records were already imported earlier.

Corrective action:
- Review job history before re-uploading.
- Do not expect duplicate rows to be inserted again.
- If historical data truly changed, verify whether the source document identity or date range differs.

### Import confirms but Finance records do not appear as expected
Symptom:
- The job is confirmed, but you do not see the expected result in Finance tables.

Likely cause:
- The imported report type does not currently map into a first-class visible Finance table, or the data landed in audit/context only.

Corrective action:
- Confirm whether you imported cash flow or sales, which are the main finance-to-table mappings.
- Review preview rows and normalized fields.
- Check anomaly output and import history.

### DB connection test fails
Symptom:
- `Test connection` returns an error.

Likely cause:
- Host, port, DB name, credentials, or network path are wrong.

Corrective action:
- Recheck credentials and network reachability.
- Confirm the target DB type matches the selected setting.
- Ask the client IT team to test connectivity from the Benela backend path.

### DB connection is rejected as writable
Symptom:
- The connection test rejects the database even though the credentials work.

Likely cause:
- The provided user has write capability.

Corrective action:
- Create a dedicated read-only user for Benela.
- Retest after the client IT team restricts permissions.

### HTTP API ping fails
Symptom:
- `Test connection` fails for the HTTP API configuration.

Likely cause:
- Base URL is wrong, HTTPS is not reachable, credentials are wrong, or the 1C endpoint is not published correctly.

Corrective action:
- Verify the `ping` endpoint independently.
- Recheck Basic Auth credentials.
- Confirm TLS and path routing with the client's 1C team.

### Sync rate limit reached
Symptom:
- Manual sync is blocked even though the connection exists.

Likely cause:
- A sync was triggered recently for the same connection.

Corrective action:
- Wait a few minutes and retry.
- Avoid repeated manual sync clicks during the same validation window.

### Upload rate limit reached
Symptom:
- Uploads are blocked temporarily.

Likely cause:
- Too many upload attempts were made in the hourly window.

Corrective action:
- Wait for the rate limit window to clear.
- Combine validation into fewer, more deliberate uploads.

### AI does not mention 1C data
Symptom:
- The finance assistant answers without 1C-specific context.

Likely cause:
- The assistant is still on `Benela Data`, or there is no confirmed/synced 1C data available for the company.

Corrective action:
- Switch the finance AI data source to `1C + Benela`.
- Confirm at least one import or sync has completed.
- Check overview for last sync and record counts.

### Stale sync warning appears
Symptom:
- The panel or AI behavior indicates stale 1C data.

Likely cause:
- No recent sync or import completed in the expected time window.

Corrective action:
- Run a fresh sync or import.
- Review whether the current sync schedule is too infrequent.

### Anomalies found after import
Symptom:
- The anomaly count is non-zero.

Likely cause:
- Imported rows contain issues such as negative inventory, missing counterparties, or suspicious round-number transactions.

Corrective action:
- Review the anomaly list in the panel.
- Check the underlying 1C source documents.
- Correct the source data or re-export a validated period.

## 14. Verification checklist

Use this checklist after setup:
- Upload or connection setup completed successfully
- Preview rows show expected normalized fields
- Confirm import succeeds for file-based onboarding
- Overview shows expected `Last sync` or job status
- Finance reflects imported transaction or invoice data where supported
- The finance AI can answer at least one 1C-specific question
- Anomalies were reviewed and accepted or corrected
- Credential ownership and rotation responsibility are assigned

## 15. Operations and maintenance

Recommended operating practice:
- Use file import for pilots, backfills, or periodic accountant-controlled updates
- Use direct sync or HTTP API when daily or more frequent refresh is needed
- Rotate DB and HTTP credentials through the client IT team on a defined schedule
- Review import history before re-uploading the same period
- Delete and recreate a connection if credentials, base URL, or DB topology changes materially
- Escalate to Benela support when:
  - the parser repeatedly cannot detect a valid report type
  - the client cannot satisfy read-only or HTTP publication requirements
  - AI answers remain disconnected from confirmed 1C data
  - anomalies appear to result from normalization rather than source data

## 16. Appendix: key backend routes and behaviors

These are the backend routes the Benela panel uses.

| Route | Purpose |
| --- | --- |
| `/onec/overview` | Returns current company overview, connection state, counts, anomalies, and coverage period |
| `/onec/import/upload` | Uploads a file and starts background parsing |
| `/onec/import/jobs` | Lists import and sync jobs for the current company |
| `/onec/import/jobs/{id}` | Returns one job and its current status |
| `/onec/import/jobs/{id}/records` | Returns paginated raw and normalized preview rows for that job |
| `/onec/import/jobs/{id}/confirm` | Confirms a completed parse job and writes supported records into Benela tables |
| `/onec/import/template/{report_type}` | Returns a sample template file for supported report types |
| `/onec/connections` | Lists or saves the configured 1C connection for the company |
| `/onec/connections/{id}/test` | Tests the selected database or HTTP connection |
| `/onec/connections/{id}/sync` | Starts a manual sync for the selected saved connection |

### Important response shapes used by the panel
These implemented response models are defined in [`backend/database/onec_schemas.py`](../backend/database/onec_schemas.py):
- `OneCOverviewOut`
- `OneCImportJobOut`
- `OneCRecordOut`
- `OneCConnectionOut`
- `OneCConnectionTestResponse`
- `OneCSyncResponse`

## Final notes
This guide reflects the current implemented 1C integration in this repository.

Known current limitations:
- `.mxl` must be converted before upload
- MSSQL direct sync is not enabled in this build
- some non-finance imported records currently feed audit, anomaly detection, and AI context more than standalone visible operational tables
