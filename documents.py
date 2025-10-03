from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, select, func
import io
import models
import schemas
from database import get_db

router = APIRouter()

# for testing: checks for all documents in the database
@router.get("/", response_model=list[schemas.DocumentWithLatestVersion])
def list_documents(db: Session = Depends(get_db)):
    """Return all documents with their latest version."""
    D = models.Document
    V = models.DocumentVersion

    rows = (
        db.query(D, V)
        .outerjoin(V, and_(V.document_id == D.document_id,
                                V.version_number == D.latest_version_number))
        .all()
    )

    results: list[schemas.DocumentWithLatestVersion] = []
    for doc, ver in rows:
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
        doc_model.latest_version_title = ver.title if ver is not None else None
        results.append(doc_model)

    return results

@router.get("/user/{user_id}/", response_model=schemas.AccessibleDocuments)
def get_accessible_documents(user_id: int, db: Session = Depends(get_db)):
    """Return documents accessible to the user by department membership or explicit permissions or public docs."""
    # Load user
    user = db.query(models.User).filter(models.User.user_id == user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

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

    if not doc_ids:
        return schemas.AccessibleDocuments(user=user_model, documents=[])

    # Fetch documents with their latest version
    rows = (
        db.query(D, V)
        .outerjoin(V, and_(V.document_id == D.document_id, V.version_number == D.latest_version_number))
        .filter(D.document_id.in_(list(doc_ids)))
        .all()
    )

    documents: list[schemas.DocumentWithLatestVersion] = []
    for doc, ver in rows:
        doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
        doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
        doc_model.latest_version_title = ver.title if ver is not None else None
        documents.append(doc_model)

    return schemas.AccessibleDocuments(user=user_model, documents=documents)


@router.post("/upload", response_model=schemas.DocumentWithLatestVersion)
def upload_document(
    file: UploadFile = File(...),
    is_public: bool | None = Form(True),
    title: str | None = Form(None),
    uploader_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    """Create a new Document and its initial version in one request.
    If a document with the same title (case-insensitive) exists, appends a new version to it instead."""

    # Read and validate file
    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="empty file uploaded")
    file_size = len(file_bytes)


    # 1) If a title is provided, try to find an existing document by that title
    #    (case-insensitive). If found, append a version to that document.
    if title:
        # Find and lock a document whose latest version title matches exactly
        # but case-insensitively. Normalize both sides with LOWER() to ensure exact, case-insensitive equality.
        doc = (
            db.query(models.Document)
            .with_for_update()
            .filter(func.lower(models.Document.latest_version_title) == title.lower())
            .one_or_none()
        )

        if doc is not None:
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
    # Determine department id from uploader
    if uploader_id is not None:
        uploader = db.query(models.User).filter(models.User.user_id == uploader_id).one_or_none()
        if uploader is not None and uploader.department_id is not None:
            dept_to_use = uploader.department_id

    if dept_to_use is None:
        raise HTTPException(status_code=400, detail="Uploader must have a department")

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
    uploader_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    """Append a new version to an existing document by document_id."""
    
    # Read and validate file
    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="empty file uploaded")
    file_size = len(file_bytes)

    # Try to lock the document row. If it exists we'll append a version.
    doc = (
        db.query(models.Document)
        .with_for_update()
        .filter(models.Document.document_id == document_id)
        .one_or_none()
    )

    # If the document does not exist, return 404
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")

    # Document exists
    next_version = (doc.latest_version_number or 0) + 1
    new_version = models.DocumentVersion(
        uploader_id=uploader_id,
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
def download_version(version_id: int, db: Session = Depends(get_db)):
    version = db.query(models.DocumentVersion).filter(models.DocumentVersion.version_id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="version not found")

    return StreamingResponse(
        io.BytesIO(version.file_data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={version.file_name}"}
    )