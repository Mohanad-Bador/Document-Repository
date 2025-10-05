from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, select, func
from backend.app.database import get_db
from backend.app.routers.helpers import get_current_user, can_access_document, require_admin, authorize_document_manage
import backend.app.models as models
import backend.app.schemas as schemas
import io
import mimetypes
import urllib.parse

router = APIRouter()

# for testing: checks for all documents in the database
@router.get("/", response_model=list[schemas.DocumentWithLatestVersion])
def list_documents(db: Session = Depends(get_db),
                    _admin_user: models.User = Depends(require_admin)
                    ):
    """Return all documents with their latest version."""
    D = models.Document
    V = models.DocumentVersion

    rows = (
        db.query(D, V)
        .options(selectinload(D.tags), selectinload(D.department))
        .outerjoin(V, and_(V.document_id == D.document_id,
                                V.version_number == D.latest_version_number))
        .all()
    )

    results: list[schemas.DocumentWithLatestVersion] = []
    for doc, ver in rows:
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        # populate latest_version as before
        doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
        doc_model.latest_version_title = ver.title if ver is not None else None
        # populate tags explicitly
        doc_model.tags = [schemas.Tag.model_validate(t) for t in (doc.tags or [])]
        doc_model.department_name = doc.department.name if getattr(doc, "department", None) else None
        results.append(doc_model)

    return results

@router.get("/{document_id}/versions", response_model=list[schemas.DocumentVersion])
def list_document_versions(
    document_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Return all versions for a document, ordered by version_number."""
    # Check if user can access the document
    can_access_document(document_id, current_user, db)

    versions = (
        db.query(models.DocumentVersion)
        .filter(models.DocumentVersion.document_id == document_id)
        .order_by(models.DocumentVersion.version_number)
        .all()
    )

    results = []
    for v in versions:
        v_model = schemas.DocumentVersion.model_validate(v)
        # populate uploader_name when uploader relation is loaded
        try:
            upl = getattr(v, 'uploader', None)
            if upl is not None:
                # prefer full name if available, otherwise username
                first = getattr(upl, 'first_name', None)
                last = getattr(upl, 'last_name', None)
                if first and last:
                    v_model.uploader_name = f"{first} {last}"
                else:
                    v_model.uploader_name = getattr(upl, 'username', None)
        except Exception:
            # best-effort: ignore errors and continue
            pass
        results.append(v_model)
    return results

@router.get("/me", response_model=schemas.AccessibleDocuments)
def get_accessible_documents(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return documents accessible to the user by department membership or explicit permissions or public docs."""
    user = current_user

    D = models.Document
    V = models.DocumentVersion
    P = models.DocumentPermission

    # Document id sets for each rule:
    ids_public = set(db.execute(select(D.document_id).where(D.is_public == True)).scalars().all()) # public docs
    ids_dept   = set(db.execute(select(D.document_id).where(D.department_id == user.department_id)).scalars().all()) # docs with user's dept id
    ids_perm   = set(db.execute(select(P.document_id).where(P.department_id == user.department_id)).scalars().all()) # docs with explicit permission for user dept

    doc_ids = ids_public | ids_dept | ids_perm

    # Alternative queries (less efficient) as they take more time and return orm objects
    # q_public = db.query(D.document_id).filter(D.is_public == True)
    # q_dept = db.query(D.document_id).filter(D.department_id == user.department_id)
    # q_perm = db.query(P.document_id).filter(P.department_id == user.department_id)
    # doc_ids = {r.document_id for r in q_public.all()} | {r.document_id for r in q_dept.all()} | {r.document_id for r in q_perm.all()}


    user_model = schemas.User.model_validate(user)

    # Loading department name to users for visualization
    if user.department_id is not None:
        dept = db.query(models.Department).filter(models.Department.department_id == user.department_id).one_or_none()
        if dept is not None:
            # set department_name on user_model
            user_model.department_name = dept.name

    # Loading role name for visualization
    if user.role_id is not None:
        role = db.query(models.Role).filter(models.Role.role_id == user.role_id).one_or_none()
        if role is not None:
            user_model.role_name = role.name

    if not doc_ids:
        return schemas.AccessibleDocuments(user=user_model, documents=[])

    # Fetch documents with their latest version
    rows = (
        db.query(D, V)
        .options(selectinload(D.tags), selectinload(D.department))
        .outerjoin(V, and_(V.document_id == D.document_id, V.version_number == D.latest_version_number))
        .filter(D.document_id.in_(list(doc_ids)))
        .all()
    )

    documents: list[schemas.DocumentWithLatestVersion] = []
    for doc, ver in rows:
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
        doc_model.latest_version_title = ver.title if ver is not None else None
        doc_model.tags = [schemas.Tag.model_validate(t) for t in (doc.tags or [])]
        doc_model.department_name = doc.department.name if getattr(doc, "department", None) else None
        documents.append(doc_model)

    return schemas.AccessibleDocuments(user=user_model, documents=documents)


@router.post("/upload", response_model=schemas.DocumentWithLatestVersion)
def upload_document(
    file: UploadFile = File(...),
    is_public: bool | None = Form(True),
    title: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new Document and its initial version in one request.
    If a document with the same title (case-insensitive) exists, appends a new version to it instead."""

    # Read and validate file
    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="empty file uploaded")
    file_size = len(file_bytes)

    uploader_id = current_user.user_id
    if current_user.department_id is None:
        raise HTTPException(status_code=400, detail="uploader must belong to a department")
    dept_to_use = current_user.department_id

    # 1) If a title is provided, try to find an existing document by that title
    #    (case-insensitive). If found, append a version to that document.
    if title:
        # Find a document whose latest version title matches exactly but case-insensitively.
        doc = (db.query(models.Document)
            .filter(func.lower(models.Document.latest_version_title) == title.lower())
            .one_or_none())

        if doc is not None:
            doc = authorize_document_manage(db, doc.document_id, current_user)
            next_version = (doc.latest_version_number or 0) + 1
            new_version = models.DocumentVersion(
                uploader_id=uploader_id,
                document_id=doc.document_id,
                version_number=next_version,
                title=title,
                file_name=file.filename,
                file_data=file_bytes,
                file_size=file_size,
            )
            db.add(new_version)
            doc.latest_version_number = next_version
            doc.latest_version_title = title

            try:
                db.commit()
                db.refresh(doc)
                db.refresh(new_version)
                doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
                doc_model.latest_version = schemas.DocumentVersion.model_validate(new_version)
                doc_model.latest_version_title = new_version.title
                return doc_model
            except IntegrityError:
                db.rollback()
                raise HTTPException(status_code=409, detail="could not append version due to conflict")

    # 2) If no existing document matched by title then create a new document
    doc = models.Document(department_id=dept_to_use, is_public=(is_public if is_public is not None else True))
    db.add(doc)
    db.flush()

    new_version = models.DocumentVersion(
        uploader_id=uploader_id,
        document_id=doc.document_id,
        version_number=1,
        title=title,
        file_name=file.filename,
        file_data=file_bytes,
        file_size=file_size,
    )
    db.add(new_version)
    doc.latest_version_number = 1
    doc.latest_version_title = title

    try:
        db.commit()
        db.refresh(doc)
        db.refresh(new_version)
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        doc_model.latest_version = schemas.DocumentVersion.model_validate(new_version)
        doc_model.latest_version_title = new_version.title
        return doc_model
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="could not create document/version due to conflict")


@router.post("/{document_id}/update", response_model=schemas.DocumentVersion)
def upload_new_version(
    document_id: int,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Append a new version to an existing document by document_id."""
    
    # Read and validate file
    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="empty file uploaded")
    file_size = len(file_bytes)

    doc = authorize_document_manage(db, document_id, current_user)

    # Document exists and user is authorized adding new version
    next_version = (doc.latest_version_number or 0) + 1
    new_version = models.DocumentVersion(
        uploader_id=current_user.user_id,
        document_id=document_id,
        version_number=next_version,
        title=title,
        file_name=file.filename,
        file_data=file_bytes,
        file_size=file_size,
    )

    db.add(new_version)
    doc.latest_version_number = next_version
    doc.latest_version_title = title

    try:
        db.commit()
        db.refresh(new_version)
        return new_version
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="could not create version due to conflict")

@router.get("/versions/{version_id}/download")
def download_version(
    version_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Download a specific document version by version_id."""
    version = db.query(models.DocumentVersion).filter(models.DocumentVersion.version_id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="version not found")
    # Check if user can access the document
    can_access_document(version.document_id, current_user, db)

    # determine mime type from filename if possible
    mime_type, _ = mimetypes.guess_type(version.file_name or "")
    media_type = mime_type or "application/octet-stream"

    # inline for viewable types, otherwise attachment
    inline_types = ("image/", "text/", "application/pdf")
    disposition_kind = "inline" if any(media_type.startswith(t) for t in inline_types) else "attachment"

    filename = version.file_name or f"document_{version.version_id}"
    filename_quoted = urllib.parse.quote(filename)

    return StreamingResponse(
        io.BytesIO(version.file_data),
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition_kind}; filename="{filename_quoted}"'}
    )

@router.post("/publicity/{document_id}/toggle", response_model=schemas.Document)
def toggle_document_publicity(
    document_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Set the publicity status of a document. Only users from the document's department may change publicity."""
    doc = authorize_document_manage(db, document_id, current_user)
    

    # If making a document public, remove all explicit permissions
    if not doc.is_public:
        db.query(models.DocumentPermission).filter(models.DocumentPermission.document_id == document_id).delete()
    doc.is_public = not doc.is_public
    db.commit()
    db.refresh(doc)
    return schemas.Document.model_validate(doc)

@router.get("/search", response_model=list[schemas.DocumentWithLatestVersion])
def search_documents(
    title: str | None = None,
    tags: list[str] | None = Query(None, description="Tag names to match (any)"),
    uploader_id: int | None = None,
    uploader_name: str | None = None,
    limit: int = 30,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Search documents by title (partial, case-insensitive), tags (any), or uploader.
    Returns only documents the current_user can access."""
    D = models.Document
    V = models.DocumentVersion
    P = models.DocumentPermission

    # Get accessible document IDs for the current user
    ids_public = set(db.execute(select(D.document_id).where(D.is_public == True)).scalars().all())
    ids_dept = set()
    ids_perm = set()
    if getattr(current_user, "department_id", None) is not None:
        ids_dept = set(db.execute(select(D.document_id).where(D.department_id == current_user.department_id)).scalars().all())
        ids_perm = set(db.execute(select(P.document_id).where(P.department_id == current_user.department_id)).scalars().all())

    accessible_ids = ids_public | ids_dept | ids_perm
    if not accessible_ids:
        return []

    # Base query returning document + its latest version
    q = (
        db.query(D, V)
        .options(selectinload(D.tags), selectinload(D.department))
        .outerjoin(V, and_(V.document_id == D.document_id, V.version_number == D.latest_version_number))
        .filter(D.document_id.in_(list(accessible_ids)))
    )

    # Checking for document title (partial, case-insensitive)
    if title:
        q = q.filter(func.lower(D.latest_version_title).contains(title.lower()))

    # Checking for tags
    if tags:
        q = q.join(D.tags).filter(models.Tag.tag_name.in_(tags))

    # Checking for uploader
    if uploader_id is not None or uploader_name:
        q = q.join(models.User, V.uploader_id == models.User.user_id)
        if uploader_id is not None:
            q = q.filter(models.User.user_id == uploader_id)
        if uploader_name:
            q = q.filter(func.lower(models.User.username).contains(uploader_name.lower()))

    q = q.distinct().limit(limit).offset(offset)

    rows = q.all()
    results: list[schemas.DocumentWithLatestVersion] = []
    for doc, ver in rows:
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
        doc_model.latest_version_title = ver.title if ver is not None else None
        doc_model.tags = [schemas.Tag.model_validate(t) for t in (doc.tags or [])]
        doc_model.department_name = doc.department.name if getattr(doc, "department", None) else None
        results.append(doc_model)

    return results