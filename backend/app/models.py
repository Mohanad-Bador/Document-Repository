from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, TIMESTAMP, LargeBinary, BigInteger, ForeignKey, UniqueConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.app.database import Base

class Department(Base):
    __tablename__ = "departments"
    department_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    description = Column(Text)
    # one-to-many relationship with User
    users = relationship("User", back_populates="department", passive_deletes=True)
    # one-to-many relationship with Document.allowed_departments
    accessible_documents = relationship("Document", secondary="document_permissions", back_populates="allowed_departments")
    # one-to-many relationship: documents owned by this department
    documents = relationship("Document", back_populates="department", passive_deletes=True)

class Role(Base):
    __tablename__ = "roles"
    role_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    description = Column(Text)
    # one-to-many relationship with User
    users = relationship("User", back_populates="role", passive_deletes=True)

class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.department_id", ondelete="SET NULL"))
    role_id = Column(Integer, ForeignKey("roles.role_id", ondelete="SET NULL"))
    username = Column(String(50), nullable=False, unique=True)
    email = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(50))
    last_name = Column(String(50))
    birth_date = Column(Date)
    phone = Column(String(30))
    # many-to-one relationships
    department = relationship("Department", back_populates="users")
    role = relationship("Role", back_populates="users")
    # one-to-many relationship with DocumentVersion
    uploaded_versions = relationship("DocumentVersion", back_populates="uploader")

class Document(Base):
    __tablename__ = "documents"
    document_id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.department_id", ondelete="RESTRICT"), nullable=False)
    latest_version_title = Column(Text)
    latest_version_number = Column(Integer)
    is_public = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    # one-to-many relationship with DocumentVersion
    versions = relationship(
        "DocumentVersion",
        back_populates="document",
        order_by="DocumentVersion.version_number",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    # many-to-one relationship to owning Department
    department = relationship("Department", back_populates="documents")
    # one-to-many relationship with document_tags and document_permissions
    tags = relationship("Tag", secondary="document_tags", back_populates="documents")
    allowed_departments = relationship("Department", secondary="document_permissions", back_populates="accessible_documents")

class DocumentVersion(Base):
    __tablename__ = "document_versions"
    version_id = Column(Integer, primary_key=True, index=True)
    uploader_id = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"))
    document_id = Column(Integer, ForeignKey("documents.document_id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    title = Column(Text)
    file_name = Column(Text)
    file_data = Column(LargeBinary)
    file_size = Column(BigInteger)
    upload_date = Column(TIMESTAMP(timezone=True), server_default=func.now())
    # many-to-one relationship with Document and User
    document = relationship("Document", back_populates="versions")
    uploader = relationship("User", back_populates="uploaded_versions")
    # Ensure unique version numbers per document
    __table_args__ = (UniqueConstraint('document_id', 'version_number', name='uix_doc_version'),)

class Tag(Base):
    __tablename__ = "tags"
    tag_id = Column(Integer, primary_key=True, index=True)
    tag_name = Column(String(50), nullable=False, unique=True)
    # many-to-many relationship with document_tags
    documents = relationship("Document", secondary="document_tags", back_populates="tags")

class DocumentTag(Base):
    __tablename__ = "document_tags"
    document_id = Column(Integer, ForeignKey("documents.document_id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.tag_id", ondelete="CASCADE"), primary_key=True)

class DocumentPermission(Base):
    __tablename__ = "document_permissions"
    document_id = Column(Integer, ForeignKey("documents.document_id", ondelete="CASCADE"), primary_key=True)
    department_id = Column(Integer, ForeignKey("departments.department_id", ondelete="CASCADE"), primary_key=True)
