# Cost Plus, Inc. (CPI) — Commissioning & Audit Backend (Node.js)

> **High-Performance Node.js & TypeScript Backend Service for Mobile Offline Ingestion, MD5/dHash Deduplication, Quarantine Management & IRR PDF Assembly.**

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd cpi-backend
npm install
```

### 2. Run in Development Mode (Live Reload)
```bash
npm run dev
```
*Server will start on `http://localhost:4000`.*

### 3. Run Automated Backend Test Suite
```bash
npm test
```
*(Runs 14 integration tests validating manifest lookup, MD5 exact byte hashing, 64-bit dHash perceptual similarity, duplicate quarantine routing, 100% zero-loss accounting, and PDF dossier generation).*

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 📡 REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/health` | Service health & uptime probe |
| **GET** | `/` | API discovery and available routes |
| **POST** | `/api/v1/sync/batch` | Idempotent mobile sync batch ingestion |
| **GET** | `/api/v1/manifests` | Retrieves all master list units |
| **GET** | `/api/v1/manifests/search?query=Juan` | Fuzzy name & IAS number search |
| **GET** | `/api/v1/quarantine` | Lists all unresolved duplicate photo exceptions |
| **POST** | `/api/v1/quarantine/:id/resolve` | QA Auditor action (`APPROVE_OVERRIDE` or `REJECT_REQUEST_RETAKE`) |
| **GET** | `/api/v1/reports/reconciliation` | Returns 100% mathematically balanced accounting JSON |
| **GET** | `/api/v1/reports/irr/:iasNo` | Streams compiled audit-ready `IRR_<IAS_NO>.pdf` |
| **GET** | `/api/v1/schemas/active` | Dynamic schema version & configuration |

---

## 🔬 Core Service Modules

* **`DeduplicationService` ([src/services/deduplication.service.ts](file:///Users/apple/Downloads/CPI/cpi-backend/src/services/deduplication.service.ts))**: Calculates MD5 byte hashes and 64-bit visual difference hashes (`dHash`) using `sharp`. Evaluates Hamming distances ($\le 4$ = duplicate).
* **`ManifestService` ([src/services/manifest.service.ts](file:///Users/apple/Downloads/CPI/cpi-backend/src/services/manifest.service.ts))**: Multi-strategy matching against master manifests.
* **`ReconciliationService` ([src/services/reconciliation.service.ts](file:///Users/apple/Downloads/CPI/cpi-backend/src/services/reconciliation.service.ts))**: Manages the quarantine queue and zero-loss accounting balance.
* **`PdfService` ([src/services/pdf.service.ts](file:///Users/apple/Downloads/CPI/cpi-backend/src/services/pdf.service.ts))**: Compiles official `IRR_<IAS_NO>.pdf` inspection dossiers with labeled photo plates using `pdf-lib`.
