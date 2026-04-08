# Quant Strategy Lens

`Quant Strategy Lens` 是一个面向 A 股量化研究结果的静态前端看板，用来展示 `quant-strategy` 工程导出的统一回测结果。

当前版本会自动发现并展示 `quant-strategy/outputs/lens` 下的全部已导出策略。

页面提供：

- 中文策略总览
- 多指标排序
- 策略详情页
- 资金曲线、交易明细、信号明细
- 代表样本快速复核

## 数据来源

前端数据来自本地研究工程：

- `F:\\Codex\\projects\\quant-strategy\\outputs\\lens`

同步脚本会把 `lens` 目录里的官方回测结果复制到当前仓库的 `data/` 目录，并按目录中真实存在的策略自动重建中文总览摘要。

## 快速启动

```powershell
python .\scripts\serve_dashboard.py
```

这个命令会先同步最新数据，再启动本地静态服务。  
服务会从 `http://127.0.0.1:8765/` 开始寻找空闲端口。

## 手动同步数据

```powershell
python .\scripts\sync_lens_data.py
```

## 项目结构

- `index.html`：页面骨架
- `styles.css`：视觉系统与响应式布局
- `app.js`：路由、数据读取、表格排序、图表渲染
- `data/`：同步后的静态结果数据
- `scripts/sync_lens_data.py`：同步 `quant-strategy` 导出并生成前端摘要
- `scripts/serve_dashboard.py`：同步并启动本地静态服务

## 设计方向

当前视觉方向是“浅色研究终端 + 财经纸面感”：

- 保持中文信息密度
- 强调策略比较与人工复核
- 避免过度花哨的卡片堆砌
- 让排序、表格、曲线和参数说明成为视觉主角
