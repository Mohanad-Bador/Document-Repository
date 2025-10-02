from fastapi import FastAPI
import models
from database import init_db, get_db, engine
from sqlalchemy.orm import Session
import uvicorn


async def lifespan(app: FastAPI):
    # Create tables
    init_db()
    yield

app = FastAPI(title="Document Repository", lifespan=lifespan)

@app.get("/")
def index():
    return {"message": "Welcome to the Document Repository API"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload="true")