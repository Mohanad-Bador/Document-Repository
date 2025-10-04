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