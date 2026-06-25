"""
Simplified order matching engine for binary YES/NO prediction markets.

Matching logic:
  - MARKET BUY:  fills immediately at current YES/NO price plus a small slippage
                 proportional to size; updates the market's cached price.
  - LIMIT  BUY:  attempts to match against complementary opposite-side LIMIT BUYs
                 (a YES bid @ pY and a NO bid @ pN match when pY + pN >= 1.0).
                 Anything unfilled rests on the book as OPEN/PARTIAL.
  - MARKET SELL: closes shares from an existing position at current price (with
                 tiny slippage), credits cash, records realized PnL.
  - LIMIT  SELL: not implemented in v1 (close via MARKET for now). The model
                 accepts it but the router rejects it; extending is a
                 straightforward next step.

Cash reservation: a placed LIMIT BUY immediately reserves `limit_price * qty`
from the user's cash. On cancel it is refunded; on fill it is debited
permanently and any "savings" (when the counterparty's price implied a better
rate) are returned.

This is a *didactic* matcher — it deliberately omits price-time priority within
a single price level beyond what the DB ordering yields, doesn't enforce
self-trade prevention, and treats partial fills loosely. Production CLOBs need
a far more careful design.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
import uuid

from fastapi import HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import (
    Activity, Market, MarketStatus, Order, OrderAction, OrderStatus, OrderType,
    Position, Side, Trade, User,
)
from .schemas import OrderIn

EPSILON = 1e-9


@dataclass
class FillEvent:
    market_id: str
    side: Side
    price: float
    quantity: float


# ------------------------------------------------------------------ helpers

def _opposite(side: Side) -> Side:
    return Side.NO if side == Side.YES else Side.YES


def _clamp_price(p: float) -> float:
    return max(0.01, min(0.99, p))


def _slippage(quantity: float, liquidity: float) -> float:
    """Tiny size-proportional slippage; capped at 5¢ per fill."""
    if liquidity <= 0:
        return min(0.05, 0.001 * quantity)
    return min(0.05, max(0.0, (quantity / max(liquidity, 1.0)) * 0.5) * 0.1)


async def _get_or_create_position(db: AsyncSession, user_id: uuid.UUID, market_id: str, side: Side) -> Position:
    res = await db.execute(
        select(Position).where(
            Position.user_id == user_id,
            Position.market_id == market_id,
            Position.side == side,
        )
    )
    pos = res.scalar_one_or_none()
    if pos:
        return pos
    pos = Position(user_id=user_id, market_id=market_id, side=side, shares=0.0, avg_cost=0.0)
    db.add(pos)
    await db.flush()
    return pos


def _credit_position(pos: Position, qty: float, price: float) -> None:
    new_shares = pos.shares + qty
    pos.avg_cost = (pos.avg_cost * pos.shares + price * qty) / new_shares if new_shares > 0 else 0.0
    pos.shares = new_shares
    pos.updated_at = datetime.now(timezone.utc)


def _debit_position(pos: Position, qty: float, price: float) -> float:
    """Reduce position; return realized PnL contribution for the closed shares."""
    realized = (price - pos.avg_cost) * qty
    pos.shares = max(0.0, pos.shares - qty)
    pos.realized_pnl += realized
    pos.updated_at = datetime.now(timezone.utc)
    return realized


def _record_trade(db: AsyncSession, *, market_id: str, side: Side, price: float, qty: float,
                  buyer_id: uuid.UUID, seller_id: uuid.UUID | None,
                  buyer_order: uuid.UUID | None, seller_order: uuid.UUID | None) -> Trade:
    t = Trade(
        market_id=market_id, side=side, price=price, quantity=qty,
        buyer_id=buyer_id, seller_id=seller_id,
        buyer_order_id=buyer_order, seller_order_id=seller_order,
    )
    db.add(t)
    return t


def _record_activity(db: AsyncSession, **kw) -> None:
    db.add(Activity(**kw))


def _update_market_price(market: Market, side: Side, price: float) -> None:
    """Nudge the cached price toward the latest fill."""
    yes_px = price if side == Side.YES else 1.0 - price
    market.current_yes_price = _clamp_price(0.7 * market.current_yes_price + 0.3 * yes_px)


# ------------------------------------------------------------------ entry point

async def place_order(db: AsyncSession, user: User, payload: OrderIn) -> tuple[Order, list[FillEvent]]:
    market = await _load_open_market(db, payload.market_id)

    # Validate
    if payload.type == OrderType.LIMIT and payload.limit_price is None:
        raise HTTPException(400, "limit_price required for LIMIT orders")
    if payload.type == OrderType.LIMIT and payload.action == OrderAction.SELL:
        raise HTTPException(400, "LIMIT SELL not supported in this version; use MARKET to close.")

    order = Order(
        user_id=user.id, market_id=market.id,
        side=payload.side, action=payload.action, type=payload.type,
        quantity=payload.quantity, limit_price=payload.limit_price,
    )
    db.add(order)
    await db.flush()

    if payload.action == OrderAction.BUY:
        if payload.type == OrderType.MARKET:
            fills = await _fill_market_buy(db, market, user, order)
        else:
            fills = await _place_limit_buy(db, market, user, order)
    else:
        # SELL — only MARKET supported (validated above)
        fills = await _fill_market_sell(db, market, user, order)

    await db.flush()
    return order, fills


async def _load_open_market(db: AsyncSession, market_id: str) -> Market:
    res = await db.execute(select(Market).where(Market.id == market_id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Market not found")
    if m.status != MarketStatus.OPEN:
        raise HTTPException(400, f"Market is {m.status.value}, not accepting orders")
    return m


# ------------------------------------------------------------------ buys

async def _fill_market_buy(db: AsyncSession, market: Market, user: User, order: Order) -> list[FillEvent]:
    base_price = market.current_yes_price if order.side == Side.YES else 1.0 - market.current_yes_price
    fill_price = _clamp_price(base_price + _slippage(order.quantity, market.liquidity))
    cost = fill_price * order.quantity

    if user.cash + EPSILON < cost:
        raise HTTPException(400, f"Insufficient virtual cash: needs {cost:.2f}, has {user.cash:.2f}")

    user.cash -= cost
    pos = await _get_or_create_position(db, user.id, market.id, order.side)
    _credit_position(pos, order.quantity, fill_price)

    _record_trade(db, market_id=market.id, side=order.side, price=fill_price, qty=order.quantity,
                  buyer_id=user.id, seller_id=None,
                  buyer_order=order.id, seller_order=None)
    _record_activity(db, user_id=user.id, market_id=market.id, kind="FILL",
                     side=order.side, quantity=order.quantity, price=fill_price, total=cost,
                     note=f"Market BUY {order.side.value}")

    order.filled_quantity = order.quantity
    order.avg_fill_price = fill_price
    order.status = OrderStatus.FILLED

    market.volume_24h += cost
    _update_market_price(market, order.side, fill_price)

    return [FillEvent(market.id, order.side, fill_price, order.quantity)]


async def _place_limit_buy(db: AsyncSession, market: Market, user: User, order: Order) -> list[FillEvent]:
    assert order.limit_price is not None
    # Reserve cash for the resting order.
    reserved = order.limit_price * order.quantity
    if user.cash + EPSILON < reserved:
        raise HTTPException(400, f"Insufficient virtual cash to reserve {reserved:.2f}")
    user.cash -= reserved

    _record_activity(db, user_id=user.id, market_id=market.id, kind="ORDER_PLACED",
                     side=order.side, quantity=order.quantity, price=order.limit_price, total=reserved,
                     note=f"LIMIT BUY {order.side.value} @ {order.limit_price:.2f}")

    fills = await _try_cross_match(db, market, user, order)

    # Anything unfilled rests on the book as OPEN/PARTIAL
    remaining = order.quantity - order.filled_quantity
    if remaining <= EPSILON:
        order.status = OrderStatus.FILLED
    elif order.filled_quantity > EPSILON:
        order.status = OrderStatus.PARTIAL
    else:
        order.status = OrderStatus.OPEN

    return fills


async def _try_cross_match(db: AsyncSession, market: Market, user: User, taker: Order) -> list[FillEvent]:
    """
    Match `taker` (a LIMIT BUY) against opposite-side LIMIT BUYs where the
    sum of the two bid prices >= 1.0.  Each match mints one share to each
    side at their own price, total paid = 1.0.
    """
    assert taker.limit_price is not None
    opp_side = _opposite(taker.side)
    res = await db.execute(
        select(Order).where(
            Order.market_id == market.id,
            Order.side == opp_side,
            Order.action == OrderAction.BUY,
            Order.type == OrderType.LIMIT,
            Order.status.in_((OrderStatus.OPEN, OrderStatus.PARTIAL)),
        ).order_by(desc(Order.limit_price), Order.created_at.asc())
    )
    candidates: Iterable[Order] = res.scalars().all()

    fills: list[FillEvent] = []
    for maker in candidates:
        if maker.user_id == user.id:
            continue  # naive self-trade prevention
        if maker.limit_price is None:
            continue
        if taker.limit_price + maker.limit_price < 1.0 - EPSILON:
            break  # sorted by price desc; no further candidates can match

        taker_remaining = taker.quantity - taker.filled_quantity
        maker_remaining = maker.quantity - maker.filled_quantity
        qty = min(taker_remaining, maker_remaining)
        if qty <= EPSILON:
            continue

        # Maker (counterparty) — already reserved their cash on placement
        maker_user = await db.get(User, maker.user_id)
        if not maker_user:
            continue

        # Credit positions at each side's effective price
        taker_price = taker.limit_price
        maker_price = maker.limit_price

        taker_pos = await _get_or_create_position(db, user.id, market.id, taker.side)
        _credit_position(taker_pos, qty, taker_price)

        maker_pos = await _get_or_create_position(db, maker.user_id, market.id, maker.side)
        _credit_position(maker_pos, qty, maker_price)

        # No cash refund needed — both already paid their full bid
        # (Refunds only happen when fill price < reserved price; here they fill at limit.)

        # Update orders
        taker.filled_quantity += qty
        avg = ((taker.avg_fill_price or 0) * (taker.filled_quantity - qty) + taker_price * qty) / taker.filled_quantity
        taker.avg_fill_price = avg

        maker.filled_quantity += qty
        m_avg = ((maker.avg_fill_price or 0) * (maker.filled_quantity - qty) + maker_price * qty) / maker.filled_quantity
        maker.avg_fill_price = m_avg
        if maker.filled_quantity + EPSILON >= maker.quantity:
            maker.status = OrderStatus.FILLED
        else:
            maker.status = OrderStatus.PARTIAL

        # Record one trade per side (price reflects each user's perspective)
        _record_trade(db, market_id=market.id, side=taker.side, price=taker_price, qty=qty,
                      buyer_id=user.id, seller_id=None,
                      buyer_order=taker.id, seller_order=maker.id)
        _record_trade(db, market_id=market.id, side=maker.side, price=maker_price, qty=qty,
                      buyer_id=maker.user_id, seller_id=None,
                      buyer_order=maker.id, seller_order=taker.id)

        # Activity for both
        _record_activity(db, user_id=user.id, market_id=market.id, kind="FILL",
                         side=taker.side, quantity=qty, price=taker_price, total=taker_price * qty,
                         note=f"LIMIT match vs {maker.side.value}")
        _record_activity(db, user_id=maker.user_id, market_id=market.id, kind="FILL",
                         side=maker.side, quantity=qty, price=maker_price, total=maker_price * qty,
                         note=f"LIMIT match vs {taker.side.value}")

        market.volume_24h += (taker_price + maker_price) * qty
        _update_market_price(market, taker.side, taker_price)

        fills.append(FillEvent(market.id, taker.side, taker_price, qty))

        if taker.filled_quantity + EPSILON >= taker.quantity:
            break

    return fills


# ------------------------------------------------------------------ sells

async def _fill_market_sell(db: AsyncSession, market: Market, user: User, order: Order) -> list[FillEvent]:
    pos_res = await db.execute(
        select(Position).where(
            Position.user_id == user.id,
            Position.market_id == market.id,
            Position.side == order.side,
        )
    )
    pos = pos_res.scalar_one_or_none()
    if not pos or pos.shares + EPSILON < order.quantity:
        raise HTTPException(400, f"Insufficient {order.side.value} shares to sell")

    base_price = market.current_yes_price if order.side == Side.YES else 1.0 - market.current_yes_price
    fill_price = _clamp_price(base_price - _slippage(order.quantity, market.liquidity))
    proceeds = fill_price * order.quantity

    realized = _debit_position(pos, order.quantity, fill_price)
    user.cash += proceeds

    _record_trade(db, market_id=market.id, side=order.side, price=fill_price, qty=order.quantity,
                  buyer_id=user.id, seller_id=user.id,
                  buyer_order=None, seller_order=order.id)
    _record_activity(db, user_id=user.id, market_id=market.id, kind="FILL",
                     side=order.side, quantity=order.quantity, price=fill_price, total=proceeds,
                     note=f"Market SELL {order.side.value} (realized {realized:+.2f})")

    order.filled_quantity = order.quantity
    order.avg_fill_price = fill_price
    order.status = OrderStatus.FILLED

    market.volume_24h += proceeds
    _update_market_price(market, order.side, fill_price)

    return [FillEvent(market.id, order.side, fill_price, order.quantity)]


# ------------------------------------------------------------------ cancel

async def cancel_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> Order:
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(404, "Order not found")
    if order.status not in (OrderStatus.OPEN, OrderStatus.PARTIAL):
        raise HTTPException(400, f"Cannot cancel {order.status.value} order")

    # Refund unspent reserved cash for LIMIT BUYs
    if order.action == OrderAction.BUY and order.type == OrderType.LIMIT and order.limit_price is not None:
        unfilled = order.quantity - order.filled_quantity
        refund = order.limit_price * max(unfilled, 0.0)
        user.cash += refund
        _record_activity(db, user_id=user.id, market_id=order.market_id, kind="ORDER_CANCELLED",
                         side=order.side, quantity=unfilled, price=order.limit_price, total=refund,
                         note="Cancelled LIMIT BUY")
    order.status = OrderStatus.CANCELLED
    return order


# ------------------------------------------------------------------ resolution

async def resolve_market(db: AsyncSession, market: Market, outcome: Side) -> int:
    """Pay out 1.00 per share to all winning positions, and cancel open orders."""
    if market.status == MarketStatus.RESOLVED:
        raise HTTPException(400, "Market already resolved")

    # Cancel & refund all open orders
    open_orders = await db.execute(
        select(Order).where(
            Order.market_id == market.id,
            Order.status.in_((OrderStatus.OPEN, OrderStatus.PARTIAL)),
        )
    )
    for o in open_orders.scalars().all():
        if o.action == OrderAction.BUY and o.type == OrderType.LIMIT and o.limit_price is not None:
            u = await db.get(User, o.user_id)
            if u:
                u.cash += o.limit_price * max(o.quantity - o.filled_quantity, 0.0)
        o.status = OrderStatus.CANCELLED

    # Pay out winners
    pos_rs = await db.execute(select(Position).where(Position.market_id == market.id, Position.shares > 0))
    paid = 0
    for p in pos_rs.scalars().all():
        if p.side == outcome:
            payout = 1.0 * p.shares
            u = await db.get(User, p.user_id)
            if u:
                u.cash += payout
            _record_activity(db, user_id=p.user_id, market_id=market.id, kind="RESOLVED",
                             side=p.side, quantity=p.shares, price=1.0, total=payout,
                             note=f"Resolved {outcome.value} — paid out")
            p.realized_pnl += (1.0 - p.avg_cost) * p.shares
        else:
            _record_activity(db, user_id=p.user_id, market_id=market.id, kind="RESOLVED",
                             side=p.side, quantity=p.shares, price=0.0, total=0.0,
                             note=f"Resolved {outcome.value} — position expired")
            p.realized_pnl += (0.0 - p.avg_cost) * p.shares
        p.shares = 0.0
        paid += 1

    market.status = MarketStatus.RESOLVED
    market.resolved_outcome = outcome
    market.resolved_at = datetime.now(timezone.utc)
    market.current_yes_price = 0.99 if outcome == Side.YES else 0.01
    return paid


# ------------------------------------------------------------------ void

async def void_market(db: AsyncSession, market: Market) -> int:
    """
    Refund every open position at its avg cost (so PnL nets to zero), refund
    any reserved cash from open limit BUYs, and mark the market VOIDED.

    Used when the resolution flow decides the event was canceled, ambiguous,
    or otherwise un-decidable.
    """
    if market.status in (MarketStatus.RESOLVED, MarketStatus.VOIDED):
        raise HTTPException(400, "Market already finalized")

    # Cancel & refund open orders (same as in resolve_market)
    open_orders = await db.execute(
        select(Order).where(
            Order.market_id == market.id,
            Order.status.in_((OrderStatus.OPEN, OrderStatus.PARTIAL)),
        )
    )
    for o in open_orders.scalars().all():
        if o.action == OrderAction.BUY and o.type == OrderType.LIMIT and o.limit_price is not None:
            u = await db.get(User, o.user_id)
            if u:
                u.cash += o.limit_price * max(o.quantity - o.filled_quantity, 0.0)
        o.status = OrderStatus.CANCELLED

    # Refund all open positions at avg cost
    pos_rs = await db.execute(select(Position).where(Position.market_id == market.id, Position.shares > 0))
    refunded = 0
    for p in pos_rs.scalars().all():
        refund = p.avg_cost * p.shares
        u = await db.get(User, p.user_id)
        if u:
            u.cash += refund
        _record_activity(db, user_id=p.user_id, market_id=market.id, kind="VOIDED",
                         side=p.side, quantity=p.shares, price=p.avg_cost, total=refund,
                         note="Market voided — refunded at avg cost")
        # PnL is exactly zero for voided shares
        p.shares = 0.0
        refunded += 1

    market.status = MarketStatus.VOIDED
    market.resolved_at = datetime.now(timezone.utc)
    return refunded
