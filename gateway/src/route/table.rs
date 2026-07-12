use std::collections::HashMap;
use arc_swap::ArcSwap;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct RouteTableConfig {
    pub version: u64,
    pub routes: HashMap<String, PoolConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PoolConfig {
    pub name: String,
    pub strategy: String,
    pub pods: Vec<PodConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PodConfig {
    pub id: String,
    pub address: String,
    pub weight: u32,
}

#[derive(Debug, Clone)]
pub struct RouteTable {
    pub routes: HashMap<String, Pool>,
    pub version: u64,
}

#[derive(Debug, Clone)]
pub struct Pool {
    pub name: String,
    pub pods: Vec<Pod>,
    pub strategy: String,
}

#[derive(Debug, Clone)]
pub struct Pod {
    pub id: String,
    pub address: String,
    pub weight: u32,
}

pub static ROUTE_TABLE: once_cell::sync::Lazy<ArcSwap<RouteTable>> =
    once_cell::sync::Lazy::new(|| {
        ArcSwap::from_pointee(RouteTable {
            routes: HashMap::new(),
            version: 0,
        })
    });
