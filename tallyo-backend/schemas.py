from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    wallet_address: str | None = None
    privy_did: str | None = None


class UserOut(BaseModel):
    id: int
    email: str
    wallet_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class GroupCreate(BaseModel):
    name: str
    created_by: int
    member_ids: list[int] = []


class GroupOut(BaseModel):
    id: int
    name: str
    created_by: int
    member_ids: list[int]

    class Config:
        from_attributes = True


# 按金额模式下，单个人分摊多少
class SplitInput(BaseModel):
    user_id: int
    amount: float


class ExpenseCreate(BaseModel):
    group_id: int
    paid_by: int
    amount: float
    description: str | None = None
    # 分摊模式："equal"=平摊，"exact"=按金额
    split_mode: str = "equal"
    # equal 模式用：参与者列表（空=全体群成员）
    participant_ids: list[int] = []
    # exact 模式用：每个人各出多少（含付款人自己那份）
    custom_splits: list[SplitInput] = []


class SplitOut(BaseModel):
    user_id: int
    amount: float
    is_settled: bool

    class Config:
        from_attributes = True


class ExpenseOut(BaseModel):
    id: int
    group_id: int
    paid_by: int
    amount: float
    description: str | None
    split_mode: str
    splits: list[SplitOut]

    class Config:
        from_attributes = True


# 一条净欠款：from_user 净欠 to_user 多少
class NetDebt(BaseModel):
    from_user: int
    to_user: int
    amount: float


# 结清落库时前端传进来的数据
class SettlementCreate(BaseModel):
    group_id: int
    from_user: int      # 付款方（还钱的人）
    to_user: int        # 收款方（债主）
    tx_hash: str | None = None   # 前端链上转账成功后拿到的哈希


# 结清记录的返回
class SettlementOut(BaseModel):
    id: int
    from_user: int
    to_user: int
    amount: float
    tx_hash: str | None
    status: str
    settled_split_ids: list[int]   # 这次清掉了哪些 split

    class Config:
        from_attributes = True


# 消费历史里的单条账目
class ExpenseHistoryItem(BaseModel):
    id: int
    paid_by: int
    amount: float
    description: str | None
    created_at: datetime
    splits: list[SplitOut]

    class Config:
        from_attributes = True


class AddMemberByEmail(BaseModel):
    email: EmailStr
