from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Tag(BaseModel):
    tag_id: int
    tag_name: str

    model_config = {"from_attributes": True}
    
class Document(BaseModel):
    document_id: int
    department_id: int
    department_name: Optional[str] = None
    latest_version_title: Optional[str] = None
    latest_version_number: Optional[int] = None
    is_public: bool
    created_at: Optional[datetime] = None
    tags: list[Tag] = []

    model_config = {"from_attributes": True}

class DocumentVersion(BaseModel):
    version_id: int
    uploader_id: Optional[int] = None
    uploader_name: Optional[str] = None
    document_id: int
    version_number: int
    title: Optional[str] = None
    file_name: Optional[str] = None
    # file_data: Optional[bytes] = None
    file_size: Optional[int] = None
    upload_date: Optional[datetime] = None

    model_config = {"from_attributes": True}

class DocumentWithLatestVersion(Document):
    latest_version: Optional[DocumentVersion] = None

    model_config = {"from_attributes": True}

class User(BaseModel):
    user_id: int
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    role_id: Optional[int] = None
    role_name: Optional[str] = None 
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}

class UserRequest(BaseModel):
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    password: str

    model_config = {"from_attributes": True}

class AccessibleDocuments(BaseModel):
    user: User
    documents: list[DocumentWithLatestVersion]

    model_config = {"from_attributes": True}

class Permission(BaseModel):
    document_id: int
    department_id: int

    model_config = {"from_attributes": True}

class Role(BaseModel):
    role_id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}

class Department(BaseModel):
    department_id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}
