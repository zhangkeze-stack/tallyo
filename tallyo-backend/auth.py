import os
import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from database import get_db
import models

load_dotenv()

PRIVY_APP_ID = os.getenv("PRIVY_APP_ID")
PRIVY_VERIFICATION_KEY = os.getenv("PRIVY_VERIFICATION_KEY")


def verify_privy_token(authorization: str | None = Header(default=None)):
    """从请求头拿 Bearer token，验证，返回 Privy 用户 DID。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证 token")
    token = authorization.split(" ", 1)[1]
    try:
        decoded = jwt.decode(
            token,
            PRIVY_VERIFICATION_KEY,
            issuer="privy.io",
            audience=PRIVY_APP_ID,
            algorithms=["ES256"],
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"token 验证失败: {e}")
    return decoded["sub"]  # Privy 用户 DID


def get_current_user(
    privy_did: str = Depends(verify_privy_token),
    db: Session = Depends(get_db),
):
    """根据验证过的身份，找到后端 users 表里的用户。"""
    user = db.query(models.User).filter(models.User.privy_did == privy_did).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户未同步，请重新登录")
    return user
