# Swift Bug 插件

一个用于保存和复现Web应用Bug的Chrome浏览器插件。

## 项目概述

这是一个Chrome扩展插件，帮助开发者和测试人员快速保存当前页面的完整状态信息，包括网址、用户会话数据、控制台输出、网络请求、页面截图等，并支持导出为文件以及导入还原现场，便于Bug的复现和调试。

## 核心功能

### 1. Bug快照保存
- 自动获取当前页面URL、标题、完整hash
- 保存用户会话数据（Cookies、LocalStorage、SessionStorage）
- 捕获控制台输出内容（包括错误、警告、日志）
- 记录页面基本信息（时间戳、用户代理、视口信息）
- 捕获页面网络请求（支持失败/全部请求，含请求体/响应体）
- 可选页面截图

### 2. 数据导出
- 将保存的Bug快照导出为JSON文件
- 支持批量导出所有Bug记录
- 文件命名规则：swiftbug-report-{domain}-{date}-{timestamp}.json

### 3. 数据导入与还原
- 支持导入之前导出的Bug快照文件
- 自动还原页面会话数据（Cookies、LocalStorage、SessionStorage）
- 重定向到Bug发生的原始页面
- 重新注入存储数据并自动刷新页面
- 支持内容脚本一键导入页面上的swiftbug-report链接

### 4. 用户界面
- 简洁的弹出窗口界面，支持查看、导出、删除、还原、导入
- Bug记录列表管理，显示域名、时间、标题等
- 支持批量导出、清空所有数据
- 设置页面可自定义采集项、数量等

## 技术架构

### 插件组件
1. **Manifest文件** - 插件配置和权限声明
2. **Content Script** - 页面内容获取和数据注入
3. **Background Script** - 后台数据处理和存储
4. **Popup页面** - 用户交互界面
5. **Options页面** - 插件设置页面

### 数据结构
```json
{
  "id": "唯一标识符",
  "timestamp": "保存时间",
  "url": "页面URL",
  "title": "页面标题",
  "userAgent": "浏览器信息",
  "cookies": [/* Cookie数组 */],
  "localStorage": {/* 本地存储数据 */},
  "sessionStorage": {/* 会话存储数据 */},
  "consoleLog": [/* 控制台输出记录 */],
  "networkRequests": [/* 网络请求记录 */],
  "screenshot": "页面截图Base64（可选）",
  "viewport": {/* 视口信息 */},
  "description": "Bug描述（可选）"
}
```

### 权限需求
- `activeTab` - 访问当前活动标签页
- `storage` - 本地数据存储
- `cookies` - 读取和设置Cookies
- `downloads` - 文件下载功能
- `tabs` - 标签页管理
- `scripting` - 脚本注入
- `webRequest` - 网络请求捕获

## 用户使用流程

### 保存Bug快照
1. 在发生Bug的页面上点击插件图标
2. 在弹出窗口中点击"保存Bug快照"
3. 可选：添加Bug描述信息
4. 系统自动收集页面状态信息并保存

### 导出Bug数据
1. 打开插件弹出窗口
2. 查看已保存的Bug记录列表
3. 选择要导出的记录或点击设置页批量导出
4. 点击"导出"按钮下载JSON文件

### 导入并还原Bug现场
1. 点击插件的"导入Bug"功能或页面上的swiftbug-report链接
2. 选择之前导出的JSON文件或一键导入
3. 系统自动跳转到Bug页面
4. 还原所有会话数据和存储信息，自动刷新页面
5. 开发者可以重现Bug场景

## 开发进度

### Phase 1: 基础功能
- [x] 创建插件基础结构
- [x] 实现数据收集功能
- [x] 创建简单的Popup界面
- [x] 实现本地存储功能

### Phase 2: 导入导出
- [x] 实现数据导出为JSON文件
- [x] 实现JSON文件导入功能
- [x] 实现数据还原到浏览器

### Phase 3: 界面优化
- [x] 优化用户界面设计
- [x] 添加Bug记录管理功能
- [ ] 实现批量操作（已支持批量导出，批量删除/还原待完善）

### Phase 4: 高级功能
- [x] 添加Bug描述功能（标签功能待实现）
- [ ] 实现数据搜索和过滤
- [x] 添加设置页面
- [ ] 性能优化和更完善的错误处理

## 技术选型

- **开发语言**: JavaScript/TypeScript
- **UI框架**: HTML5 + CSS3 + Vanilla JavaScript
- **构建工具**: Webpack或Vite
- **测试框架**: Jest
- **代码规范**: ESLint + Prettier

## 文件结构预览
```
src/
├── manifest.json          # 插件配置文件
├── popup/                 # 弹出窗口
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/               # 内容脚本
│   ├── content.js
│   ├── consoleInterceptor.js
│   └── networkInterceptor.js
├── background/            # 后台脚本
│   └── background.js
├── options/               # 设置页面
│   ├── options.html
│   ├── options.js
│   └── options.css
├── icons/                 # 插件图标
└── utils/                 # 工具函数
    └── utils.js
```

## 注意事项

1. **隐私保护**: 确保敏感数据（如密码、token）不会被意外保存
2. **数据安全**: 导出的文件可能包含敏感信息，需要提醒用户注意保护
3. **兼容性**: 确保插件在不同版本的Chrome浏览器中正常工作
4. **性能**: 避免过度收集数据影响页面性能
5. **用户体验**: 提供清晰的操作指引和错误提示
