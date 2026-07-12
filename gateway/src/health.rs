use axum::http::StatusCode;
use axum::response::IntoResponse;
use redis::aio::MultiplexedConnection;

use crate::route::table::ROUTE_TABLE;

pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

pub async fn ready(
    axum::extract::State(redis): axum::extract::State<MultiplexedConnection>,
    axum::extract::State(_rt): axum::extract::State<()>,
) -> impl IntoResponse {
    let mut conn = redis.clone();
    let redis_ok = redis::cmd("PING")
        .query_async::<String>(&mut conn)
        .await
        .is_ok();

    let table = ROUTE_TABLE.load();
    let routes_ok = !table.routes.is_empty();

    if redis_ok && routes_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}
