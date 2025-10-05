from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db
from backend.app.routers.helpers import require_admin, get_current_user, authorize_document_manage

router = APIRouter()


@router.get("/", response_model=list[schemas.Permission])
def list_permissions(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    """List all document permissions. Admin access required."""
    perms = db.query(models.DocumentPermission).all()
    return [schemas.Permission.model_validate(p) for p in perms]


@router.post("/grant", response_model=schemas.Permission)
def grant_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Grant a department access to a document. Only admin or users from the document's department may grant permissions."""
    # check document and department exist
    doc = authorize_document_manage(db, doc_id, current_user)
    
    # Prevent granting permission to the document's own department
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
def revoke_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Revoke a department's access to a document. Only admin or users from the document's department may revoke permissions."""
    perm = db.query(models.DocumentPermission).filter(
        models.DocumentPermission.document_id == doc_id,
        models.DocumentPermission.department_id == dept_id,
    ).one_or_none()
    if perm is None:
        raise HTTPException(status_code=404, detail="permission not found")
    
    authorize_document_manage(db, doc_id, current_user)

    db.delete(perm)
    db.commit()
    return {"detail": "revoked"}


@router.get("/document/{document_id}", response_model=list[schemas.Permission])
def list_document_permissions(document_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """List all permissions for a specific document. Only admin or users from the document's department may view."""
    authorize_document_manage(db, document_id, current_user)

    perms = db.query(models.DocumentPermission).filter(models.DocumentPermission.document_id == document_id).all()
    return [schemas.Permission.model_validate(p) for p in perms]

@router.get("/departments", summary="List departments (id + name)")
def list_departments(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """
    Return simple list of departments for UI dropdown.
    Authenticated users only.
    """
    depts = db.query(models.Department).all()
    return [{"department_id": d.department_id, "name": d.name} for d in depts]