from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


PARAMETER_LABELS = {
    "entry_variant": "入场语义",
    "mcst_mode": "MCST 模式",
    "base_length_days": "底部长度",
    "base_width_max_pct": "底部宽度上限",
    "handle_depth_max_pct": "柄深上限",
    "second_breakout_search_days": "二次突破搜索",
    "rs_rating_min": "RS 下限",
    "ret_120d_min_pct": "120 日涨幅下限",
    "pullback_depth_max_pct": "浅回踩深度上限",
    "min_score": "最低评分",
}

IMPORTANT_PARAMETER_KEYS = [
    "entry_variant",
    "mcst_mode",
    "base_length_days",
    "base_width_max_pct",
    "handle_depth_max_pct",
    "second_breakout_search_days",
    "rs_rating_min",
    "ret_120d_min_pct",
    "pullback_depth_max_pct",
    "min_score",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategies", type=str, default=None, help="Comma separated strategy ids")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    source_root = repo_root.parent / "quant-strategy" / "outputs"
    target_root = repo_root / "data"
    selected_strategies = parse_strategy_ids(args.strategies)

    if not source_root.exists():
        raise SystemExit(f"Source outputs directory not found: {source_root}")

    lens_source = source_root / "lens"
    lens_target = target_root / "lens"
    dashboard_target = target_root / "research" / "phase1"

    sync_tree(lens_source, lens_target, strategy_ids=selected_strategies)
    build_frontend_bundle(lens_target, dashboard_target, strategy_ids=selected_strategies)
    print(f"Synced lens data from {lens_source} and rebuilt dashboard bundle at {dashboard_target}")


def parse_strategy_ids(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or None


def sync_tree(source: Path, target: Path, *, strategy_ids: list[str] | None = None) -> None:
    if not source.exists():
        raise SystemExit(f"Lens directory not found: {source}")
    target.mkdir(parents=True, exist_ok=True)
    overview = collect_strategy_overview(source, strategy_ids=strategy_ids)
    write_json(target / "strategies_overview.json", overview)

    selected_ids = [row["strategy_id"] for row in overview]
    for strategy_id in selected_ids:
        source_dir = source / strategy_id
        if not source_dir.exists():
            continue
        target_dir = target / strategy_id
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(source_dir, target_dir)


def build_frontend_bundle(lens_root: Path, target_root: Path, *, strategy_ids: list[str] | None = None) -> None:
    if target_root.exists():
        shutil.rmtree(target_root)
    sample_review_root = target_root / "sample_reviews"
    sample_review_root.mkdir(parents=True, exist_ok=True)

    overview = collect_strategy_overview(lens_root, strategy_ids=strategy_ids)
    write_json(lens_root / "strategies_overview.json", overview)
    strategy_rows: list[dict[str, Any]] = []
    distribution_rows: list[dict[str, Any]] = []
    sample_rows: list[dict[str, Any]] = []

    for item in overview:
        strategy_id = str(item["strategy_id"])
        strategy_root = lens_root / strategy_id
        summary = read_json(strategy_root / "summary.json")
        trades = read_csv(strategy_root / "trades.csv")
        signals = read_csv(strategy_root / "signals.csv")
        notes = (strategy_root / "strategy_notes.md").read_text(encoding="utf-8") if (strategy_root / "strategy_notes.md").exists() else ""

        metrics = dict(summary.get("metrics", {}))
        core_parameters = dict(summary.get("core_parameters", {}))
        annualized_return_pct = compute_annualized_return_pct(summary)
        merged_samples = select_representative_samples(strategy_id, item["strategy_name"], trades)

        strategy_rows.append(
            {
                "strategy_id": strategy_id,
                "strategy_name": item["strategy_name"],
                "signal_count": metrics.get("signal_count", item.get("signal_count", 0)),
                "trade_count": metrics.get("trade_count", len(trades)),
                "win_rate": metrics.get("win_rate", item.get("win_rate", 0.0)),
                "average_return_pct": metrics.get("average_return_pct", item.get("average_return_pct", 0.0)),
                "annualized_return_pct": annualized_return_pct,
                "sharpe": metrics.get("sharpe", item.get("sharpe", 0.0)),
                "max_drawdown_pct": metrics.get("max_drawdown_pct", item.get("max_drawdown_pct", 0.0)),
                "average_hold_days": metrics.get("average_hold_days", item.get("average_hold_days", 0.0)),
                "profit_factor": metrics.get("profit_factor", 0.0),
                "best_trade_pct": metrics.get("best_trade_pct", 0.0),
                "worst_trade_pct": metrics.get("worst_trade_pct", 0.0),
                "last_backtest_time": item.get("last_backtest_time", summary.get("generated_at")),
                "run_id": item.get("run_id", summary.get("run_trace", {}).get("run_id", "")),
                "run_scope": item.get("run_scope", summary.get("run_trace", {}).get("run_scope", "")),
                "data_start_date": summary.get("date_range", {}).get("start_date", ""),
                "data_end_date": summary.get("date_range", {}).get("end_date", ""),
                "signal_start_date": min((row.get("signal_date", "") for row in signals if row.get("signal_date")), default=""),
                "signal_end_date": max((row.get("signal_date", "") for row in signals if row.get("signal_date")), default=""),
                "uses_model_ranking": bool(summary.get("strategy_metadata", {}).get("classification_mode") in {"lightgbm", "constant_fallback"}),
                "model_test_start_date": summary.get("strategy_metadata", {}).get("split_info", {}).get("test_start", ""),
                "model_test_end_date": summary.get("strategy_metadata", {}).get("split_info", {}).get("test_end", ""),
                "core_parameters": core_parameters,
                "parameter_summary": summarize_parameters(core_parameters),
                "notes_excerpt": extract_notes_excerpt(notes),
            }
        )

        distribution_row = build_distribution_row(strategy_id, item["strategy_name"], trades)
        distribution_rows.append(distribution_row)

        sample_rows.extend(merged_samples)
        write_csv(sample_review_root / f"{strategy_id}_representative_samples.csv", merged_samples)
        write_json(sample_review_root / f"{strategy_id}_summary_snapshot.json", summary)
        write_json(sample_review_root / f"{strategy_id}_distribution_snapshot.json", distribution_row)
        write_json(sample_review_root / f"{strategy_id}_signal_snapshot.json", {"signal_count": len(signals)})

    composite_scores = build_composite_scores(strategy_rows)
    leader_strategy_id = composite_scores[0]["strategy_id"] if composite_scores else None
    best_sharpe_id = max(strategy_rows, key=lambda row: safe_float(row.get("sharpe"))).get("strategy_id") if strategy_rows else None
    best_signal_id = max(strategy_rows, key=lambda row: safe_float(row.get("signal_count"))).get("strategy_id") if strategy_rows else None
    lowest_drawdown_id = (
        min(strategy_rows, key=lambda row: abs(safe_float(row.get("max_drawdown_pct")))).get("strategy_id") if strategy_rows else None
    )

    for row in strategy_rows:
        row["composite_score"] = next(
            (item["composite_score"] for item in composite_scores if item["strategy_id"] == row["strategy_id"]),
            0.0,
        )
        row["badges"] = [
            badge
            for badge, matched in (
                ("当前主线", row["strategy_id"] == leader_strategy_id),
                ("Sharpe 最佳", row["strategy_id"] == best_sharpe_id),
                ("信号最多", row["strategy_id"] == best_signal_id),
                ("回撤最浅", row["strategy_id"] == lowest_drawdown_id),
            )
            if matched
        ]

    strategy_rows.sort(key=lambda row: safe_float(row["composite_score"]), reverse=True)
    distribution_rows.sort(key=lambda row: safe_float(row["avg_return_pct"]), reverse=True)
    sample_rows.sort(key=lambda row: str(row.get("signal_date", "")), reverse=True)

    generated_at = datetime.now().isoformat(timespec="seconds")
    date_ranges = [read_json(lens_root / row["strategy_id"] / "summary.json").get("date_range", {}) for row in strategy_rows]
    start_dates = sorted(value["start_date"] for value in date_ranges if value.get("start_date"))
    end_dates = sorted(value["end_date"] for value in date_ranges if value.get("end_date"))

    manifest = {
        "generated_at": generated_at,
        "date_range": {
            "start_date": start_dates[0] if start_dates else None,
            "end_date": end_dates[-1] if end_dates else None,
        },
        "strategy_count": len(strategy_rows),
        "leader_strategy_id": leader_strategy_id,
        "latest_backtest_time": max((row["last_backtest_time"] for row in strategy_rows), default=""),
        "strategy_ids": [row["strategy_id"] for row in strategy_rows],
    }

    write_csv(target_root / "metrics_comparison.csv", strategy_rows)
    write_json(target_root / "metrics_comparison.json", strategy_rows)
    write_csv(target_root / "trade_distribution.csv", distribution_rows)
    write_json(target_root / "trade_distribution.json", distribution_rows)
    write_csv(target_root / "representative_samples.csv", sample_rows)
    write_json(target_root / "overview_bundle.json", {"manifest": manifest, "strategies": strategy_rows, "distribution": distribution_rows, "samples": sample_rows})
    write_json(target_root / "research_manifest.json", manifest)
    (target_root / "phase1_comparison_report.md").write_text(build_markdown_report(manifest, strategy_rows), encoding="utf-8")


def collect_strategy_overview(lens_root: Path, *, strategy_ids: list[str] | None = None) -> list[dict[str, Any]]:
    overview_path = lens_root / "strategies_overview.json"
    existing_rows: list[dict[str, Any]] = []
    if overview_path.exists():
        payload = read_json(overview_path)
        if isinstance(payload, list):
            existing_rows = [row for row in payload if isinstance(row, dict)]

    existing_by_id = {str(row.get("strategy_id")): dict(row) for row in existing_rows if row.get("strategy_id")}
    merged_rows: list[dict[str, Any]] = []
    allowed_ids = set(strategy_ids or [])

    for strategy_root in sorted(path for path in lens_root.iterdir() if path.is_dir()):
        summary_path = strategy_root / "summary.json"
        if not summary_path.exists():
            continue

        summary = read_json(summary_path)
        strategy_id = str(summary.get("strategy_id") or strategy_root.name)
        if allowed_ids and strategy_id not in allowed_ids:
            continue
        metrics = dict(summary.get("metrics", {}))
        run_trace = dict(summary.get("run_trace", {}))
        annualized_return_pct = compute_annualized_return_pct(summary)
        base_row = existing_by_id.get(strategy_id, {})

        merged_rows.append(
            {
                "strategy_id": strategy_id,
                "strategy_name": summary.get("strategy_name") or base_row.get("strategy_name") or strategy_id,
                "core_parameters": summary.get("core_parameters") or base_row.get("core_parameters") or {},
                "signal_count": metrics.get("signal_count", base_row.get("signal_count", 0)),
                "win_rate": metrics.get("win_rate", base_row.get("win_rate", 0.0)),
                "average_return_pct": metrics.get("average_return_pct", base_row.get("average_return_pct", 0.0)),
                "annualized_return_pct": annualized_return_pct,
                "sharpe": metrics.get("sharpe", base_row.get("sharpe", 0.0)),
                "max_drawdown_pct": metrics.get("max_drawdown_pct", base_row.get("max_drawdown_pct", 0.0)),
                "average_hold_days": metrics.get("average_hold_days", base_row.get("average_hold_days", 0.0)),
                "last_backtest_time": base_row.get("last_backtest_time") or summary.get("generated_at") or run_trace.get("created_at", ""),
                "run_id": base_row.get("run_id") or run_trace.get("run_id", ""),
                "run_scope": base_row.get("run_scope") or run_trace.get("run_scope", ""),
                "data_start_date": summary.get("date_range", {}).get("start_date", ""),
                "data_end_date": summary.get("date_range", {}).get("end_date", ""),
                "uses_model_ranking": bool(summary.get("strategy_metadata", {}).get("classification_mode") in {"lightgbm", "constant_fallback"}),
                "model_test_start_date": summary.get("strategy_metadata", {}).get("split_info", {}).get("test_start", ""),
                "model_test_end_date": summary.get("strategy_metadata", {}).get("split_info", {}).get("test_end", ""),
            }
        )

    merged_rows.sort(key=lambda row: (str(row.get("strategy_name", "")), str(row.get("strategy_id", ""))))
    return merged_rows


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [cast_row(row) for row in reader]


def cast_row(row: dict[str, str]) -> dict[str, Any]:
    converted: dict[str, Any] = {}
    for key, value in row.items():
        if value is None or value == "":
            converted[key] = ""
            continue
        lowered = value.lower()
        if lowered == "true":
            converted[key] = True
            continue
        if lowered == "false":
            converted[key] = False
            continue
        try:
            number = float(value)
        except ValueError:
            converted[key] = value
            continue
        converted[key] = int(number) if number.is_integer() else number
    return converted


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def summarize_parameters(parameters: dict[str, Any]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for key in IMPORTANT_PARAMETER_KEYS:
        if key not in parameters:
            continue
        items.append({"label": PARAMETER_LABELS.get(key, key), "value": format_parameter_value(key, parameters[key])})
    return items[:6]


def format_parameter_value(key: str, value: Any) -> str:
    if isinstance(value, (int, float)):
        numeric = float(value)
        if key.endswith("_pct"):
            return f"{numeric:.2f}%"
        if numeric.is_integer():
            return str(int(numeric))
        return f"{numeric:.2f}"
    return str(value)


def extract_notes_excerpt(markdown: str) -> str:
    lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    bullets = [line[2:].strip() for line in lines if line.startswith("- ")]
    if bullets:
        return "；".join(bullets[:2])
    for line in lines:
        if not line.startswith("#"):
            return line
    return "暂无策略说明摘要。"


def build_distribution_row(strategy_id: str, strategy_name: str, trades: list[dict[str, Any]]) -> dict[str, Any]:
    returns = [safe_float(row.get("return_pct")) for row in trades if row.get("return_pct") != ""]
    holds = [safe_float(row.get("hold_days")) for row in trades if row.get("hold_days") != ""]
    positive_returns = sorted((value for value in returns if value > 0), reverse=True)
    top5_profit = sum(positive_returns[:5])
    total_profit = sum(positive_returns)
    return {
        "strategy_id": strategy_id,
        "strategy_name": strategy_name,
        "trade_count": len(trades),
        "avg_return_pct": round(mean(returns), 6),
        "p25_return_pct": round(percentile(returns, 0.25), 6),
        "p50_return_pct": round(percentile(returns, 0.50), 6),
        "p75_return_pct": round(percentile(returns, 0.75), 6),
        "p90_return_pct": round(percentile(returns, 0.90), 6),
        "avg_hold_days": round(mean(holds), 6),
        "top5_profit_share_pct": round((top5_profit / total_profit * 100.0) if total_profit > 0 else 0.0, 6),
    }


def select_representative_samples(strategy_id: str, strategy_name: str, trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not trades:
        return []

    tagged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def pick(tag: str, row: dict[str, Any] | None) -> None:
        if row is None:
            return
        key = (safe_text(row.get("symbol")), safe_text(row.get("signal_date")), tag)
        if key in seen:
            return
        tagged.append(
            {
                "strategy_id": strategy_id,
                "strategy_name": strategy_name,
                "sample_tag": tag,
                "symbol": safe_text(row.get("symbol")),
                "name": safe_text(row.get("name")),
                "signal_date": safe_text(row.get("signal_date")),
                "entry_date": safe_text(row.get("entry_date")),
                "exit_date": safe_text(row.get("exit_date")),
                "score": safe_float(row.get("score")),
                "return_pct": safe_float(row.get("return_pct")),
                "hold_days": safe_float(row.get("hold_days")),
                "entry_type": safe_text(row.get("entry_type")),
                "exit_reason": safe_text(row.get("exit_reason")),
            }
        )
        seen.add(key)

    sorted_by_return = sorted(trades, key=lambda row: safe_float(row.get("return_pct")), reverse=True)
    sorted_by_score = sorted(trades, key=lambda row: safe_float(row.get("score")), reverse=True)
    sorted_by_hold = sorted(trades, key=lambda row: safe_float(row.get("hold_days")), reverse=True)

    pick("best_return", sorted_by_return[0] if sorted_by_return else None)
    pick("worst_return", sorted_by_return[-1] if sorted_by_return else None)
    pick("highest_score", sorted_by_score[0] if sorted_by_score else None)
    pick("median_score", sorted_by_score[len(sorted_by_score) // 2] if sorted_by_score else None)
    pick("long_hold", sorted_by_hold[0] if sorted_by_hold else None)
    return tagged


def build_composite_scores(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scored = []
    for row in rows:
        composite_score = (
            0.35 * safe_float(row.get("average_return_pct"))
            + 0.25 * safe_float(row.get("win_rate")) / 100.0
            + 0.20 * safe_float(row.get("sharpe"))
            + 0.10 * safe_float(row.get("profit_factor"))
            + 0.10 * safe_float(row.get("signal_count")) / 100.0
        )
        scored.append({"strategy_id": row["strategy_id"], "composite_score": round(composite_score, 6)})
    return sorted(scored, key=lambda item: item["composite_score"], reverse=True)


def build_markdown_report(manifest: dict[str, Any], strategies: list[dict[str, Any]]) -> str:
    lines = [
        "# 前端同步摘要",
        "",
        f"- 生成时间：`{manifest['generated_at']}`",
        f"- 数据区间：`{manifest['date_range']['start_date']}` 到 `{manifest['date_range']['end_date']}`",
        f"- 策略数：`{manifest['strategy_count']}`",
        "",
        "## 当前策略概览",
        "",
    ]
    for row in strategies:
        lines.append(
            f"- {row['strategy_name']}：信号 `{row['signal_count']}`，胜率 `{row['win_rate']:.2f}%`，平均收益 `{row['average_return_pct']:.2f}%`，年化收益 `{safe_float(row.get('annualized_return_pct')):.2f}%`，Sharpe `{row['sharpe']:.2f}`"
        )
    lines.append("")
    return "\n".join(lines)


def compute_annualized_return_pct(summary: dict[str, Any]) -> float | None:
    metrics = dict(summary.get("metrics", {}))
    date_range = dict(summary.get("date_range", {}))
    start_date = parse_date(date_range.get("start_date"))
    end_date = parse_date(date_range.get("end_date"))
    if start_date is None or end_date is None or end_date <= start_date:
        return None

    days = (end_date - start_date).days
    if days <= 0:
        return None

    total_return_pct = metrics.get("total_return_pct")
    if total_return_pct in (None, ""):
        return None

    total_multiplier = 1.0 + safe_float(total_return_pct) / 100.0
    if total_multiplier <= 0:
        return None

    annualized = (total_multiplier ** (365.25 / days) - 1.0) * 100.0
    return round(annualized, 6)


def parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d")
    except ValueError:
        return None


def percentile(values: list[float], ratio: float) -> float:
    clean = sorted(values)
    if not clean:
        return 0.0
    if len(clean) == 1:
        return clean[0]
    position = (len(clean) - 1) * ratio
    lower = int(position)
    upper = min(lower + 1, len(clean) - 1)
    weight = position - lower
    return clean[lower] * (1.0 - weight) + clean[upper] * weight


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


if __name__ == "__main__":
    main()
