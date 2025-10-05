from dotenv import load_dotenv
import os
import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.app import schemas
import backend.app.models as models
from backend.app.database import get_db

# Load environment variables from .env file
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 90))

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="auth/login")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def authenticate_user(username: str, password: str, db: Session):
    """Return user if credentials are valid, otherwise None."""
    user = db.query(models.User).filter(models.User.username == username).one_or_none()
    if user is None:
        return None
    if not bcrypt_context.verify(password, user.password_hash):
        return None
    return user

def get_current_user(token: str = Depends(oauth2_bearer), db: Session = Depends(get_db)) -> models.User:
    """Decode JWT and return the User model or raise 401."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        user_id = int(sub) if sub is not None else None
    except Exception:
        raise credentials_exception

    if user_id is None:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.user_id == user_id).one_or_none()
    if user is None:
        raise credentials_exception
    return user

def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Admin guard."""
    role = getattr(current_user, "role", None)
    if role and getattr(role, "name", None) == "admin":
        return current_user
    if getattr(current_user, "role_id", None) == 0:
        return current_user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")

def get_document(db: Session, document_id: int) -> models.Document:
    doc = db.query(models.Document).filter(models.Document.document_id == document_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")
    return doc

def get_document_for_update(db: Session, document_id: int) -> models.Document:
    doc = db.query(models.Document).with_for_update().filter(models.Document.document_id == document_id).one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")
    return doc

def can_access_document(document_id: int, current_user: models.User, db: Session) -> models.Document:
    """Raise HTTPException if user can't access the document; return Document if allowed."""
    doc = get_document(db, document_id)
    # Check if document is public
    if doc.is_public:
        return doc
    # Check if document belongs to the user's department
    if current_user and current_user.department_id is not None and current_user.department_id == doc.department_id:
        return doc
    # explicit view permission for user's department
    if current_user and current_user.department_id is not None:
        perm = (
            db.query(models.DocumentViewPermission)
            .filter(models.DocumentViewPermission.document_id == document_id,
                    models.DocumentViewPermission.department_id == current_user.department_id)
            .one_or_none()
        )
        if perm:
            return doc
    # edit permission also grants view
    if current_user:
        edit_perm = (
            db.query(models.DocumentEditPermission)
            .filter(models.DocumentEditPermission.document_id == document_id,
                    models.DocumentEditPermission.user_id == current_user.user_id)
            .one_or_none()
        )
        if edit_perm:
            return doc
    # Check if user is admin
    if getattr(current_user, "role_id", None) == 0 or getattr(current_user.role, "name", None) == "admin":
        return doc
    raise HTTPException(status_code=403, detail="forbidden")

def authorize_document_manage(db: Session, doc_id: int, current_user: models.User) -> models.Document:
    """
    Ensure the current_user is allowed to manage (edit permissions/tags/versions) the document.
    Allowed if:
      - user is admin (role_id == 0 or role.name == "admin")
      - OR user is the owner (owner_user_id)
      - OR user has explicit edit permission (in document_edit_permissions)
    Returns the Document orm instance on success, raises HTTPException on failure.
    """
   
    doc = get_document_for_update(db, doc_id)

    is_admin = getattr(current_user, "role_id", None) == 0 or getattr(current_user.role, "name", None) == "admin"
    is_owner = getattr(doc, "owner_user_id", None) == getattr(current_user, "user_id", None)
    if not (is_admin or is_owner):
        # Check edit permission
        edit_perm = (
            db.query(models.DocumentEditPermission)
            .filter(models.DocumentEditPermission.document_id == doc_id,
                    models.DocumentEditPermission.user_id == current_user.user_id)
            .one_or_none()
        )
        if not edit_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="only admins, owner, or users with edit permission may manage this document"
            )
    return doc


def _serialize_document_with_latest(doc: models.Document, ver: models.DocumentVersion | None) -> schemas.DocumentWithLatestVersion:
    """Build a DocumentWithLatestVersion schema instance from ORM objects.
    Centralizes repeated serialization logic (tags, department_name, owner_name, latest version fields).
    """
    doc_model = schemas.DocumentWithLatestVersion.model_validate(doc)
    doc_model.latest_version = schemas.DocumentVersion.model_validate(ver) if ver is not None else None
    doc_model.latest_version_title = ver.title if ver is not None else None
    # Tags
    doc_model.tags = [schemas.Tag.model_validate(t) for t in (getattr(doc, 'tags', None) or [])]
    # Department name (optional)
    if getattr(doc, 'department', None):
        doc_model.department_name = getattr(doc.department, 'name', None)
    # Owner name preference: full name if both present else username
    owner = getattr(doc, 'owner', None)
    if owner is not None:
        first = getattr(owner, 'first_name', None)
        last = getattr(owner, 'last_name', None)
        if first and last:
            doc_model.owner_name = f"{first} {last}"
        else:
            doc_model.owner_name = getattr(owner, 'username', None)
    return doc_model