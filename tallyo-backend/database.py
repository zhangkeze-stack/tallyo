from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# SQLite 数据库文件，会生成在当前目录，名叫 tallyo.db
DATABASE_URL = "sqlite:///./tallyo.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 所有表模型都会继承这个 Base
Base = declarative_base()


# 每个请求用一个独立的数据库会话，用完自动关闭
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
