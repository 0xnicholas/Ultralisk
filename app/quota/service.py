"""token 配额服务。

关键设计(见 docs/tech-stack.md 模块一落地坑):
- QPS 限流由 Kong 网关插件负责,不在此实现。
- token 用量配额网关做不了 —— 必须在推理返回后回写计数,这里就是那层。
- 短期(当日)计数用 Redis INCR+EXPIRE;长期(当月)可落 PG。
- store 抽象化:测试用内存实现,生产用 Redis,业务代码不变。
"""
from __future__ import annotations

import abc
import threading
from dataclasses import dataclass
from datetime import date, datetime, timezone


def _day_key(caller_id: str, day: str) -> str:
    return f"quota:day:{caller_id}:{day}"


def _month_key(caller_id: str, month: str) -> str:
    return f"quota:month:{caller_id}:{month}"


def today_str(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d")


def month_str(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m")


class CounterStore(abc.ABC):
    """计数存储抽象。increment 需返回自增后的累计值(原子)。"""

    @abc.abstractmethod
    def get(self, key: str) -> int: ...

    @abc.abstractmethod
    def increment(self, key: str, amount: int, ttl_seconds: int) -> int: ...


class InMemoryCounterStore(CounterStore):
    """进程内实现,仅供测试/单机。线程安全,不含真实 TTL 过期。"""

    def __init__(self) -> None:
        self._data: dict[str, int] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> int:
        with self._lock:
            return self._data.get(key, 0)

    def increment(self, key: str, amount: int, ttl_seconds: int) -> int:
        with self._lock:
            self._data[key] = self._data.get(key, 0) + amount
            return self._data[key]


class RedisCounterStore(CounterStore):
    """生产实现:Redis INCRBY + EXPIRE。仅在首次写入时设置 TTL。"""

    def __init__(self, client) -> None:
        self._r = client

    def get(self, key: str) -> int:
        val = self._r.get(key)
        return int(val) if val is not None else 0

    def increment(self, key: str, amount: int, ttl_seconds: int) -> int:
        pipe = self._r.pipeline()
        pipe.incrby(key, amount)
        pipe.expire(key, ttl_seconds, nx=True)  # 已存在 TTL 时不覆盖
        new_val = pipe.execute()[0]
        return int(new_val)


@dataclass(frozen=True)
class QuotaPolicy:
    """分级配额:不同调用方可有不同策略。"""

    daily_token_quota: int
    monthly_token_quota: int


class QuotaExceeded(Exception):
    def __init__(self, scope: str, used: int, limit: int, retry_after: int) -> None:
        self.scope = scope  # "daily" | "monthly"
        self.used = used
        self.limit = limit
        self.retry_after = retry_after
        super().__init__(f"{scope} token 配额超限: {used}/{limit}")


# 各周期 TTL(略大于周期本身,防跨界丢计数)
_DAY_TTL = 60 * 60 * 26
_MONTH_TTL = 60 * 60 * 24 * 32


class QuotaService:
    """配额检查 + 用量回写。

    日计数与月计数可用不同 store:
      - 日:Redis(高频、短生命周期,INCR+EXPIRE)
      - 月:PostgreSQL 写穿(持久、崩溃不丢,关乎配额/成本)

    典型用法:
        svc.check(caller, policy)              # 推理前:粗检(是否已超)
        ... 调用推理，拿到 usage ...
        svc.record(caller, usage.total_tokens) # 推理后:回写用量
    """

    def __init__(self, daily_store: CounterStore, monthly_store: CounterStore | None = None) -> None:
        self._daily = daily_store
        # 默认月也用同一 store(向后兼容 memory/单 Redis 部署)
        self._monthly = monthly_store or daily_store

    def _seconds_to_midnight(self, now: datetime) -> int:
        next_day = date.fromordinal(now.date().toordinal() + 1)
        tomorrow = datetime.combine(next_day, datetime.min.time(), tzinfo=timezone.utc)
        return max(1, int((tomorrow - now).total_seconds()))

    def usage(self, caller_id: str, now: datetime | None = None) -> tuple[int, int]:
        now = now or datetime.now(timezone.utc)
        daily = self._daily.get(_day_key(caller_id, today_str(now)))
        monthly = self._monthly.get(_month_key(caller_id, month_str(now)))
        return daily, monthly

    def check(self, caller_id: str, policy: QuotaPolicy, now: datetime | None = None) -> None:
        """推理前检查。已超则抛 QuotaExceeded(附 Retry-After 秒数)。"""
        now = now or datetime.now(timezone.utc)
        daily, monthly = self.usage(caller_id, now)
        if daily >= policy.daily_token_quota:
            raise QuotaExceeded("daily", daily, policy.daily_token_quota, self._seconds_to_midnight(now))
        if monthly >= policy.monthly_token_quota:
            # 月度 Retry-After 简化为到下月初的秒数上限(粗略给一天)
            raise QuotaExceeded("monthly", monthly, policy.monthly_token_quota, 60 * 60 * 24)

    def record(self, caller_id: str, tokens: int, now: datetime | None = None) -> tuple[int, int]:
        """推理后回写用量,返回 (当日累计, 当月累计)。

        日计数 -> daily store(Redis);月计数 -> monthly store(PG 写穿)。
        """
        now = now or datetime.now(timezone.utc)
        daily = self._daily.increment(_day_key(caller_id, today_str(now)), tokens, _DAY_TTL)
        monthly = self._monthly.increment(_month_key(caller_id, month_str(now)), tokens, _MONTH_TTL)
        return daily, monthly


def build_quota_service(settings) -> QuotaService:
    store_kind = settings.quota_store
    if store_kind == "memory":
        return QuotaService(InMemoryCounterStore())

    import redis  # 延迟导入,避免测试环境强依赖

    redis_client = redis.Redis.from_url(settings.redis_url)
    daily_store = RedisCounterStore(redis_client)

    if store_kind == "redis_pg":
        # 日 Redis + 月 PG 写穿(推荐生产配置)
        from app.quota.sql_store import SqlMonthlyStore

        monthly_store = SqlMonthlyStore.from_dsn(settings.pg_dsn)
        monthly_store.ensure_schema()
        return QuotaService(daily_store, monthly_store)

    # store_kind == "redis": 日月均 Redis(月度依赖 TTL,Redis 重启会丢)
    return QuotaService(daily_store)
