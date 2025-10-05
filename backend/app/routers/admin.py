from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db
from backend.app.routers.helpers import get_current_user, require_admin

router = APIRouter()

@router.post("/users/{user_id}/role", response_model=schemas.User)
def assign_role(user_id: int, role_id: int,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    require_admin(current_user)
    user = db.query(models.User).filter(models.User.user_id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    role = db.query(models.Role).filter(models.Role.role_id == role_id).one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="role not found")
    user.role_id = role_id
    db.commit()
    db.refresh(user)
    return schemas.User.model_validate(user)

@router.post("/users/{user_id}/department", response_model=schemas.User)
def assign_department(user_id: int, department_id: int,
                      current_user: models.User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    require_admin(current_user)
    user = db.query(models.User).filter(models.User.user_id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    dept = db.query(models.Department).filter(models.Department.department_id == department_id).one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="department not found")
    user.department_id = department_id
    db.commit()
    db.refresh(user)
    return schemas.User.model_validate(user)

@router.post("/roles", response_model=schemas.Role)
def create_role(name: str, description: str = None,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    require_admin(current_user)
    # check unique name
    existing = db.query(models.Role).filter(models.Role.name == name).one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="role already exists")
    r = models.Role(name=name, description=description)
    db.add(r)
    db.commit()
    db.refresh(r)
    return schemas.Role.model_validate(r)

@router.get("/roles", response_model=list[schemas.Role])
def list_roles(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_admin(current_user)
    roles = db.query(models.Role).order_by(models.Role.name).all()
    return [schemas.Role.model_validate(r) for r in roles]

@router.delete("/roles/{role_id}")
def delete_role(role_id: int,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    require_admin(current_user)
    role = db.query(models.Role).filter(models.Role.role_id == role_id).one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="role not found")
    # Prevent deleting built-in admin role (by name or id 0 convention)
    if getattr(role, 'name', '').lower() == 'admin' or role.role_id == 0:
        raise HTTPException(status_code=400, detail="cannot delete admin role")
    # Check if any users still assigned
    user_count = db.query(models.User).filter(models.User.role_id == role_id).count()
    if user_count > 0:
        raise HTTPException(status_code=400, detail="role is assigned to users")
    db.delete(role)
    db.commit()
    return {"detail": "deleted"}

@router.post("/departments", response_model=schemas.Department)
def create_department(name: str, description: str = None,
                      current_user: models.User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    require_admin(current_user)
    existing = db.query(models.Department).filter(models.Department.name == name).one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="department already exists")
    d = models.Department(name=name, description=description)
    db.add(d)
    db.commit()
    db.refresh(d)
    return schemas.Department.model_validate(d)

@router.get("/departments", response_model=list[schemas.Department])
def list_departments(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_admin(current_user)
    depts = db.query(models.Department).order_by(models.Department.name).all()
    return [schemas.Department.model_validate(d) for d in depts]

@router.delete("/departments/{department_id}")
def delete_department(department_id: int,
                      current_user: models.User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    require_admin(current_user)
    dept = db.query(models.Department).filter(models.Department.department_id == department_id).one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="department not found")
    # Block deletion if users belong
    user_count = db.query(models.User).filter(models.User.department_id == department_id).count()
    if user_count > 0:
        raise HTTPException(status_code=400, detail="department has users")
    # Block deletion if documents owned
    doc_count = db.query(models.Document).filter(models.Document.department_id == department_id).count()
    if doc_count > 0:
        raise HTTPException(status_code=400, detail="department owns documents")
    db.delete(dept)
    db.commit()
    return {"detail": "deleted"}

@router.get("/users", response_model=list[schemas.User])
def list_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_admin(current_user)
    users = db.query(models.User).order_by(models.User.username).all()
    # annotate department_name and role_name on the fly for the schema
    result = []
    for u in users:
        # ensure relationships are loaded
        dept_name = u.department.name if u.department is not None else None
        role_name = u.role.name if u.role is not None else None
        u.department_name = dept_name
        u.role_name = role_name
        result.append(schemas.User.model_validate(u))
    return result