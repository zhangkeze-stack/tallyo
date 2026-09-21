from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db
import models
import schemas
from auth import get_current_user

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tallyo API")

# 校验 current_user 是否为该群成员，否则 403
def ensure_member(db: Session, group_id: int, user):
    m = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user.id,
    ).first()
    if not m:
        raise HTTPException(status_code=403, detail="你不是该群成员，无权访问")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "Tallyo API"}


@app.post("/users", response_model=schemas.UserOut)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = models.User(email=user.email, wallet_address=user.wallet_address)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/users/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/groups", response_model=schemas.GroupOut)
def create_group(group: schemas.GroupCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="群主必须是你本人")
    new_group = models.Group(name=group.name, created_by=group.created_by)
    db.add(new_group)
    db.commit()
    db.refresh(new_group)

    member_ids = set(group.member_ids)
    member_ids.add(group.created_by)

    for uid in member_ids:
        db.add(models.GroupMember(group_id=new_group.id, user_id=uid))
    db.commit()

    return schemas.GroupOut(
        id=new_group.id,
        name=new_group.name,
        created_by=new_group.created_by,
        member_ids=list(member_ids),
    )


@app.get("/groups/{group_id}", response_model=schemas.GroupOut)
def get_group(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, group_id, current_user)
    members = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()
    return schemas.GroupOut(
        id=group.id,
        name=group.name,
        created_by=group.created_by,
        member_ids=[m.user_id for m in members],
    )


@app.post("/expenses", response_model=schemas.ExpenseOut)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == expense.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, expense.group_id, current_user)
    if expense.paid_by != current_user.id:
        raise HTTPException(status_code=403, detail="只能记录由你本人垫付的账")

    members = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == expense.group_id
    ).all()
    member_ids = [m.user_id for m in members]
    if not member_ids:
        raise HTTPException(status_code=400, detail="Group has no members")

    if expense.paid_by not in member_ids:
        raise HTTPException(status_code=400, detail="Payer is not in this group")

    if expense.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    share_list = []

    if expense.split_mode == "equal":
        if expense.participant_ids:
            participants = list(set(expense.participant_ids))
            for uid in participants:
                if uid not in member_ids:
                    raise HTTPException(status_code=400, detail=f"User {uid} is not in this group")
        else:
            participants = member_ids
        if not participants:
            raise HTTPException(status_code=400, detail="No participants for this expense")
        share = round(expense.amount / len(participants), 2)
        share_list = [(uid, share) for uid in participants]

    elif expense.split_mode == "exact":
        if not expense.custom_splits:
            raise HTTPException(status_code=400, detail="custom_splits required for exact mode")
        seen = set()
        total = 0.0
        for s in expense.custom_splits:
            if s.user_id not in member_ids:
                raise HTTPException(status_code=400, detail=f"User {s.user_id} is not in this group")
            if s.user_id in seen:
                raise HTTPException(status_code=400, detail=f"Duplicate user {s.user_id} in splits")
            if s.amount < 0:
                raise HTTPException(status_code=400, detail="Split amount cannot be negative")
            seen.add(s.user_id)
            total += s.amount
            share_list.append((s.user_id, round(s.amount, 2)))
        if abs(total - expense.amount) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Splits sum ({round(total,2)}) must equal amount ({expense.amount})",
            )
    else:
        raise HTTPException(status_code=400, detail="split_mode must be 'equal' or 'exact'")

    new_expense = models.Expense(
        group_id=expense.group_id,
        paid_by=expense.paid_by,
        amount=expense.amount,
        description=expense.description,
    )
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    for uid, amt in share_list:
        db.add(models.Split(
            expense_id=new_expense.id,
            user_id=uid,
            amount=amt,
            is_settled=(uid == expense.paid_by),
        ))
    db.commit()

    splits = db.query(models.Split).filter(
        models.Split.expense_id == new_expense.id
    ).all()
    return schemas.ExpenseOut(
        id=new_expense.id,
        group_id=new_expense.group_id,
        paid_by=new_expense.paid_by,
        amount=new_expense.amount,
        description=new_expense.description,
        split_mode=expense.split_mode,
        splits=[schemas.SplitOut(user_id=s.user_id, amount=s.amount, is_settled=s.is_settled) for s in splits],
    )


# ---------- 净欠款计算（抽成函数，结清和查询共用）----------
def compute_net_debts(db: Session, group_id: int):
    """返回 {(debtor, creditor): net_amount}，只含净额 > 0 的方向。"""
    expenses = db.query(models.Expense).filter(
        models.Expense.group_id == group_id
    ).all()
    expense_payer = {e.id: e.paid_by for e in expenses}
    expense_ids = list(expense_payer.keys())

    debt = {}
    if expense_ids:
        splits = db.query(models.Split).filter(
            models.Split.expense_id.in_(expense_ids),
            models.Split.is_settled == False,
        ).all()
        for s in splits:
            creditor = expense_payer[s.expense_id]
            debtor = s.user_id
            if debtor == creditor:
                continue
            debt[(debtor, creditor)] = debt.get((debtor, creditor), 0) + s.amount

    net = {}
    seen = set()
    for (debtor, creditor), amt in debt.items():
        pair = tuple(sorted([debtor, creditor]))
        if pair in seen:
            continue
        seen.add(pair)
        reverse = debt.get((creditor, debtor), 0)
        diff = amt - reverse
        if diff > 0.001:
            net[(debtor, creditor)] = round(diff, 2)
        elif diff < -0.001:
            net[(creditor, debtor)] = round(-diff, 2)
    return net


@app.get("/groups/{group_id}/balances", response_model=list[schemas.NetDebt])
def get_balances(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, group_id, current_user)
    net = compute_net_debts(db, group_id)
    return [schemas.NetDebt(from_user=d, to_user=c, amount=a) for (d, c), a in net.items()]


@app.get("/groups/{group_id}/expenses", response_model=list[schemas.ExpenseHistoryItem])
def get_expense_history(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, group_id, current_user)

    expenses = db.query(models.Expense).filter(
        models.Expense.group_id == group_id
    ).order_by(models.Expense.created_at.desc()).all()

    result = []
    for e in expenses:
        splits = db.query(models.Split).filter(models.Split.expense_id == e.id).all()
        result.append(schemas.ExpenseHistoryItem(
            id=e.id,
            paid_by=e.paid_by,
            amount=e.amount,
            description=e.description,
            created_at=e.created_at,
            splits=[schemas.SplitOut(user_id=s.user_id, amount=s.amount, is_settled=s.is_settled) for s in splits],
        ))
    return result


# ---------- 结清：按净额，一次清掉两人之间双向所有未结清 split ----------
@app.post("/settlements", response_model=schemas.SettlementOut)
def create_settlement(body: schemas.SettlementCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == body.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, body.group_id, current_user)
    if body.from_user != current_user.id:
        raise HTTPException(status_code=403, detail="只能结清你本人的欠款")

    # 1. 算净欠款，确认 from_user 确实净欠 to_user
    net = compute_net_debts(db, body.group_id)
    net_amount = net.get((body.from_user, body.to_user))
    if net_amount is None:
        raise HTTPException(
            status_code=400,
            detail="No net debt from this user to that user (nothing to settle)",
        )

    # 2. 找出这两人之间「双向」所有未结清 split，全部清掉
    #    方向A：from_user 分摊、to_user 垫付
    #    方向B：to_user 分摊、from_user 垫付
    exp_to = db.query(models.Expense).filter(
        models.Expense.group_id == body.group_id,
        models.Expense.paid_by == body.to_user,
    ).all()
    exp_from = db.query(models.Expense).filter(
        models.Expense.group_id == body.group_id,
        models.Expense.paid_by == body.from_user,
    ).all()

    split_ids_to_settle = []
    if exp_to:
        for s in db.query(models.Split).filter(
            models.Split.expense_id.in_([e.id for e in exp_to]),
            models.Split.user_id == body.from_user,
            models.Split.is_settled == False,
        ).all():
            split_ids_to_settle.append(s.id)
    if exp_from:
        for s in db.query(models.Split).filter(
            models.Split.expense_id.in_([e.id for e in exp_from]),
            models.Split.user_id == body.to_user,
            models.Split.is_settled == False,
        ).all():
            split_ids_to_settle.append(s.id)

    # 3. 建结清记录（金额 = 净额）
    settlement = models.Settlement(
        from_user=body.from_user,
        to_user=body.to_user,
        amount=net_amount,
        tx_hash=body.tx_hash,
        status="confirmed" if body.tx_hash else "pending",
        note=f"{group.name} · 结清",
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    # 4. 把双向所有相关 split 标记已结清
    for sid in split_ids_to_settle:
        sp = db.query(models.Split).filter(models.Split.id == sid).first()
        sp.is_settled = True
        sp.settlement_id = settlement.id
    db.commit()

    return schemas.SettlementOut(
        id=settlement.id,
        from_user=settlement.from_user,
        to_user=settlement.to_user,
        amount=settlement.amount,
        tx_hash=settlement.tx_hash,
        status=settlement.status,
        settled_split_ids=split_ids_to_settle,
    )


# 登录时同步用户：邮箱已存在则返回该用户，否则创建（并更新钱包地址）
@app.post("/auth/sync", response_model=schemas.UserOut)
def sync_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        # 已存在：如果钱包地址有更新就补上
        changed = False
        if user.wallet_address and existing.wallet_address != user.wallet_address:
            existing.wallet_address = user.wallet_address
            changed = True
        if user.privy_did and existing.privy_did != user.privy_did:
            existing.privy_did = user.privy_did
            changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return existing
    # 不存在：新建
    new_user = models.User(email=user.email, wallet_address=user.wallet_address, privy_did=user.privy_did)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# 查某用户所属的所有群
@app.get("/users/{user_id}/groups")
def get_user_groups(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能查看你自己的群")
    memberships = db.query(models.GroupMember).filter(
        models.GroupMember.user_id == user_id
    ).all()
    group_ids = [m.group_id for m in memberships]
    if not group_ids:
        return []
    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    result = []
    for g in groups:
        members = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == g.id
        ).all()
        # 算我在这个群欠出去的净额
        net = compute_net_debts(db, g.id)
        i_owe = sum(amt for (debtor, creditor), amt in net.items() if debtor == user_id)
        owed_to_me = sum(amt for (debtor, creditor), amt in net.items() if creditor == user_id)
        result.append({
            "id": g.id, "name": g.name, "created_by": g.created_by,
            "member_ids": [m.user_id for m in members],
            "i_owe": round(i_owe, 2),
            "owed_to_me": round(owed_to_me, 2),
        })
    return result


# 按邮箱把人加进群
@app.post("/groups/{group_id}/members", response_model=schemas.GroupOut)
def add_member(group_id: int, body: schemas.AddMemberByEmail, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, group_id, current_user)

    # 按邮箱找用户
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="该邮箱还没注册 Tallyo")

    # 已在群里就不重复加
    existing = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user.id,
    ).first()
    if not existing:
        db.add(models.GroupMember(group_id=group_id, user_id=user.id))
        db.commit()

    members = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()
    return schemas.GroupOut(
        id=group.id, name=group.name, created_by=group.created_by,
        member_ids=[m.user_id for m in members],
    )


# 按 user_id 查钱包地址（结清转账用）
@app.get("/users/{user_id}/wallet")
def get_user_wallet(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user.id, "wallet_address": user.wallet_address}


# 查一个群所有成员的详细信息（id + email + 钱包）
@app.get("/groups/{group_id}/members/detail")
def get_group_members_detail(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ensure_member(db, group_id, current_user)
    memberships = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id
    ).all()
    user_ids = [m.user_id for m in memberships]
    if not user_ids:
        return []
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    return [{"id": u.id, "email": u.email, "wallet_address": u.wallet_address} for u in users]


import secrets
from datetime import timedelta, datetime


@app.post("/groups/{group_id}/invite")
def create_invite(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    ensure_member(db, group_id, current_user)
    token = secrets.token_urlsafe(16)
    inv = models.Invitation(
        token=token,
        group_id=group_id,
        created_by=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(inv)
    db.commit()
    return {"token": token, "group_id": group_id, "group_name": group.name}


@app.get("/invite/{token}")
def get_invite(token: str, db: Session = Depends(get_db)):
    inv = db.query(models.Invitation).filter(models.Invitation.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="邀请无效")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="邀请已过期")
    group = db.query(models.Group).filter(models.Group.id == inv.group_id).first()
    return {"group_id": inv.group_id, "group_name": group.name if group else "未知群"}


@app.post("/invite/{token}/accept", response_model=schemas.GroupOut)
def accept_invite(token: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    inv = db.query(models.Invitation).filter(models.Invitation.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="邀请无效")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="邀请已过期")
    group = db.query(models.Group).filter(models.Group.id == inv.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="群不存在")
    existing = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == inv.group_id,
        models.GroupMember.user_id == current_user.id,
    ).first()
    if not existing:
        db.add(models.GroupMember(group_id=inv.group_id, user_id=current_user.id))
        db.commit()
    members = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == inv.group_id
    ).all()
    return schemas.GroupOut(
        id=group.id, name=group.name, created_by=group.created_by,
        member_ids=[m.user_id for m in members],
    )


class PaymentLinkCreate(schemas.BaseModel):
    amount: float | None = None
    note: str | None = None


# 生成收款链接
@app.post("/payment-links")
def create_payment_link(body: PaymentLinkCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    token = secrets.token_urlsafe(16)
    pl = models.PaymentLink(
        token=token,
        payee_id=current_user.id,
        amount=body.amount,
        note=body.note,
    )
    db.add(pl)
    db.commit()
    return {"token": token}


# 查收款链接信息（落地页用，不需登录）
@app.get("/payment-links/{token}")
def get_payment_link(token: str, db: Session = Depends(get_db)):
    pl = db.query(models.PaymentLink).filter(models.PaymentLink.token == token).first()
    if not pl:
        raise HTTPException(status_code=404, detail="收款链接无效")
    payee = db.query(models.User).filter(models.User.id == pl.payee_id).first()
    return {
        "payee_name": payee.email.split("@")[0] if payee else "未知",
        "payee_wallet": payee.wallet_address if payee else None,
        "amount": pl.amount,
        "note": pl.note,
        "paid": pl.paid,
    }


# 标记收款链接已付（付款方链上转账成功后回调）
@app.post("/payment-links/{token}/mark-paid")
def mark_paid(token: str, tx_hash: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    pl = db.query(models.PaymentLink).filter(models.PaymentLink.token == token).first()
    if not pl:
        raise HTTPException(status_code=404, detail="收款链接无效")
    pl.paid = True
    pl.tx_hash = tx_hash
    db.commit()
    return {"ok": True, "tx_hash": tx_hash}


# 按邮箱查用户（转账前确认对方存在、拿钱包地址）
@app.get("/users/by-email/{email}")
def get_user_by_email(email: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="该邮箱还没注册 Tallyo")
    if not user.wallet_address:
        raise HTTPException(status_code=400, detail="对方还没有钱包地址")
    return {"id": user.id, "email": user.email, "wallet_address": user.wallet_address}


# 我最近转账过的人（去重、倒序）
@app.get("/me/recent-payees")
def recent_payees(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    setts = db.query(models.Settlement).filter(
        models.Settlement.from_user == current_user.id
    ).order_by(models.Settlement.created_at.desc()).all()
    seen = set()
    result = []
    for st in setts:
        if st.to_user in seen:
            continue
        seen.add(st.to_user)
        u = db.query(models.User).filter(models.User.id == st.to_user).first()
        if u and u.wallet_address:
            result.append({"id": u.id, "email": u.email, "wallet_address": u.wallet_address})
        if len(result) >= 5:
            break
    return result


# 记一笔直接转账（转账成功后回调，用于沉淀"最近转过的人"）
@app.post("/direct-transfers")
def record_direct_transfer(to_user: int, amount: float, tx_hash: str, note: str = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    st = models.Settlement(
        from_user=current_user.id,
        to_user=to_user,
        amount=amount,
        tx_hash=tx_hash,
        status="confirmed",
        note=note,
    )
    db.add(st)
    db.commit()
    return {"ok": True}


# 我的资金流水（转出 + 收入，合并倒序）
@app.get("/me/transactions")
def my_transactions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    me = current_user.id
    setts = db.query(models.Settlement).filter(
        (models.Settlement.from_user == me) | (models.Settlement.to_user == me)
    ).order_by(models.Settlement.created_at.desc()).all()

    # 预取用户邮箱
    def name_of(uid):
        u = db.query(models.User).filter(models.User.id == uid).first()
        return u.email.split("@")[0] if u else f"用户{uid}"

    result = []
    for st in setts:
        outgoing = st.from_user == me
        other = st.to_user if outgoing else st.from_user
        result.append({
            "id": st.id,
            "direction": "out" if outgoing else "in",   # 转出 / 收入
            "counterparty": name_of(other),
            "amount": st.amount,
            "note": st.note or "转账",
            "tx_hash": st.tx_hash,
            "created_at": st.created_at.isoformat() if st.created_at else None,
        })
    return result


# 群主删除成员（有未结清欠款则拒绝）
@app.delete("/groups/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    # 只有群主能删
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="只有群主能移除成员")
    # 不能删群主自己
    if user_id == group.created_by:
        raise HTTPException(status_code=400, detail="群主不能移除自己")
    # 检查该成员是否还有未结清欠款（任一方向）
    net = compute_net_debts(db, group_id)
    for (debtor, creditor), amt in net.items():
        if (debtor == user_id or creditor == user_id) and amt > 0.001:
            raise HTTPException(status_code=400, detail="该成员还有未结清欠款，请先结清")
    # 从群成员移除
    m = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="该用户不在群里")
    db.delete(m)
    db.commit()
    return {"ok": True}


# 成员退出群（有未结清欠款则拒绝；群主不能退，只能解散）
@app.post("/groups/{group_id}/leave")
def leave_group(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.created_by == current_user.id:
        raise HTTPException(status_code=400, detail="群主不能退出，请使用解散群")
    ensure_member(db, group_id, current_user)
    net = compute_net_debts(db, group_id)
    for (debtor, creditor), amt in net.items():
        if (debtor == current_user.id or creditor == current_user.id) and amt > 0.001:
            raise HTTPException(status_code=400, detail="你还有未结清欠款，请先结清再退出")
    m = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id,
    ).first()
    if m:
        db.delete(m); db.commit()
    return {"ok": True}


# 群主解散群（群内还有任何未结清欠款则拒绝）
@app.delete("/groups/{group_id}")
def disband_group(group_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="只有群主能解散群")
    net = compute_net_debts(db, group_id)
    if any(amt > 0.001 for amt in net.values()):
        raise HTTPException(status_code=400, detail="群内还有未结清欠款，请先全部结清")
    # 删成员关系、账目及其分摊、群本身
    exp_ids = [e.id for e in db.query(models.Expense).filter(models.Expense.group_id == group_id).all()]
    if exp_ids:
        db.query(models.Split).filter(models.Split.expense_id.in_(exp_ids)).delete(synchronize_session=False)
    db.query(models.Expense).filter(models.Expense.group_id == group_id).delete(synchronize_session=False)
    db.query(models.GroupMember).filter(models.GroupMember.group_id == group_id).delete(synchronize_session=False)
    db.delete(group)
    db.commit()
    return {"ok": True}


# 我认识的人（和我共处过任何群的人，去重）
@app.get("/me/known-people")
def known_people(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # 我所在的所有群
    my_group_ids = [m.group_id for m in db.query(models.GroupMember).filter(
        models.GroupMember.user_id == current_user.id
    ).all()]
    if not my_group_ids:
        return []
    # 这些群里的所有成员（除我自己）
    rows = db.query(models.GroupMember).filter(
        models.GroupMember.group_id.in_(my_group_ids),
        models.GroupMember.user_id != current_user.id,
    ).all()
    seen = set()
    result = []
    for r in rows:
        if r.user_id in seen:
            continue
        seen.add(r.user_id)
        u = db.query(models.User).filter(models.User.id == r.user_id).first()
        if u:
            result.append({"id": u.id, "email": u.email})
    return result
