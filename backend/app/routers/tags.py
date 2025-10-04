from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db
from backend.app.routers.helpers import authorize_document_manage, get_current_user, get_document

router = APIRouter()


@router.get("/", response_model=list[schemas.Tag])
def list_tags(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    tags = db.query(models.Tag).all()
    return [schemas.Tag.model_validate(tag) for tag in tags]


@router.post("/", response_model=schemas.Tag)
def create_tag(tag_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    existing = db.query(models.Tag).filter(models.Tag.tag_name == tag_name).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="tag already exists")
    tag = models.Tag(tag_name=tag_name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return schemas.Tag.model_validate(tag)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    db.delete(tag)
    db.commit()
    return {"detail": "deleted"}


@router.post("/document/{document_id}/assign/{tag_id}")
def assign_tag(document_id: int, tag_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = authorize_document_manage(db, document_id, current_user)
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag in doc.tags:
        return {"detail": "already assigned"}
    doc.tags.append(tag)
    db.commit()
    return {"detail": "assigned"}


@router.post("/document/{document_id}/remove/{tag_id}")
def remove_tag(document_id: int, tag_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = authorize_document_manage(db, document_id, current_user)
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag not in doc.tags:
        return {"detail": "not assigned"}
    doc.tags.remove(tag)
    db.commit()
    return {"detail": "removed"}


@router.get("/document/{document_id}", response_model=list[schemas.Tag])
def list_document_tags(document_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = get_document(db, document_id)
    return [schemas.Tag.model_validate(tag) for tag in doc.tags]
