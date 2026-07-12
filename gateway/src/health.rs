use axum::http::StatusCode;
use axum::response::IntoResponse;
use arc_swap::ArcSwap;
use redis::aio::MultiplexedConnection;

use crate::route::table::RouteTable;

pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

pub async fn ready(
    axum::extract::State(redis): axum::extract::State<MultiplexedConnection>,
    axum::extract::State(route_table): axum::extract::State<ArcSwap<RouteTable>>,
) -> impl IntoResponse {
    // Check Redis connectivity with PING
    let mut conn = redis.clone();
    let redis_ok = redis::cmd("PING")
        .query_async::<String>(&mut conn)
        .await
        .is_ok();

    // Check route table is non-empty
    let table = route_table.load();
    let routes_ok = !table.routes.is_empty();

    if redis_ok && routes_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}
