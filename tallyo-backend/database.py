import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# Local development uses a SQLite file. In production set DATABASE_URL to a hosted
# Postgres connection string, so data survives restarts and redeploys.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tallyo.db")

# Hosts hand out "postgres://" or "postgresql://" URLs; use the psycopg 3 driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # The serverless database suspends when idle and drops connections,
    # so test each connection before using it and recycle them regularly.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All table models inherit from this Base
Base = declarative_base()


# One database session per request, closed automatically afterwards
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
