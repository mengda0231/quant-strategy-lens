const PARAMETER_LABELS = {
  lookback_days: "回看窗口",
  cup_min_depth_pct: "杯体最小深度",
  cup_max_depth_pct: "杯体最大深度",
  cup_min_days: "杯体最短时长",
  cup_max_days: "杯体最长时长",
  handle_min_days: "柄部最短时长",
  handle_max_days: "柄部最长时长",
  handle_max_depth_pct: "柄部最大回撤",
  rim_tolerance_pct: "杯沿容差",
  breakout_buffer_pct: "突破缓冲",
  volume_ratio_min: "量比下限",
  min_close_above_ma: "高于均线天数",
  close_vs_ma60_min_pct: "高于 MA60 幅度",
  ma20_slope_min_pct: "MA20 斜率下限",
  box_width_20_max_pct: "20 日箱体宽度上限",
  box_lookback_days: "箱体回看窗口",
  box_recent_days: "近端观察窗口",
  range_position_min: "区间位置下限",
  dry_up_days_ratio_min: "缩量占比下限",
  ret_1d_min_pct: "单日涨幅下限",
};

const SAMPLE_TAG_LABELS = {
  best_return: "最佳收益",
  worst_return: "最差收益",
  highest_score: "最高评分",
  median_score: "中位评分",
  long_hold: "最长持有",
};

const ENTRY_TYPE_LABELS = {
  cup_breakout: "杯柄突破",
  trend_cup: "趋势杯柄",
  box: "箱体反抽",
  trend: "趋势加速",
  "box+trend": "双入口重叠",
  bottom_staging_handle_breakout_confirm: "柄部确认突破",
  bottom_staging_handle_prep: "柄底预备",
  bottom_staging_second_breakout: "二次突破",
  bottom_staging_throwback_hold: "回踩企稳",
};

const EXIT_REASON_LABELS = {
  max_hold: "达到最大持有天数",
  gap_stop: "跳空止损",
  stop_loss: "止损触发",
  end_of_data: "样本结束",
  trend_exit_ma10: "跌破 MA10 趋势退出",
  trend_exit_ma20: "跌破 MA20 趋势退出",
  peak_drawdown: "峰值回撤止盈",
  profit_lock: "浮盈保护止盈",
  trailing_atr: "ATR 跟踪止盈",
};

const STOP_SOURCE_LABELS = {
  fixed_pct: "固定止损",
  signal_low: "信号低点止损",
  profit_lock: "浮盈保护",
  peak_drawdown: "峰值回撤保护",
  trailing_atr: "ATR 跟踪保护",
};

const SORT_DEFAULTS = {
  overviewMetrics: { key: "sharpe", direction: "desc" },
  overviewDistribution: { key: "avg_return_pct", direction: "desc" },
  overviewSamples: { key: "signal_date", direction: "desc" },
  detailSamples: { key: "return_pct", direction: "desc" },
  detailTrades: { key: "entry_date", direction: "desc" },
  detailSignals: { key: "signal_date", direction: "desc" },
};

const CHART_ZOOM_PRESETS = [
  { key: "all", label: "全部", months: null },
  { key: "24m", label: "2年", months: 24 },
  { key: "12m", label: "1年", months: 12 },
  { key: "6m", label: "6个月", months: 6 },
  { key: "3m", label: "3个月", months: 3 },
];

const TABLE_LIMIT_DEFAULTS = {
  detailTrades: 50,
  detailSignals: 100,
};

const state = {
  overview: [],
  metrics: [],
  distribution: [],
  samples: [],
  manifest: null,
  detailCache: new Map(),
  chartZoomByStrategy: {},
  sortState: Object.fromEntries(
    Object.entries(SORT_DEFAULTS).map(([key, value]) => [key, { ...value }])
  ),
  tableLimits: { ...TABLE_LIMIT_DEFAULTS },
};

const appRoot = document.getElementById("app-root");
const heroGrid = document.getElementById("hero-grid");
const railNav = document.getElementById("rail-nav");
const pageTitle = document.getElementById("page-title");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");
const runContext = document.getElementById("run-context");
const statusPill = document.getElementById("status-pill");

boot().catch((error) => {
  console.error(error);
  statusPill.textContent = "本地数据载入失败";
  appRoot.innerHTML = document.getElementById("empty-state-template").innerHTML;
});

async function boot() {
  await loadBaseData();
  buildNav();
  renderHero();
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("mousemove", handleDocumentMouseMove);
  renderRoute();
}

async function loadBaseData() {
  const [bundle, overview] = await Promise.all([
    fetchJson("./data/research/phase1/overview_bundle.json"),
    fetchJson("./data/lens/strategies_overview.json"),
  ]);

  state.overview = overview;
  state.metrics = bundle.strategies || [];
  state.distribution = bundle.distribution || [];
  state.samples = bundle.samples || [];
  state.manifest = bundle.manifest || {};

  statusPill.textContent = "本地快照已同步";
  runContext.innerHTML = `
    <p class="footnote-label">运行上下文</p>
    <p class="footnote-value">
      区间：${formatDate(state.manifest.date_range.start_date)} 至 ${formatDate(state.manifest.date_range.end_date)}<br />
      策略数：${formatInteger(state.manifest.strategy_count || overview.length)}，最近回测：${formatDateTime(latestBacktestTime())}
    </p>
  `;
}

function latestBacktestTime() {
  if (!state.metrics.length) {
    return "";
  }
  const sorted = [...state.metrics].sort((left, right) => compareValues(left.last_backtest_time, right.last_backtest_time));
  return sorted[sorted.length - 1].last_backtest_time;
}

function buildNav() {
  railNav.innerHTML = `
    <a href="#/" class="nav-link nav-link-active" data-route="overview">总览</a>
    ${state.overview
      .map(
        (item) =>
          `<a href="#/strategy/${item.strategy_id}" class="nav-link" data-route="strategy:${item.strategy_id}">${escapeHtml(
            item.strategy_name
          )}</a>`
      )
      .join("")}
  `;
}

function renderHero() {
  if (!state.metrics.length) {
    heroGrid.innerHTML = "";
    return;
  }

  const leader = [...state.metrics].sort((left, right) => Number(right.composite_score || 0) - Number(left.composite_score || 0))[0];
  const bestSharpe = [...state.metrics].sort((left, right) => Number(right.sharpe) - Number(left.sharpe))[0];
  const highestSignal = [...state.metrics].sort(
    (left, right) => Number(right.signal_count) - Number(left.signal_count)
  )[0];
  const bestAnnualized = [...state.metrics].sort(
    (left, right) => Number(right.annualized_return_pct) - Number(left.annualized_return_pct)
  )[0];
  const lowestDrawdown = [...state.metrics].sort(
    (left, right) => Math.abs(Number(left.max_drawdown_pct)) - Math.abs(Number(right.max_drawdown_pct))
  )[0];
  const totalSignals = state.metrics.reduce((sum, row) => sum + Number(row.signal_count || 0), 0);

  heroGrid.innerHTML = [
    metricCard("当前主线", leader.strategy_name, formatNumber(leader.composite_score || 0), "综合平衡信号密度、收益质量与回撤结构"),
    metricCard("Sharpe 领先", bestSharpe.strategy_name, formatNumber(bestSharpe.sharpe), "当前风险调整收益最高"),
    metricCard("信号最多", highestSignal.strategy_name, formatInteger(highestSignal.signal_count), `当前总信号 ${formatInteger(totalSignals)} 条`),
    metricCard("年化收益最佳", bestAnnualized.strategy_name, formatPercent(bestAnnualized.annualized_return_pct), "按完整回测区间折算的复合年化收益最高"),
    metricCard("回撤最浅", lowestDrawdown.strategy_name, formatPercent(lowestDrawdown.max_drawdown_pct), "回撤控制相对更稳"),
  ].join("");
}

function renderRoute() {
  const hash = window.location.hash || "#/";
  setActiveNav(hash);

  if (hash === "#/" || hash === "#") {
    pageTitle.textContent = "策略总览";
    heroTitle.textContent = "先看结构质量，再决定下一轮参数迭代。";
    heroSubtitle.textContent =
      "总览页聚焦三件事：策略之间的横向比较、交易分布是否健康、代表样本是否值得继续深挖。";
    renderOverview();
    return;
  }

  if (hash.startsWith("#/strategy/")) {
    const strategyId = decodeURIComponent(hash.replace("#/strategy/", ""));
    renderDetail(strategyId);
    return;
  }

  appRoot.innerHTML = document.getElementById("empty-state-template").innerHTML;
}

function setActiveNav(hash) {
  document.querySelectorAll(".nav-link").forEach((element) => element.classList.remove("nav-link-active"));
  const key = hash.startsWith("#/strategy/") ? `strategy:${hash.replace("#/strategy/", "")}` : "overview";
  const element = document.querySelector(`.nav-link[data-route="${key}"]`);
  if (element) {
    element.classList.add("nav-link-active");
  }
}

function renderOverview() {
  const metricsRows = sortRows(state.metrics, "overviewMetrics");
  const distributionRows = sortRows(state.distribution, "overviewDistribution");
  const sampleRows = sortRows(state.samples, "overviewSamples");

  appRoot.innerHTML = `
    <section class="section-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">策略集合</p>
          <h3 class="section-title">多策略中文回测总览</h3>
        </div>
        <p class="section-copy">当前共 ${formatInteger(
          state.metrics.length
        )} 条策略，统一使用本地 A 股数据底库、统一回测口径和统一展示契约。</p>
      </div>
      <div class="strategy-card-grid">${state.overview.map(renderStrategyCard).join("")}</div>
    </section>

    <div class="overview-grid">
      <section class="section-card">
        <div class="section-head compact">
          <div>
            <p class="eyebrow">指标对比</p>
            <h3 class="section-title">先看收益质量，再看信号密度</h3>
          </div>
          <p class="section-copy">点击表头可排序，适合快速判断谁更适合作为当前主线，谁更适合继续做参数研究。</p>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                ${renderSortableHeader("策略", "overviewMetrics", "strategy_name")}
                ${renderSortableHeader("信号数", "overviewMetrics", "signal_count", true)}
                ${renderSortableHeader("交易数", "overviewMetrics", "trade_count", true)}
                ${renderSortableHeader("胜率", "overviewMetrics", "win_rate", true)}
                ${renderSortableHeader("平均收益", "overviewMetrics", "average_return_pct", true)}
                ${renderSortableHeader("年化收益", "overviewMetrics", "annualized_return_pct", true)}
                ${renderSortableHeader("Sharpe", "overviewMetrics", "sharpe", true)}
                ${renderSortableHeader("最大回撤", "overviewMetrics", "max_drawdown_pct", true)}
                ${renderSortableHeader("平均持有", "overviewMetrics", "average_hold_days", true)}
              </tr>
            </thead>
            <tbody>
              ${metricsRows
                .map(
                  (row) => `
                    <tr>
                      <td>
                        <a class="table-link" href="#/strategy/${row.strategy_id}">
                          <strong>${escapeHtml(row.strategy_name)}</strong>
                          <span class="table-subtle">${escapeHtml(row.strategy_id)}</span>
                        </a>
                      </td>
                      <td class="align-right">${rightCell(formatInteger(row.signal_count))}</td>
                      <td class="align-right">${rightCell(formatInteger(row.trade_count))}</td>
                      <td class="align-right">${rightCell(formatPercent(row.win_rate))}</td>
                      <td class="align-right">${rightCell(returnText(row.average_return_pct))}</td>
                      <td class="align-right">${rightCell(returnText(row.annualized_return_pct))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.sharpe))}</td>
                      <td class="align-right">${rightCell(formatPercent(row.max_drawdown_pct))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.average_hold_days))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head compact">
          <div>
            <p class="eyebrow">交易分布</p>
            <h3 class="section-title">尾部结构与利润集中度</h3>
          </div>
          <p class="section-copy">重点看收益分位数、持有天数和利润是否被少数样本“拖起来”，避免误判策略质量。</p>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                ${renderSortableHeader("策略", "overviewDistribution", "strategy_name")}
                ${renderSortableHeader("均值", "overviewDistribution", "avg_return_pct", true)}
                ${renderSortableHeader("P50", "overviewDistribution", "p50_return_pct", true)}
                ${renderSortableHeader("P90", "overviewDistribution", "p90_return_pct", true)}
                ${renderSortableHeader("平均持有", "overviewDistribution", "avg_hold_days", true)}
                ${renderSortableHeader("Top5 利润占比", "overviewDistribution", "top5_profit_share_pct", true)}
              </tr>
            </thead>
            <tbody>
              ${distributionRows
                .map(
                  (row) => `
                    <tr>
                      <td>
                        <strong>${escapeHtml(row.strategy_name)}</strong>
                        <span class="table-subtle">${formatInteger(row.trade_count)} 笔</span>
                      </td>
                      <td class="align-right">${rightCell(returnText(row.avg_return_pct))}</td>
                      <td class="align-right">${rightCell(returnText(row.p50_return_pct))}</td>
                      <td class="align-right">${rightCell(returnText(row.p90_return_pct))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.avg_hold_days))}</td>
                      <td class="align-right">${rightCell(formatPercent(row.top5_profit_share_pct))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="section-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">样本复核</p>
          <h3 class="section-title">代表性形态样本</h3>
        </div>
        <p class="section-copy">这里适合做人工复盘，看看策略到底抓到了什么结构，而不是只盯着收益数字。</p>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              ${renderSortableHeader("策略", "overviewSamples", "strategy_name")}
              ${renderSortableHeader("标签", "overviewSamples", "sample_tag")}
              ${renderSortableHeader("股票", "overviewSamples", "name")}
              ${renderSortableHeader("信号日", "overviewSamples", "signal_date", true)}
              ${renderSortableHeader("收益", "overviewSamples", "return_pct", true)}
              ${renderSortableHeader("持有天数", "overviewSamples", "hold_days", true)}
              ${renderSortableHeader("离场原因", "overviewSamples", "exit_reason")}
            </tr>
          </thead>
          <tbody>
            ${sampleRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.strategy_name)}</td>
                    <td><span class="tag-badge">${escapeHtml(sampleTagLabel(row.sample_tag))}</span></td>
                    <td>${stockCell(row)}</td>
                    <td class="align-right">${rightCell(formatDate(row.signal_date))}</td>
                    <td class="align-right">${rightCell(returnText(row.return_pct))}</td>
                    <td class="align-right">${rightCell(formatInteger(row.hold_days))}</td>
                    <td>${escapeHtml(exitReasonLabel(row.exit_reason, row.stop_source))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section-card method-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">统一回测口径</p>
          <h3 class="section-title">这一轮我们在比较什么</h3>
        </div>
      </div>
      <div class="method-grid">
        ${methodCard("数据区间", `${formatDate(state.manifest.date_range.start_date)} 至 ${formatDate(
          state.manifest.date_range.end_date
        )}`, "最近 4 年历史日线，便于观察不同年份下策略的延续性。")}
        ${methodCard("执行方式", "信号日收盘确认，次日开盘进场", "三条策略共用统一成交逻辑，便于横向比较。")}
        ${methodCard("研究重点", "信号质量、回撤、分布、样本", "先判断结构是否靠谱，再进入参数与执行细节。")}
      </div>
    </section>
  `;
}

async function renderDetail(strategyId) {
  const overview = state.overview.find((item) => item.strategy_id === strategyId);
  if (!overview) {
    appRoot.innerHTML = document.getElementById("empty-state-template").innerHTML;
    return;
  }

  const detail = await loadDetail(strategyId);
  const sampleRows = sortRows(
    state.samples.filter((row) => row.strategy_id === strategyId),
    "detailSamples"
  );
  const tradeRows = sortRows(detail.trades, "detailTrades");
  const signalRows = sortRows(detail.signals, "detailSignals");
  const visibleTrades = applyTableLimit(tradeRows, "detailTrades");
  const visibleSignals = applyTableLimit(signalRows, "detailSignals");
  const summary = detail.summary;
  const metric = state.metrics.find((row) => row.strategy_id === strategyId) || overview;
  const badges = Array.isArray(metric.badges) ? metric.badges : [];

  pageTitle.textContent = overview.strategy_name;
  heroTitle.textContent = `${overview.strategy_name}：看曲线、看样本，也看执行细节。`;
  heroSubtitle.textContent = `${formatDate(summary.date_range.start_date)} 至 ${formatDate(
    summary.date_range.end_date
  )}，点击表头可排序，交易与信号表支持切换显示数量。`;

  appRoot.innerHTML = `
    <section class="detail-shell">
      <section class="section-card detail-header">
        <a href="#/" class="route-back">返回总览</a>
        <div class="detail-topline">
          <div>
            <p class="eyebrow">策略详情</p>
            <h3 class="detail-title">${escapeHtml(overview.strategy_name)}</h3>
          </div>
          <div class="summary-pill-wrap">
            ${badges.map((badge) => `<span class="summary-pill">${escapeHtml(badge)}</span>`).join("")}
            <span class="summary-pill">策略 ID：${escapeHtml(strategyId)}</span>
            <span class="summary-pill">窗口：${formatDate(summary.date_range.start_date)} 至 ${formatDate(
              summary.date_range.end_date
            )}</span>
          </div>
        </div>
        <div class="detail-metrics">
          ${statCard("信号数", formatInteger(overview.signal_count))}
          ${statCard("胜率", formatPercent(overview.win_rate))}
          ${statCard("平均收益", formatPercent(overview.average_return_pct))}
          ${statCard("年化收益", formatPercent(metric.annualized_return_pct))}
          ${statCard("Sharpe", formatNumber(overview.sharpe))}
          ${statCard("最大回撤", formatPercent(overview.max_drawdown_pct))}
          ${statCard("平均持有", formatNumber(overview.average_hold_days))}
        </div>
        <div class="parameter-row">${parameterPills(summary.core_parameters)}</div>
      </section>

      <div class="detail-grid">
        <section class="section-card chart-card">
          <div class="section-head compact">
            <div>
              <p class="eyebrow">资金曲线</p>
              <h3 class="section-title">活跃持仓等权聚合曲线</h3>
            </div>
            <p class="section-copy">只用于横向比较策略结构，不代表真实组合资金管理结果。</p>
          </div>
          ${renderEquityChart(detail.equity, strategyId, summary, detail.benchmark)}
        </section>

        <section class="section-card notes-card">
          <div class="section-head compact">
            <div>
              <p class="eyebrow">策略说明</p>
              <h3 class="section-title">执行规则与参数说明</h3>
            </div>
          </div>
          <div class="notes-render">${renderNotes(detail.notes)}</div>
          <div class="download-row">
            <a class="download-link" href="./data/lens/${strategyId}/summary.json">查看 summary.json</a>
            <a class="download-link" href="./data/lens/${strategyId}/strategy_notes.md">查看 strategy_notes.md</a>
          </div>
        </section>
      </div>

      <section class="section-card">
        <div class="section-head compact">
          <div>
            <p class="eyebrow">代表样本</p>
            <h3 class="section-title">这个策略最值得先人工复核的样本</h3>
          </div>
          <p class="section-copy">从最佳、最差、最高评分、中位评分、最长持有五个角度抽样。</p>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                ${renderSortableHeader("标签", "detailSamples", "sample_tag")}
                ${renderSortableHeader("股票", "detailSamples", "name")}
                ${renderSortableHeader("信号日", "detailSamples", "signal_date", true)}
                ${renderSortableHeader("评分", "detailSamples", "score", true)}
                ${renderSortableHeader("收益", "detailSamples", "return_pct", true)}
                ${renderSortableHeader("持有天数", "detailSamples", "hold_days", true)}
                ${renderSortableHeader("离场原因", "detailSamples", "exit_reason")}
              </tr>
            </thead>
            <tbody>
              ${sampleRows
                .map(
                  (row) => `
                    <tr>
                      <td><span class="tag-badge">${escapeHtml(sampleTagLabel(row.sample_tag))}</span></td>
                      <td>${stockCell(row)}</td>
                      <td class="align-right">${rightCell(formatDate(row.signal_date))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.score))}</td>
                      <td class="align-right">${rightCell(returnText(row.return_pct))}</td>
                      <td class="align-right">${rightCell(formatInteger(row.hold_days))}</td>
                      <td>${escapeHtml(exitReasonLabel(row.exit_reason, row.stop_source))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head compact">
          <div>
            <p class="eyebrow">交易明细</p>
            <h3 class="section-title">按排序规则展示前 ${formatLimitLabel(
              state.tableLimits.detailTrades
            )} 条交易</h3>
          </div>
          ${renderTableToolbar({
            tableId: "detailTrades",
            total: tradeRows.length,
            path: `./data/lens/${strategyId}/trades.csv`,
          })}
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                ${renderSortableHeader("股票", "detailTrades", "name")}
                ${renderSortableHeader("进场日", "detailTrades", "entry_date", true)}
                ${renderSortableHeader("离场日", "detailTrades", "exit_date", true)}
                ${renderSortableHeader("评分", "detailTrades", "score", true)}
                ${renderSortableHeader("收益", "detailTrades", "return_pct", true)}
                ${renderSortableHeader("持有天数", "detailTrades", "hold_days", true)}
                ${renderSortableHeader("离场原因", "detailTrades", "exit_reason")}
              </tr>
            </thead>
            <tbody>
              ${visibleTrades
                .map(
                  (row) => `
                    <tr>
                      <td>${stockCell(row)}</td>
                      <td class="align-right">${rightCell(formatDate(row.entry_date))}</td>
                      <td class="align-right">${rightCell(formatDate(row.exit_date))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.score))}</td>
                      <td class="align-right">${rightCell(returnText(row.return_pct))}</td>
                      <td class="align-right">${rightCell(formatInteger(row.hold_days))}</td>
                      <td>${escapeHtml(exitReasonLabel(row.exit_reason, row.stop_source))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-card">
        <div class="section-head compact">
          <div>
            <p class="eyebrow">信号明细</p>
            <h3 class="section-title">按排序规则展示前 ${formatLimitLabel(
              state.tableLimits.detailSignals
            )} 条信号</h3>
          </div>
          ${renderTableToolbar({
            tableId: "detailSignals",
            total: signalRows.length,
            path: `./data/lens/${strategyId}/signals.csv`,
          })}
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                ${renderSortableHeader("股票", "detailSignals", "name")}
                ${renderSortableHeader("信号日", "detailSignals", "signal_date", true)}
                ${renderSortableHeader("评分", "detailSignals", "score", true)}
                ${renderSortableHeader("形态类型", "detailSignals", "entry_type")}
                ${renderSortableHeader("信号收盘", "detailSignals", "signal_close", true)}
                ${renderSortableHeader("信号低点", "detailSignals", "signal_low", true)}
              </tr>
            </thead>
            <tbody>
              ${visibleSignals
                .map(
                  (row) => `
                    <tr>
                      <td>${stockCell(row)}</td>
                      <td class="align-right">${rightCell(formatDate(row.signal_date))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.score))}</td>
                      <td>${escapeHtml(entryTypeLabel(row.entry_type))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.signal_close))}</td>
                      <td class="align-right">${rightCell(formatNumber(row.signal_low))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

async function loadDetail(strategyId) {
  if (state.detailCache.has(strategyId)) {
    return state.detailCache.get(strategyId);
  }

  const [summary, equity, benchmark, trades, signals, notes] = await Promise.all([
    fetchJson(`./data/lens/${strategyId}/summary.json`),
    fetchCsv(`./data/lens/${strategyId}/equity_curve.csv`),
    fetchCsvOptional(`./data/lens/${strategyId}/benchmark_curve.csv`),
    fetchCsv(`./data/lens/${strategyId}/trades.csv`),
    fetchCsv(`./data/lens/${strategyId}/signals.csv`),
    fetchText(`./data/lens/${strategyId}/strategy_notes.md`),
  ]);

  const detail = { summary, equity, benchmark, trades, signals, notes };
  state.detailCache.set(strategyId, detail);
  return detail;
}

function handleDocumentClick(event) {
  const chartTrigger = event.target.closest("[data-chart-action], [data-chart-zoom]");
  if (chartTrigger) {
    if (chartTrigger.dataset.chartAction) {
      stepChartZoom(chartTrigger.dataset.strategyId, chartTrigger.dataset.chartAction);
      return;
    }
    if (chartTrigger.dataset.chartZoom) {
      setChartZoom(chartTrigger.dataset.strategyId, chartTrigger.dataset.chartZoom);
      return;
    }
  }

  const sortTrigger = event.target.closest("[data-sort-key]");
  if (sortTrigger) {
    toggleSort(sortTrigger.dataset.sortTable, sortTrigger.dataset.sortKey);
    return;
  }

  const limitTrigger = event.target.closest("[data-table-limit]");
  if (limitTrigger) {
    const rawValue = limitTrigger.dataset.tableLimit;
    setTableLimit(limitTrigger.dataset.tableId, rawValue === "all" ? "all" : Number(rawValue));
  }
}

function handleDocumentMouseMove(event) {
  const chartStage = event.target.closest("[data-equity-chart]");
  if (!chartStage) {
    hideAllChartTooltips();
    return;
  }
  updateChartTooltip(chartStage, event);
}

function toggleSort(tableId, sortKey) {
  const current = state.sortState[tableId] || { key: sortKey, direction: "desc" };
  if (current.key === sortKey) {
    current.direction = current.direction === "desc" ? "asc" : "desc";
  } else {
    current.key = sortKey;
    current.direction = SORT_DEFAULTS[tableId]?.key === sortKey ? SORT_DEFAULTS[tableId].direction : "desc";
  }
  state.sortState[tableId] = current;
  renderRoute();
}

function setTableLimit(tableId, value) {
  state.tableLimits[tableId] = value;
  renderRoute();
}

function setChartZoom(strategyId, zoomKey) {
  if (!strategyId) {
    return;
  }
  state.chartZoomByStrategy[strategyId] = zoomKey;
  renderRoute();
}

function stepChartZoom(strategyId, action) {
  if (!strategyId) {
    return;
  }
  const currentKey = state.chartZoomByStrategy[strategyId] || "all";
  const currentIndex = Math.max(
    0,
    CHART_ZOOM_PRESETS.findIndex((preset) => preset.key === currentKey)
  );
  const offset = action === "in" ? 1 : -1;
  const nextIndex = Math.min(
    CHART_ZOOM_PRESETS.length - 1,
    Math.max(0, currentIndex + offset)
  );
  state.chartZoomByStrategy[strategyId] = CHART_ZOOM_PRESETS[nextIndex].key;
  renderRoute();
}

function sortRows(rows, tableId) {
  const settings = state.sortState[tableId];
  if (!settings?.key) {
    return [...rows];
  }
  const factor = settings.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => factor * compareValues(left[settings.key], right[settings.key]));
}

function compareValues(left, right) {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null || left === "") {
    return 1;
  }
  if (right === undefined || right === null || right === "") {
    return -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return leftTime - rightTime;
  }
  return String(left).localeCompare(String(right), "zh-CN");
}

function applyTableLimit(rows, tableId) {
  const limit = state.tableLimits[tableId];
  if (limit === "all" || !Number.isFinite(limit)) {
    return rows;
  }
  return rows.slice(0, limit);
}

function renderStrategyCard(item) {
  const metric = state.metrics.find((row) => row.strategy_id === item.strategy_id) || item;
  const badges = Array.isArray(metric.badges) ? metric.badges : [];
  const summaryPills = Array.isArray(metric.parameter_summary) && metric.parameter_summary.length
    ? metric.parameter_summary
        .slice(0, 4)
        .map((entry) => `<span class="mini-pill">${escapeHtml(entry.label)}：${escapeHtml(entry.value)}</span>`)
        .join("")
    : parameterPills(item.core_parameters);
  return `
    <a class="strategy-card" href="#/strategy/${item.strategy_id}">
      <div class="card-topline">
        <span class="strategy-code">${escapeHtml(item.strategy_id)}</span>
        <span class="mini-time">${formatDateTime(metric.last_backtest_time || item.last_backtest_time)}</span>
      </div>
      <div class="summary-pill-wrap">${badges.map((badge) => `<span class="summary-pill">${escapeHtml(badge)}</span>`).join("")}</div>
      <h4>${escapeHtml(item.strategy_name)}</h4>
      <p class="panel-subtitle">${escapeHtml(metric.notes_excerpt || "本地最新回测结果摘要。")}</p>
      <div class="parameter-row">${summaryPills}</div>
      <div class="strategy-stats">
        ${statCard("信号数", formatInteger(metric.signal_count))}
        ${statCard("胜率", formatPercent(metric.win_rate))}
        ${statCard("年化收益", formatPercent(metric.annualized_return_pct))}
        ${statCard("Sharpe", formatNumber(metric.sharpe))}
      </div>
    </a>
  `;
}

function parameterPills(parameters) {
  return Object.entries(parameters)
    .slice(0, 4)
    .map(
      ([key, value]) =>
        `<span class="mini-pill">${escapeHtml(parameterLabel(key))}：${escapeHtml(formatParameterValue(key, value))}</span>`
    )
    .join("");
}

function renderEquityChart(rows, strategyId, summary, benchmarkRows = []) {
  if (!rows.length) {
    return `<div class="subtle-copy">暂无资金曲线数据。</div>`;
  }

  const displayRows = buildDisplayEquityRows(rows, summary?.date_range);
  const displayBenchmarkRows = buildDisplayBenchmarkRows(benchmarkRows, displayRows);
  const zoomKey = state.chartZoomByStrategy[strategyId] || "all";
  const visibleRows = sliceRowsByZoom(displayRows, zoomKey);
  const visibleBenchmarkRows = sliceRowsByZoom(displayBenchmarkRows, zoomKey);
  const currentZoomIndex = Math.max(
    0,
    CHART_ZOOM_PRESETS.findIndex((preset) => preset.key === zoomKey)
  );
  const canZoomOut = currentZoomIndex > 0;
  const canZoomIn = currentZoomIndex < CHART_ZOOM_PRESETS.length - 1;
  const firstRow = visibleRows[0];
  const lastRow = visibleRows[visibleRows.length - 1];
  const gradientId = `equityGradient-${strategyId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const chartModel = buildEquityChartModel(visibleRows, {
    width: 760,
    height: 320,
    paddingTop: 20,
    paddingRight: 18,
    paddingBottom: 42,
    paddingLeft: 62,
  }, [visibleBenchmarkRows.map((row) => Number(row.equity))]);
  const xTickLabels =
    visibleRows.length < displayRows.length ? `当前显示 ${CHART_ZOOM_PRESETS[currentZoomIndex].label}` : "当前显示全部区间";
  const intervalStats = buildIntervalStats(visibleRows, visibleBenchmarkRows);
  const lastActiveDate = rows[rows.length - 1]?.date;
  const benchmarkMeta = summary?.benchmark || {};
  const benchmarkLabel = benchmarkMeta.benchmark_name || "沪深300";

  return `
    <div class="chart-toolbar">
      <div class="chart-toolbar-group">
        <button type="button" class="limit-button" data-chart-action="out" data-strategy-id="${strategyId}" ${
          canZoomOut ? "" : "disabled"
        }>缩小</button>
        <button type="button" class="limit-button" data-chart-action="in" data-strategy-id="${strategyId}" ${
          canZoomIn ? "" : "disabled"
        }>放大</button>
      </div>
      <div class="chart-toolbar-group">
        ${CHART_ZOOM_PRESETS.map(
          (preset) => `<button type="button" class="limit-button ${
            zoomKey === preset.key ? "limit-button-active" : ""
          }" data-chart-zoom="${preset.key}" data-strategy-id="${strategyId}">${preset.label}</button>`
        ).join("")}
      </div>
    </div>
    <div class="chart-insight-row">
      ${chartInsightCard("区间收益", returnText(intervalStats.returnPct))}
      ${chartInsightCard("区间年化", returnText(intervalStats.annualizedReturnPct))}
      ${chartInsightCard("区间最大回撤", returnText(intervalStats.maxDrawdownPct))}
      ${chartInsightCard("区间年化波动", formatPercent(intervalStats.annualizedVolatilityPct))}
      ${chartInsightCard("活跃交易日", formatInteger(intervalStats.activeDays))}
      ${chartInsightCard(`${benchmarkLabel}收益`, returnText(intervalStats.benchmarkReturnPct))}
      ${chartInsightCard("超额收益", returnText(intervalStats.excessReturnPct))}
    </div>
    <div class="chart-stage" data-equity-chart="${strategyId}">
    <div class="chart-tooltip" data-chart-tooltip hidden></div>
    <div class="chart-hover-rule" data-chart-hover-rule hidden></div>
    <div class="chart-hover-point" data-chart-hover-point hidden></div>
    <svg class="chart-frame" viewBox="0 0 760 320" preserveAspectRatio="none" role="img" aria-label="资金曲线图表">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(207, 78, 62, 0.30)"></stop>
          <stop offset="100%" stop-color="rgba(207, 78, 62, 0.02)"></stop>
        </linearGradient>
      </defs>
      ${chartModel.yTicks
        .map(
          (tick) => `
            <line class="chart-grid-line" x1="${chartModel.plot.left}" y1="${tick.y}" x2="${chartModel.plot.right}" y2="${tick.y}"></line>
            <text class="chart-axis-text chart-axis-text-y" x="${chartModel.plot.left - 10}" y="${tick.y + 4}">${escapeHtml(
              formatNumber(tick.value)
            )}</text>
          `
        )
        .join("")}
      ${chartModel.xTicks
        .map(
          (tick) => `
            <line class="chart-grid-line chart-grid-line-vertical" x1="${tick.x}" y1="${chartModel.plot.top}" x2="${tick.x}" y2="${chartModel.plot.bottom}"></line>
            <text class="chart-axis-text chart-axis-text-x" x="${tick.x}" y="${chartModel.plot.bottom + 24}">${escapeHtml(
              formatDate(tick.date)
            )}</text>
          `
        )
        .join("")}
      <line class="chart-axis" x1="${chartModel.plot.left}" y1="${chartModel.plot.bottom}" x2="${chartModel.plot.right}" y2="${chartModel.plot.bottom}"></line>
      <line class="chart-axis" x1="${chartModel.plot.left}" y1="${chartModel.plot.top}" x2="${chartModel.plot.left}" y2="${chartModel.plot.bottom}"></line>
      <polygon class="chart-area" points="${chartModel.areaPoints}" fill="url(#${gradientId})"></polygon>
      ${
        visibleBenchmarkRows.length
          ? `<polyline class="chart-line chart-line-benchmark" points="${chartModel.secondaryLinePoints.join(" ")}"></polyline>`
          : ""
      }
      <polyline class="chart-line" points="${chartModel.linePoints}"></polyline>
    </svg>
    </div>
    <div class="chart-legend">
      <span class="chart-legend-item"><span class="chart-legend-swatch chart-legend-swatch-strategy"></span>策略净值</span>
      ${
        visibleBenchmarkRows.length
          ? `<span class="chart-legend-item"><span class="chart-legend-swatch chart-legend-swatch-benchmark"></span>${escapeHtml(benchmarkLabel)}</span>`
          : ""
      }
    </div>
    <div class="chart-footer">
      <div>
        <span class="chart-label">显示起点</span>
        <strong>${formatDate(firstRow.date)}</strong>
      </div>
      <div>
        <span class="chart-label">时间轴</span>
        <strong>${escapeHtml(xTickLabels)}</strong>
      </div>
      <div>
        <span class="chart-label">显示终点</span>
        <strong>${formatDate(lastRow.date)}</strong>
      </div>
      <div>
        <span class="chart-label">区间收益</span>
        <strong>${returnText(intervalStats.returnPct)}</strong>
      </div>
      <div>
        <span class="chart-label">区间年化</span>
        <strong>${returnText(intervalStats.annualizedReturnPct)}</strong>
      </div>
      <div>
        <span class="chart-label">${escapeHtml(benchmarkLabel)}区间收益</span>
        <strong>${returnText(intervalStats.benchmarkReturnPct)}</strong>
      </div>
      <div>
        <span class="chart-label">区间超额收益</span>
        <strong>${returnText(intervalStats.excessReturnPct)}</strong>
      </div>
      <div>
        <span class="chart-label">最新净值</span>
        <strong>${formatNumber(lastRow.equity)}</strong>
      </div>
      <div>
        <span class="chart-label">最后有持仓日期</span>
        <strong>${formatDate(lastActiveDate)}</strong>
      </div>
    </div>
  `;
}

function renderNotes(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) {
      return;
    }
    html.push(`<ul class="note-list">${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      html.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      html.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
      return;
    }
    if (trimmed.startsWith("- ")) {
      listItems.push(formatInline(trimmed.slice(2)));
      return;
    }
    flushList();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  });

  flushList();
  return html.join("");
}

function renderSortableHeader(label, tableId, key, alignRight = false) {
  const current = state.sortState[tableId];
  const active = current?.key === key;
  const direction = active ? current.direction : null;
  const indicator = direction === "desc" ? "↓" : direction === "asc" ? "↑" : "↕";
  const className = alignRight ? "align-right" : "";
  const ariaSort = !active ? "none" : direction === "asc" ? "ascending" : "descending";
  return `
    <th class="${className}" aria-sort="${ariaSort}">
      <button type="button" class="sort-button ${active ? "sort-button-active" : ""}" data-sort-table="${tableId}" data-sort-key="${key}">
        <span>${escapeHtml(label)}</span>
        <span class="sort-indicator">${indicator}</span>
      </button>
    </th>
  `;
}

function renderTableToolbar({ tableId, total, path }) {
  const currentLimit = state.tableLimits[tableId];
  const visibleCount = applyTableLimit(new Array(total).fill(0), tableId).length;
  return `
    <div class="table-toolbar">
      <div class="table-meta">已显示 ${formatInteger(visibleCount)} / ${formatInteger(total)} 条</div>
      <div class="table-toolbar-actions">
        ${["50", "100", "300", "all"]
          .map((value) => {
            const normalized = value === "all" ? "all" : Number(value);
            const active = currentLimit === normalized;
            const label = value === "all" ? "全部" : value;
            return `<button type="button" class="limit-button ${active ? "limit-button-active" : ""}" data-table-id="${tableId}" data-table-limit="${value}">${label}</button>`;
          })
          .join("")}
        <a class="download-link" href="${path}">下载 CSV</a>
      </div>
    </div>
  `;
}

function metricCard(label, title, value, hint) {
  return `
    <article class="metric-card">
      <p class="metric-label">${escapeHtml(label)}</p>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-hint"><strong>${escapeHtml(title)}</strong><br />${escapeHtml(hint)}</div>
    </article>
  `;
}

function statCard(label, value) {
  return `
    <div class="stat-block">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function methodCard(label, value, copy) {
  return `
    <article class="method-entry">
      <p class="metric-label">${escapeHtml(label)}</p>
      <h4>${escapeHtml(value)}</h4>
      <p class="subtle-copy">${escapeHtml(copy)}</p>
    </article>
  `;
}

function chartInsightCard(label, value) {
  return `
    <div class="chart-insight-card">
      <span class="chart-label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function stockCell(row) {
  const name = safeText(row.name, row.symbol);
  return `
    <div class="stock-cell">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(safeText(row.symbol))}</span>
    </div>
  `;
}

function sampleTagLabel(value) {
  return SAMPLE_TAG_LABELS[value] || safeText(value);
}

function entryTypeLabel(value) {
  return ENTRY_TYPE_LABELS[value] || safeText(value);
}

function exitReasonLabel(value, stopSource = "") {
  if (value === "gap_stop") {
    if (["profit_lock", "peak_drawdown", "trailing_atr"].includes(stopSource)) {
      return `${STOP_SOURCE_LABELS[stopSource]}跳空触发`;
    }
    return EXIT_REASON_LABELS[value] || safeText(value);
  }
  if (value === "stop_loss" && ["profit_lock", "peak_drawdown", "trailing_atr"].includes(stopSource)) {
    return `${STOP_SOURCE_LABELS[stopSource]}触发`;
  }
  return EXIT_REASON_LABELS[value] || safeText(value);
}

function parameterLabel(key) {
  return PARAMETER_LABELS[key] || key;
}

function formatParameterValue(key, value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (key.endsWith("_pct") || key === "dry_up_days_ratio_min") {
      return `${numeric.toFixed(2)}%`;
    }
    if (Number.isInteger(numeric)) {
      return String(numeric);
    }
    return numeric.toFixed(2);
  }
  return String(value);
}

function returnText(value) {
  const className = Number(value) > 0 ? "value-up" : Number(value) < 0 ? "value-down" : "value-flat";
  return `<span class="${className}">${formatPercent(value)}</span>`;
}

function rightCell(content) {
  return `<span class="cell-inline cell-inline-right">${content}</span>`;
}

function formatLimitLabel(limit) {
  return limit === "all" ? "全部" : String(limit);
}

function formatInline(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function polylinePoints(values, width, height, padding) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * innerWidth;
      const y = height - padding - ((value - min) / span) * innerHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildEquityChartModel(rows, dimensions, extraSeries = []) {
  const values = rows.map((row) => Number(row.equity));
  extraSeries.forEach((series) => {
    series.forEach((value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        values.push(numeric);
      }
    });
  });
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || Math.max(maxValue * 0.04, 0.2);
  const paddedMin = Math.max(0, minValue - span * 0.08);
  const paddedMax = maxValue + span * 0.08;
  const plot = {
    left: dimensions.paddingLeft,
    right: dimensions.width - dimensions.paddingRight,
    top: dimensions.paddingTop,
    bottom: dimensions.height - dimensions.paddingBottom,
  };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const valueSpan = paddedMax - paddedMin || 1;

  const linePoints = rows
    .map((row, index) => {
      const x = plot.left + (index / Math.max(rows.length - 1, 1)) * plotWidth;
      const y = plot.bottom - ((Number(row.equity) - paddedMin) / valueSpan) * plotHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const secondaryLinePoints = extraSeries.map((series) =>
    rows
      .map((_, index) => {
        const value = Number(series[index]);
        const normalizedValue = Number.isFinite(value) ? value : 1.0;
        const x = plot.left + (index / Math.max(rows.length - 1, 1)) * plotWidth;
        const y = plot.bottom - ((normalizedValue - paddedMin) / valueSpan) * plotHeight;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ")
  );

  const areaPoints = `${linePoints} ${plot.right.toFixed(2)},${plot.bottom.toFixed(2)} ${plot.left.toFixed(
    2
  )},${plot.bottom.toFixed(2)}`;

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = paddedMax - ratio * valueSpan;
    const y = plot.top + ratio * plotHeight;
    return { value, y: Number(y.toFixed(2)) };
  });

  const xTickIndexes = uniqueSortedIndexes(
    Array.from({ length: Math.min(5, rows.length) }, (_, index) =>
      Math.round((index / Math.max(Math.min(5, rows.length) - 1, 1)) * (rows.length - 1))
    )
  );
  const xTicks = xTickIndexes.map((rowIndex) => {
    const ratio = rowIndex / Math.max(rows.length - 1, 1);
    const x = plot.left + ratio * plotWidth;
    return { x: Number(x.toFixed(2)), date: rows[rowIndex].date };
  });

  return { plot, linePoints, secondaryLinePoints, areaPoints, xTicks, yTicks };
}

function uniqueSortedIndexes(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sliceRowsByZoom(rows, zoomKey) {
  const preset = CHART_ZOOM_PRESETS.find((item) => item.key === zoomKey) || CHART_ZOOM_PRESETS[0];
  if (!preset.months) {
    return rows;
  }
  const lastDate = new Date(rows[rows.length - 1].date);
  if (Number.isNaN(lastDate.getTime())) {
    return rows;
  }
  const threshold = new Date(lastDate);
  threshold.setMonth(threshold.getMonth() - preset.months);
  const filtered = rows.filter((row) => {
    const currentDate = new Date(row.date);
    return !Number.isNaN(currentDate.getTime()) && currentDate >= threshold;
  });
  return filtered.length >= 2 ? filtered : rows;
}

function buildDisplayEquityRows(rows, dateRange = {}) {
  const startDate = parseDateValue(dateRange.start_date);
  const endDate = parseDateValue(dateRange.end_date);
  const parsedRows = rows
    .map((row) => ({
      ...row,
      equity: Number(row.equity),
      portfolio_return: Number(row.portfolio_return),
      active_trades: Number(row.active_trades),
      drawdown: Number(row.drawdown),
      _date: parseDateValue(row.date),
    }))
    .filter((row) => row._date);

  if (!parsedRows.length) {
    return rows;
  }

  const effectiveStart = startDate || parsedRows[0]._date;
  const effectiveEnd = endDate || parsedRows[parsedRows.length - 1]._date;
  const byDate = new Map(parsedRows.map((row) => [formatIsoDate(row._date), row]));
  const output = [];
  let cursor = new Date(effectiveStart);
  let previousEquity = 1.0;
  let previousDrawdown = 0;
  let seenFirstActual = false;

  while (cursor <= effectiveEnd) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const key = formatIsoDate(cursor);
    const actual = byDate.get(key);
    if (actual) {
      previousEquity = Number.isFinite(actual.equity) ? actual.equity : previousEquity;
      previousDrawdown = Number.isFinite(actual.drawdown) ? actual.drawdown : previousDrawdown;
      seenFirstActual = true;
      output.push({
        date: key,
        active_trades: actual.active_trades,
        portfolio_return: actual.portfolio_return,
        equity: previousEquity,
        drawdown: previousDrawdown,
      });
    } else {
      output.push({
        date: key,
        active_trades: 0,
        portfolio_return: 0,
        equity: seenFirstActual ? previousEquity : 1.0,
        drawdown: seenFirstActual ? previousDrawdown : 0,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return output;
}

function buildDisplayBenchmarkRows(rows, equityRows) {
  if (!rows.length || !equityRows.length) {
    return [];
  }
  const parsedRows = rows
    .map((row) => ({
      ...row,
      equity: Number(row.equity),
      benchmark_return: Number(row.benchmark_return || 0),
      _date: parseDateValue(row.date),
    }))
    .filter((row) => row._date && Number.isFinite(row.equity));
  if (!parsedRows.length) {
    return [];
  }

  const byDate = new Map(parsedRows.map((row) => [formatIsoDate(row._date), row]));
  let previousEquity = 1.0;
  let previousReturn = 0;
  let seenFirstActual = false;

  return equityRows.map((row) => {
    const actual = byDate.get(row.date);
    if (actual) {
      previousEquity = actual.equity;
      previousReturn = actual.benchmark_return;
      seenFirstActual = true;
      return {
        date: row.date,
        equity: previousEquity,
        benchmark_return: previousReturn,
      };
    }
    return {
      date: row.date,
      equity: seenFirstActual ? previousEquity : 1.0,
      benchmark_return: 0,
    };
  });
}

function buildIntervalStats(rows, benchmarkRows = []) {
  if (!rows.length) {
    return {
      returnPct: 0,
      annualizedReturnPct: 0,
      maxDrawdownPct: 0,
      annualizedVolatilityPct: 0,
      activeDays: 0,
      benchmarkReturnPct: 0,
      benchmarkAnnualizedReturnPct: 0,
      excessReturnPct: 0,
    };
  }
  const firstEquity = Number(rows[0].equity);
  const lastEquity = Number(rows[rows.length - 1].equity);
  const startDate = parseDateValue(rows[0].date);
  const endDate = parseDateValue(rows[rows.length - 1].date);
  const totalReturnPct = firstEquity > 0 ? ((lastEquity / firstEquity) - 1) * 100 : 0;
  const returns = rows.map((row) => Number(row.portfolio_return || 0));
  const activeDays = rows.filter((row) => Number(row.active_trades || 0) > 0).length;
  let annualizedReturnPct = totalReturnPct;
  if (startDate && endDate && endDate > startDate && firstEquity > 0 && lastEquity > 0) {
    const days = Math.max(1, Math.round((endDate - startDate) / 86400000));
    annualizedReturnPct = (Math.pow(lastEquity / firstEquity, 365.25 / days) - 1) * 100;
  }
  const maxDrawdownPct = Math.min(...rows.map((row) => Number(row.drawdown || 0))) * 100;
  const meanReturn = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - meanReturn, 2), 0) / Math.max(returns.length, 1);
  const annualizedVolatilityPct = Math.sqrt(252) * Math.sqrt(variance) * 100;
  const benchmarkFirstEquity = benchmarkRows.length ? Number(benchmarkRows[0].equity) : 1;
  const benchmarkLastEquity = benchmarkRows.length ? Number(benchmarkRows[benchmarkRows.length - 1].equity) : 1;
  const benchmarkReturnPct =
    benchmarkRows.length && benchmarkFirstEquity > 0 ? ((benchmarkLastEquity / benchmarkFirstEquity) - 1) * 100 : 0;
  let benchmarkAnnualizedReturnPct = benchmarkReturnPct;
  if (benchmarkRows.length && startDate && endDate && endDate > startDate && benchmarkFirstEquity > 0 && benchmarkLastEquity > 0) {
    const days = Math.max(1, Math.round((endDate - startDate) / 86400000));
    benchmarkAnnualizedReturnPct = (Math.pow(benchmarkLastEquity / benchmarkFirstEquity, 365.25 / days) - 1) * 100;
  }
  return {
    returnPct: totalReturnPct,
    annualizedReturnPct,
    maxDrawdownPct,
    annualizedVolatilityPct,
    activeDays,
    benchmarkReturnPct,
    benchmarkAnnualizedReturnPct,
    excessReturnPct: totalReturnPct - benchmarkReturnPct,
  };
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getChartDisplayData(strategyId) {
  const detail = state.detailCache.get(strategyId);
  if (!detail) {
    return null;
  }
  const displayRows = buildDisplayEquityRows(detail.equity, detail.summary?.date_range);
  const displayBenchmarkRows = buildDisplayBenchmarkRows(detail.benchmark || [], displayRows);
  const zoomKey = state.chartZoomByStrategy[strategyId] || "all";
  const visibleRows = sliceRowsByZoom(displayRows, zoomKey);
  const visibleBenchmarkRows = sliceRowsByZoom(displayBenchmarkRows, zoomKey);
  const chartModel = buildEquityChartModel(visibleRows, {
    width: 760,
    height: 320,
    paddingTop: 20,
    paddingRight: 18,
    paddingBottom: 42,
    paddingLeft: 62,
  }, [visibleBenchmarkRows.map((row) => Number(row.equity))]);
  return { visibleRows, visibleBenchmarkRows, chartModel };
}

function updateChartTooltip(chartStage, event) {
  const strategyId = chartStage.dataset.equityChart;
  const chartData = getChartDisplayData(strategyId);
  if (!chartData || !chartData.visibleRows.length) {
    hideChartTooltip(chartStage);
    return;
  }

  const svg = chartStage.querySelector(".chart-frame");
  const tooltip = chartStage.querySelector("[data-chart-tooltip]");
  const hoverRule = chartStage.querySelector("[data-chart-hover-rule]");
  const hoverPoint = chartStage.querySelector("[data-chart-hover-point]");
  if (!svg || !tooltip || !hoverRule || !hoverPoint) {
    return;
  }

  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const relativeX = event.clientX - rect.left;
  const plot = chartData.chartModel.plot;
  const plotLeftPx = (plot.left / 760) * rect.width;
  const plotRightPx = (plot.right / 760) * rect.width;
  if (relativeX < plotLeftPx || relativeX > plotRightPx) {
    hideChartTooltip(chartStage);
    return;
  }

  const ratio = (relativeX - plotLeftPx) / Math.max(plotRightPx - plotLeftPx, 1);
  const index = Math.min(
    chartData.visibleRows.length - 1,
    Math.max(0, Math.round(ratio * (chartData.visibleRows.length - 1)))
  );
  const row = chartData.visibleRows[index];
  const benchmarkRow = chartData.visibleBenchmarkRows[index];
  const point = chartData.chartModel.linePoints
    .split(" ")
    [index]?.split(",")
    .map((value) => Number(value));
  if (!point || point.length !== 2) {
    hideChartTooltip(chartStage);
    return;
  }

  const xPx = (point[0] / 760) * rect.width;
  const yPx = (point[1] / 320) * rect.height;
  const stageRect = chartStage.getBoundingClientRect();
  const localX = event.clientX - stageRect.left;
  const localY = event.clientY - stageRect.top;

  hoverRule.hidden = false;
  hoverPoint.hidden = false;
  tooltip.hidden = false;

  hoverRule.style.left = `${xPx}px`;
  hoverRule.style.top = `${(plot.top / 320) * rect.height}px`;
  hoverRule.style.height = `${((plot.bottom - plot.top) / 320) * rect.height}px`;
  hoverPoint.style.left = `${xPx}px`;
  hoverPoint.style.top = `${yPx}px`;

  tooltip.innerHTML = `
    <div class="chart-tooltip-date">${escapeHtml(formatDate(row.date))}</div>
    <div>净值：<strong>${escapeHtml(formatNumber(row.equity))}</strong></div>
    ${
      benchmarkRow
        ? `<div>沪深300：<strong>${escapeHtml(formatNumber(benchmarkRow.equity))}</strong></div>`
        : ""
    }
    <div>当日收益：<strong>${returnText(Number(row.portfolio_return || 0) * 100)}</strong></div>
    <div>回撤：<strong>${returnText(Number(row.drawdown || 0) * 100)}</strong></div>
    <div>活跃持仓：<strong>${escapeHtml(formatInteger(row.active_trades || 0))}</strong></div>
  `;

  const tooltipWidth = 200;
  const tooltipLeft = Math.min(
    Math.max(12, localX + 18),
    Math.max(12, stageRect.width - tooltipWidth - 12)
  );
  const tooltipTop = Math.max(12, localY - 18);
  tooltip.style.left = `${tooltipLeft}px`;
  tooltip.style.top = `${tooltipTop}px`;
}

function hideChartTooltip(chartStage) {
  if (!chartStage) {
    return;
  }
  const tooltip = chartStage.querySelector("[data-chart-tooltip]");
  const hoverRule = chartStage.querySelector("[data-chart-hover-rule]");
  const hoverPoint = chartStage.querySelector("[data-chart-hover-point]");
  if (tooltip) {
    tooltip.hidden = true;
  }
  if (hoverRule) {
    hoverRule.hidden = true;
  }
  if (hoverPoint) {
    hoverPoint.hidden = true;
  }
}

function hideAllChartTooltips() {
  document.querySelectorAll("[data-equity-chart]").forEach((chartStage) => hideChartTooltip(chartStage));
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.text();
}

async function fetchCsv(path) {
  return parseCsv(await fetchText(path));
}

async function fetchCsvOptional(path) {
  const response = await fetch(path);
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return parseCsv(await response.text());
}

function parseCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const lines = trimmed.split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = castValue(values[index] ?? "");
    });
    return row;
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function castValue(value) {
  if (value === "") {
    return "";
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function formatPercent(value) {
  return `${formatNumber(value)}%`;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Math.abs(numeric) >= 100 ? 1 : 2,
    minimumFractionDigits: Math.abs(numeric) < 10 ? 2 : 1,
  }).format(numeric);
}

function formatInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(numeric);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeText(value, fallback = "—") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
