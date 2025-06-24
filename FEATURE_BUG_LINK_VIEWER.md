# Bug Link Viewer Feature

## 功能概述

Swift Bug 扩展新增了一个自动检测和查看 Bug 报告链接的功能。当网页上存在文本匹配 `swiftbug-report.*.json` 模式的链接时，扩展会自动在链接旁边添加一个"查看"按钮，点击后可以直接查看 Bug 报告的详细信息。

## 功能特点

### 🔍 自动检测
- 扫描页面上所有的 `<a>` 标签
- 匹配文本符合 `swiftbug-report.*.json` 模式的链接
- 支持大小写不敏感匹配
- 使用 MutationObserver 监听动态添加的内容

### 🎯 智能识别
支持的链接格式包括：
- `swiftbug-report-example.com-20250624-1750739244724.json`
- `SwiftBug-Report-Test-12345.json`
- `swiftbug-report.json`

不匹配的格式：
- `normal-file.json`（缺少 swiftbug-report 前缀）
- `bug-report.json`（缺少 swift 前缀）
- `swiftbug-report.txt`（非 JSON 文件）

### 🔘 查看按钮
- 绿色渐变背景，与扩展主题保持一致
- 悬停效果和点击反馈
- 加载状态显示（"加载中..."）
- 错误处理和用户友好的错误提示

### 📋 详情展示
- 全屏模态框显示 Bug 报告详情
- 支持以下数据展示：
  - 基本信息（URL、标题、时间、用户代理等）
  - 页面截图（如果有）
  - 浏览器存储数据（localStorage、sessionStorage）
  - Cookies 信息
  - 控制台日志
  - 网络请求记录（如果有）

## 技术实现

### 架构设计
```
Content Script (content.js)
├── BugLinkDetector - 链接检测和按钮注入
├── ContentModalManager - 模态框管理
└── 样式注入和事件处理

Background Script (background.js)
└── fetchBugReportFromUrl - JSON文件获取和解析

CSS (inject.css)
├── .bug-view-btn - 查看按钮样式
├── .swiftbug-content-modal - 模态框样式
└── 响应式设计支持
```

### 核心类

#### BugLinkDetector
- `scanExistingLinks()` - 扫描现有链接
- `setupMutationObserver()` - 监听DOM变化
- `processLink()` - 处理匹配的链接
- `addViewButton()` - 添加查看按钮
- `fetchBugReport()` - 获取Bug报告数据

#### ContentModalManager
- `showBugDetailModal()` - 显示模态框
- `generateBugDetailHTML()` - 生成详情HTML
- `closeBugDetailModal()` - 关闭模态框
- 键盘快捷键支持（ESC关闭）

### 数据格式支持

#### 导出格式
```json
{
  "version": "1.0.0",
  "exportedAt": "2025-06-24T05:37:00.000Z",
  "report": {
    "id": "bug_1719234567890_abcdef123",
    "timestamp": "2025-06-24T05:37:00.000Z",
    "title": "Bug Report - example.com",
    "url": "https://example.com/page",
    "userAgent": "Mozilla/5.0...",
    "localStorage": {},
    "sessionStorage": {},
    "consoleLog": [],
    "cookies": [],
    "screenshot": "data:image/png;base64,..."
  }
}
```

#### 直接格式
```json
{
  "id": "bug_1719234567890_abcdef123",
  "timestamp": "2025-06-24T05:37:00.000Z",
  "title": "Bug Report - example.com",
  "url": "https://example.com/page",
  // ... 其他字段
}
```

## 用户体验

### 使用流程
1. 用户访问包含 Bug 报告链接的页面
2. 扩展自动检测并在匹配的链接旁添加"查看"按钮
3. 用户点击"查看"按钮
4. 扩展获取并解析 JSON 文件
5. 在模态框中展示详细的 Bug 报告信息

### 交互特性
- **无侵入性**：不影响原有页面布局和功能
- **响应式设计**：支持不同屏幕尺寸
- **错误处理**：网络错误、解析错误等都有友好提示
- **快捷操作**：支持 ESC 键关闭、点击外部关闭等

## 测试

### 测试页面
提供了 `tests/test-bug-links.html` 测试页面，包含：
- 应该显示查看按钮的链接示例
- 不应该显示查看按钮的链接示例
- 实际功能测试（Data URI 格式的 JSON）
- 动态添加链接的测试

### 测试步骤
1. 在 Chrome 中加载扩展
2. 打开测试页面
3. 验证按钮是否正确显示
4. 测试点击功能是否正常
5. 验证模态框显示和交互

## 兼容性

- **浏览器**：Chrome 88+（Manifest V3）
- **安全性**：支持 CSP 策略
- **性能**：使用 MutationObserver 优化性能
- **错误处理**：网络错误、CORS 错误等场景的处理

## 文件修改清单

### 新增功能的文件修改：
- `src/content/content.js` - 添加 BugLinkDetector 和 ContentModalManager 类
- `src/content/inject.css` - 添加查看按钮和模态框样式
- `src/background/background.js` - 添加 fetchBugReportFromUrl 方法
- `tests/test-bug-links.html` - 测试页面
- `FEATURE_BUG_LINK_VIEWER.md` - 功能文档

### 未修改的文件：
- `src/manifest.json` - 无需修改权限
- `src/popup/` - 弹出窗口功能不受影响
- 其他现有功能保持不变

## 未来扩展

### 可能的改进方向：
1. **批量查看**：支持同时查看多个 Bug 报告
2. **搜索过滤**：在模态框中添加搜索功能
3. **报告对比**：对比不同 Bug 报告的差异
4. **导出功能**：从查看器直接导出报告
5. **分享功能**：生成报告分享链接

### 性能优化：
1. **虚拟滚动**：处理大量数据时的性能优化
2. **懒加载**：按需加载图片和大数据
3. **缓存机制**：避免重复下载同一文件
