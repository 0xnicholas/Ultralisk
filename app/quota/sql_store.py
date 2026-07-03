"""月度配额的持久化存储(PostgreSQL 写穿)。

设计(本次讨论结论:日 Redis + 月 PG 写穿):
- 每次回写用量时,同步 upsert 到 PG:INSERT ... ON CONFLICT DO UPDATE SET
  tokens = tokens + N RETURNING tokens。原子累加,崩溃不丢。
- 实现 CounterStore 接口,QuotaService 无感知(与 Redis/内存实现可互换)。
- DB-API 无关:placeholder 可配(psycopg 用 %s,sqlite 用 ? —— 便于用 sqlite 单测真实 SQL)。
- ttl 参数忽略:PG 行持久化,过期清理交由保留任务(见 cleanup())。

表结构见 sql/monthly_usage.sql(生产用),ensure_schema() 提供可移植 DDL(测试用)。
"""
from __future__ import annotations

from app.quota.service import CounterStore

_TABLE = "monthly_usage"


class SqlMonthlyStore(CounterStore):
    def __init__(self, conn, placeholder: str = "%s", owns_conn: bool = False) -> None:
        self._conn = conn
        self._ph = placeholder
        self._owns_conn = owns_conn

    @classmethod
    def from_dsn(cls, dsn: str) -> "SqlMonthlyStore":
        import psycopg  # 延迟导入,避免测试/内存部署强依赖

        conn = psycopg.connect(dsn, autocommit=True)
        return cls(conn, placeholder="%s", owns_conn=True)

    def ensure_schema(self) -> None:
        """创建表(可移植 DDL)。生产建议改用 sql/monthly_usage.sql 的完整版本。"""
        cur = self._conn.cursor()
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {_TABLE} (
                caller_id TEXT NOT NULL,
                month     TEXT NOT NULL,
                tokens    BIGINT NOT NULL DEFAULT 0,
                PRIMARY KEY (caller_id, month)
            )
            """
        )
        self._commit()

    def get(self, key: str) -> int:
        caller_id, month = _parse_month_key(key)
        cur = self._conn.cursor()
        cur.execute(
            f"SELECT tokens FROM {_TABLE} WHERE caller_id = {self._ph} AND month = {self._ph}",
            (caller_id, month),
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0

    def increment(self, key: str, amount: int, ttl_seconds: int) -> int:
        """原子 upsert 累加,返回累加后的当月累计。ttl_seconds 忽略(PG 持久)。"""
        caller_id, month = _parse_month_key(key)
        cur = self._conn.cursor()
        cur.execute(
            f"""
            INSERT INTO {_TABLE} (caller_id, month, tokens)
            VALUES ({self._ph}, {self._ph}, {self._ph})
            ON CONFLICT (caller_id, month)
            DO UPDATE SET tokens = {_TABLE}.tokens + EXCLUDED.tokens
            RETURNING tokens
            """,
            (caller_id, month, amount),
        )
        new_val = cur.fetchone()[0]
        self._commit()
        return int(new_val)

    def cleanup(self, keep_before_month: str) -> int:
        """保留任务:删除早于 keep_before_month('YYYY-MM')的行,返回删除条数。"""
        cur = self._conn.cursor()
        cur.execute(f"DELETE FROM {_TABLE} WHERE month < {self._ph}", (keep_before_month,))
        deleted = cur.rowcount
        self._commit()
        return deleted

    def _commit(self) -> None:
        # psycopg autocommit=True 时无需 commit;sqlite / 非 autocommit 需 commit。
        if getattr(self._conn, "autocommit", False):
            return
        try:
            self._conn.commit()
        except Exception:
            pass

    def close(self) -> None:
        if self._owns_conn:
            self._conn.close()


def _parse_month_key(key: str) -> tuple[str, str]:
    """解析 'quota:month:{caller_id}:{YYYY-MM}'。caller_id 可能含冒号,取最后一段为 month。"""
    prefix = "quota:month:"
    body = key[len(prefix):] if key.startswith(prefix) else key
    caller_id, _, month = body.rpartition(":")
    return caller_id, month
