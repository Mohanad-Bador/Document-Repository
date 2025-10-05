# Document Repository POC

A proof‑of‑concept (POC) web application for managing documents with versioning, access control, tagging, and administrative management. The backend is built with **FastAPI** and **SQLAlchemy** (PostgreSQL), while a lightweight static HTML/JS frontend interacts with the API. This POC demonstrates core patterns for:

- Secure authentication (JWT)
- Department & role based access
- Fine‑grained view (department) and edit (user) permissions
- Document storage with version history
- Tagging, search, capability checks
- Admin management of users, roles, departments

---
## ✨ Features

| Area | Capabilities |
|------|--------------|
| Authentication | Signup, login (OAuth2 password flow with JWT), current user introspection |
| Users & Roles | Assign roles (admin, etc.), assign departments |
| Departments | CRUD (admin), governs access boundaries |
| Documents | Upload, automatic versioning (append by same title), per‑version download, metadata exposure |
| Versioning | Each file upload creates a `DocumentVersion` with sequential `version_number` |
| Ownership | First uploader becomes `owner_user_id`; owners/admins can manage permissions & tags |
| Permissions | Public flag, department view permissions, per‑user edit permissions, capability endpoint |
| Tagging | Create/delete tags, assign/remove to documents, filter in search |
| Search | Title (partial, case‑insensitive), tags, uploader filters, only returns accessible docs |
| Access Resolution | Combines: public OR same department OR department permission OR explicit edit permission OR admin |
| Frontend | Static site (HTML/JS/CSS) served at `/static` or root dashboard if available |
| Migrations (SQL) | Incremental SQL scripts in `db_migrations/` folder (manual apply) |

---
## 🏗 Architecture Overview

> For full diagrams and deeper flows see: [Architecture Documentation](./docs/ARCHITECTURE.md)

### System Architecture
![System Architecture](./System%20Architecture.png "High-level system architecture: users/admins → static frontend → FastAPI backend → PostgreSQL")

```
backend/app/
  main.py            # FastAPI app, router inclusion, static mount
  database.py        # SQLAlchemy engine, session, Base
  models.py          # ORM models (User, Role, Department, Document, Version, Tag, Permissions)
  schemas.py         # Pydantic response models
  routers/           # Modular API endpoints
    auth.py          # Signup, login, /me
    documents.py     # Upload, versioning, search, toggle publicity
    permissions.py   # View & edit permissions management
    tags.py          # Tag CRUD & assignment
    admin.py         # Admin operations (roles, departments, users)
    helpers.py       # Auth helpers, JWT, guards, serialization utils
frontend/static-site/
  *.html             # Pages (login, signup, dashboard, admin, etc.)
  scripts/*.js       # API wrapper + UI logic
  styles/*.css       # Basic styling
```

### Data Model Highlights
- `Document` holds current metadata (`latest_version_number`, `latest_version_title`).
- `DocumentVersion` stores immutable versioned blobs (`file_data`, `file_size`).
- `DocumentViewPermission` (document ↔ department) grants cross‑department visibility to non‑public docs.
- `DocumentEditPermission` (document ↔ user) grants edit/version rights beyond owner/admin.
- `Tag` many‑to‑many via `DocumentTag`.

### Database Schema Diagram
![Database Schema](./Database%20Schema.png "Entity Relationship Diagram: documents, versions, tags, departments, roles, permissions")
<details>
<summary>Textual schema overview (accessibility)</summary>

- users (user_id PK, department_id FK, role_id FK)
- roles (role_id PK) — one-to-many users
- departments (department_id PK) — one-to-many users & documents
- documents (document_id PK, department_id FK, owner_user_id FK, latest_version metadata)
- document_versions (version_id PK, document_id FK, uploader_id FK, version_number UNIQUE per document)
- tags (tag_id PK)
- document_tags (document_id FK, tag_id FK) — many-to-many bridge
- document_view_permissions (document_id FK, department_id FK)
- document_edit_permissions (document_id FK, user_id FK)

</details>

### Capability Logic
A user can edit a document if any of:
1. Is admin (role name `admin` or `role_id == 0` convention)
2. Is document owner (`owner_user_id`)
3. Has explicit `DocumentEditPermission`

Accessible documents union of:
- Public docs
- Same department docs
- Departments granted via `DocumentViewPermission`
- Docs where user has explicit edit permission (edit implies view)

---
## ⚙️ Technology Stack
- Python 3.10+
- FastAPI
- SQLAlchemy 2.x ORM
- PostgreSQL (psycopg2-binary)
- Pydantic v2
- JWT (PyJWT)
- Passlib + bcrypt (password hashing)
- Vanilla JS frontend (Fetch API)

---
## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+
- PostgreSQL running locally (or a connection URL)
- (Optional) Virtual environment tool (`venv`, `pipenv`, or `uv`)

### 2. Clone & Setup
```bash
git clone <repo-url>
cd Document-Repository-POC
python -m venv .venv
. .venv/bin/activate   # (Windows PowerShell: .venv\Scripts\Activate.ps1 | cmd: .venv\Scripts\activate.bat)
pip install -r backend/requirements.txt
```

### 3. Environment Variables
Create a `.env` file at project root (or inside `backend/app/`) with:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/document_repo
SECRET_KEY=your_long_random_secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=90
```
If omitted, defaults from code are used (NOT recommended for production).


### 4. Run the Backend
```bash
uvicorn backend.app.main:app --reload --port 8000
```
Visit API docs at: http://127.0.0.1:8000/docs

### 5. Frontend Access
Static site is auto-mounted at `/static` if directory exists. Open:
```
http://127.0.0.1:8000/static/login.html
```
After login you should be redirected to `dashboard.html`.

(Alternatively, you can serve the static dir via a live server extension at port 5500; CORS already allows 5500.)

---
## 🔐 Authentication Flow
1. User signs up: `POST /auth/signup` (returns user object)
2. User logs in: `POST /auth/login` (form: `username`, `password`) → returns `{ access_token, token_type }`
3. Store token in `localStorage` (frontend does this)
4. Include `Authorization: Bearer <token>` in subsequent requests
5. Current user: `GET /auth/me`

Token expiry controlled via `ACCESS_TOKEN_EXPIRE_MINUTES`.

---
## 📦 Key API Endpoints (Summary)
(See full interactive docs at `/docs`.)

### Auth
- `POST /auth/signup` – create user
- `POST /auth/login` – obtain JWT
- `GET /auth/me` – current user profile

### Documents
- `GET /documents/me` – accessible documents for user
- `GET /documents/` – list all (admin only)
- `POST /documents/upload` – create new document or append version by title
- `POST /documents/{id}/update` – add new version
- `GET /documents/{id}/versions` – list versions
- `GET /documents/versions/{version_id}/download` – download file
- `POST /documents/publicity/{id}/toggle` – toggle public/private (managers only)
- `GET /documents/{id}/capabilities` – capability flags for current user
- `GET /documents/search` – search (title, tags, uploader)

### Permissions
- View (department): grant/revoke via `/permissions/view/*`
- Edit (user): grant/revoke via `/permissions/edit/*`
- Eligible editors: `GET /permissions/edit/eligible/{document_id}`

### Tags
- List/create/delete: `/tags` endpoints
- Assign/remove to document: `/tags/document/{doc_id}/assign/{tag_id}`

### Admin
- Roles: create/list/delete
- Departments: create/list/delete
- Assign role/department to user
- List users: `GET /admin/users`

---
## 🧪 Testing (Manual)
This POC doesn't include automated tests yet. Suggested manual checks:
- Signup + login → create token → access protected route
- Upload document with/without title → verify version increments on same title
- Make document private → grant department view permission → test access from user in that department
- Grant user edit permission → verify they can add version
- Toggle publicity → confirm permissions reset
- Tag assignment and search by tag

---
## 🛡 Security Notes
- JWT secret must be strong & stored securely (.env not committed)
- Password hashes use bcrypt (cost factor per Passlib defaults)
- No rate limiting yet (add behind reverse proxy / API gateway)
- File uploads stored in DB as `bytea`; for large scale, move to object storage (S3, etc.) and store references only
- Consider size limits & MIME validation (currently minimal)

---
## 📈 Possible Improvements / Roadmap
- Automated Alembic migrations
- File storage abstraction (S3 / Azure Blob)
- Full-text search (PostgreSQL tsvector) & advanced filters
- Replace title-based version append heuristic with explicit document selection
- Add soft delete / archival workflow
- Add email verification & password reset
- Pagination for large document sets
- Add unit/integration test suite (pytest + httpx + factory-boy)
- Role-based policies beyond simple admin flag
- Web UI enhancements (framework or component library)

---
## 📄 License
Add your chosen license (e.g., MIT) in a `LICENSE` file.

---
## 🗂 Environment Recap
| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/yourdb` |
| `SECRET_KEY` | JWT signing secret | Hardcoded fallback (replace!) |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL | `90` |
