from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db
from backend.app.routers.helpers import require_admin, get_current_user, authorize_document_manage

router = APIRouter()


@router.get("/view", response_model=list[schemas.ViewPermission])
def list_view_permissions(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    """List all document view (department) permissions. Admin access required."""
    perms = db.query(models.DocumentViewPermission).all()
    return [schemas.ViewPermission.model_validate(p) for p in perms]


@router.post("/view/grant", response_model=schemas.ViewPermission)
def grant_view_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Grant a department view access to a document. Only admin or owning department users may grant."""
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

    existing = db.query(models.DocumentViewPermission).filter(
        models.DocumentViewPermission.document_id == doc_id,
        models.DocumentViewPermission.department_id == dept_id,
    ).one_or_none()
    if existing:
        return schemas.ViewPermission.model_validate(existing)

    perm = models.DocumentViewPermission(document_id=doc_id, department_id=dept_id)
    db.add(perm)
    db.commit()
    return schemas.ViewPermission.model_validate(perm)


@router.post("/view/revoke")
def revoke_view_permission(doc_id: int, dept_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Revoke a department's view access. Only admin or owning department users may revoke."""
    perm = db.query(models.DocumentViewPermission).filter(
        models.DocumentViewPermission.document_id == doc_id,
        models.DocumentViewPermission.department_id == dept_id,
    ).one_or_none()
    if perm is None:
        raise HTTPException(status_code=404, detail="permission not found")
    
    authorize_document_manage(db, doc_id, current_user)

    db.delete(perm)
    db.commit()
    return {"detail": "revoked"}


@router.get("/view/document/{document_id}", response_model=list[schemas.ViewPermission])
def list_document_view_permissions(document_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """List all department view permissions for a document."""
    authorize_document_manage(db, document_id, current_user)

    perms = db.query(models.DocumentViewPermission).filter(models.DocumentViewPermission.document_id == document_id).all()
    return [schemas.ViewPermission.model_validate(p) for p in perms]

# ---------------- Edit (per-user) permissions ----------------

@router.get("/edit/document/{document_id}", response_model=list[schemas.EditPermission])
def list_document_edit_permissions(document_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    authorize_document_manage(db, document_id, current_user)
    # Join user to enrich response
    items = (
        db.query(models.DocumentEditPermission, models.User)
        .join(models.User, models.User.user_id == models.DocumentEditPermission.user_id)
        .filter(models.DocumentEditPermission.document_id == document_id)
        .all()
    )
    results: list[schemas.EditPermission] = []
    for perm, user in items:
        data = {
            "document_id": perm.document_id,
            "user_id": perm.user_id,
            "username": getattr(user, 'username', None),
            "first_name": getattr(user, 'first_name', None),
            "last_name": getattr(user, 'last_name', None),
        }
        results.append(schemas.EditPermission(**data))
    return results

@router.post("/edit/grant", response_model=schemas.EditPermission)
def grant_edit_permission(doc_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = authorize_document_manage(db, doc_id, current_user)
    user = db.query(models.User).filter(models.User.user_id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    is_admin = getattr(user, 'role_id', None) == 0 or getattr(user.role, 'name', None) == 'admin'
    if is_admin:
        raise HTTPException(status_code=400, detail="user already has inherent edit rights")
    existing = db.query(models.DocumentEditPermission).filter(
        models.DocumentEditPermission.document_id == doc_id,
        models.DocumentEditPermission.user_id == user_id
    ).one_or_none()
    if existing:
        # Return enriched data
        return schemas.EditPermission(
            document_id=existing.document_id,
            user_id=existing.user_id,
            username=getattr(user, 'username', None),
            first_name=getattr(user, 'first_name', None),
            last_name=getattr(user, 'last_name', None)
        )
    perm = models.DocumentEditPermission(document_id=doc_id, user_id=user_id)
    db.add(perm)
    db.commit()
    return schemas.EditPermission(
        document_id=perm.document_id,
        user_id=perm.user_id,
        username=getattr(user, 'username', None),
        first_name=getattr(user, 'first_name', None),
        last_name=getattr(user, 'last_name', None)
    )

@router.post("/edit/revoke")
def revoke_edit_permission(doc_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    authorize_document_manage(db, doc_id, current_user)
    perm = db.query(models.DocumentEditPermission).filter(
        models.DocumentEditPermission.document_id == doc_id,
        models.DocumentEditPermission.user_id == user_id
    ).one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="edit permission not found")
    db.delete(perm)
    db.commit()
    return {"detail": "revoked"}

@router.get("/edit/eligible/{document_id}", response_model=list[schemas.User])
def list_eligible_edit_permission_users(document_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return users who can still be granted edit permission for a document.
    Excludes:
      * Document owner
      * Users already having explicit edit permission
      * Admin users (role 'admin' or role_id == 0) (they already have rights)
    Only a user with manage authority (admin/owner/explicit edit) may call this.
    """
    doc = authorize_document_manage(db, document_id, current_user)

    # Collect already granted edit user ids
    existing = db.query(models.DocumentEditPermission).filter(models.DocumentEditPermission.document_id == document_id).all()
    existing_ids = {p.user_id for p in existing}

    # Get potential users
    users = db.query(models.User).all()

    eligible: list[schemas.User] = []
    for u in users:
        if u.user_id == doc.owner_user_id:  # skip owner
            continue
        # Determine admin (either role name == admin or role_id == 0 )
        is_admin = False
        try:
            if getattr(u, 'role_id', None) == 0:
                is_admin = True
            else:
                r = getattr(u, 'role', None)
                if r and getattr(r, 'name', None) == 'admin':
                    is_admin = True
        except Exception:
            pass
        if is_admin:
            continue
        if u.user_id in existing_ids:
            continue
        eligible.append(schemas.User.model_validate(u))
    # Optional: sort by username
    eligible.sort(key=lambda x: x.username.lower())
    return eligible

@router.get("/departments", summary="List departments (id + name)")
def list_departments(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """
    Return simple list of departments for UI dropdown.
    Authenticated users only.
    """
    depts = db.query(models.Department).all()
    return [{"department_id": d.department_id, "name": d.name} for d in depts]