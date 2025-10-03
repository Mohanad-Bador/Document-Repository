from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import backend.app.models as models
import backend.app.schemas as schemas
from backend.app.database import get_db

router = APIRouter()


@router.get("/", response_model=list[schemas.Tag])
def list_tags(db: Session = Depends(get_db)):
    tags = db.query(models.Tag).all()
    return [schemas.Tag.model_validate(tag) for tag in tags]


@router.post("/", response_model=schemas.Tag)
def create_tag(tag_name: str, db: Session = Depends(get_db)):
    existing = db.query(models.Tag).filter(models.Tag.tag_name == tag_name).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="tag already exists")
    tag = models.Tag(tag_name=tag_name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return schemas.Tag.model_validate(tag)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    db.delete(tag)
    db.commit()
    return {"detail": "deleted"}


@router.post("/document/{document_id}/assign/{tag_id}")
def assign_tag(document_id: int, tag_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.document_id == document_id).one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag in doc.tags:
        return {"detail": "already assigned"}
    doc.tags.append(tag)
    db.commit()
    return {"detail": "assigned"}


@router.post("/document/{document_id}/remove/{tag_id}")
def remove_tag(document_id: int, tag_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.document_id == document_id).one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag not in doc.tags:
        return {"detail": "not assigned"}
    doc.tags.remove(tag)
    db.commit()
    return {"detail": "removed"}


@router.get("/document/{document_id}", response_model=list[schemas.Tag])
def list_document_tags(document_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.document_id == document_id).one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    return [schemas.Tag.model_validate(tag) for tag in doc.tags]
