from fastapi import APIRouter, Depends,HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db
from backend.app.routers.helpers import create_access_token, authenticate_user, bcrypt_context


router = APIRouter()

@router.post("/signup", response_model=schemas.User)
def signup(user_req: schemas.UserRequest, db: Session = Depends(get_db)):
    """Create a new user (password is hashed). Returns the created user (no password)."""
    # Hash the password
    hashed_password = bcrypt_context.hash(user_req.password)
    # Create the user in the database
    user = models.User(
        username=user_req.username,
        email=user_req.email,
        first_name=user_req.first_name,
        last_name=user_req.last_name,
        phone=user_req.phone,
        password_hash=hashed_password
    )
    db.add(user)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="could not create user (maybe duplicate username/email)")
    db.refresh(user)
    return schemas.User.model_validate(user)

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return JWT access token."""
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    access_token = create_access_token({"sub": str(user.user_id), "username": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
