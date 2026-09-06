/**
 * AVENTA CORE — Kernel barrel.
 * The shared primitives every domain builds on. Money stays in
 * finance/money (single source of truth — re-exported here so
 * domains import from the kernel only).
 */
export * from "./events";
export * from "./audit";
export * from "./machine";
export { toMinor, mulBps } from "../finance/money";
