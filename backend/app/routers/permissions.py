from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db

router = APIRouter()


@router.get("/", response_model=list[schemas.Permission])
def list_permissions(db: Session = Depends(get_db)):
    perms = db.query(models.DocumentPermission).all()
    return [schemas.Permission.model_validate(p) for p in perms]


@router.post("/grant", response_model=schemas.Permission)
def grant_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db)):
    # check document and department exist
    doc = db.query(models.Document).filter(models.Document.document_id == doc_id).one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    if doc.department_id == dept_id:
        raise HTTPException(status_code=400, detail="document is already accessible to the department")
    dept = db.query(models.Department).filter(models.Department.department_id == dept_id).one_or_none()
    if dept is None:
        raise HTTPException(status_code=404, detail="department not found")
    
    # If the document is public, make it private when granting specific permissions
    if doc.is_public:
        doc.is_public = False

    existing = db.query(models.DocumentPermission).filter(
        models.DocumentPermission.document_id == doc_id,
        models.DocumentPermission.department_id == dept_id,
    ).one_or_none()
    if existing:
        return schemas.Permission.model_validate(existing)

    perm = models.DocumentPermission(document_id=doc_id, department_id=dept_id)
    db.add(perm)
    db.commit()
    return schemas.Permission.model_validate(perm)


@router.post("/revoke")
def revoke_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db)):
    perm = db.query(models.DocumentPermission).filter(
        models.DocumentPermission.document_id == doc_id,
        models.DocumentPermission.department_id == dept_id,
    ).one_or_none()
    if perm is None:
        raise HTTPException(status_code=404, detail="permission not found")
    db.delete(perm)
    db.commit()
    return {"detail": "revoked"}


@router.get("/document/{document_id}", response_model=list[schemas.Permission])
def list_document_permissions(document_id: int, db: Session = Depends(get_db)):
    perms = db.query(models.DocumentPermission).filter(models.DocumentPermission.document_id == document_id).all()
    return [schemas.Permission.model_validate(p) for p in perms]
