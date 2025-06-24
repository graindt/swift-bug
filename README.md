# Swift Bug 插件

一个用于保存和复现Web应用Bug的Chrome浏览器插件。

## 项目概述

这是一个Chrome扩展插件，帮助开发者和测试人员快速保存当前页面的完整状态信息，包括网址、用户会话数据和控制台输出，并支持导出为文件以及导入还原现场，便于Bug的复现和调试。

## 核心功能

### 1. Bug快照保存
- 自动获取当前页面URL
- 保存用户会话数据（Cookies、LocalStorage、SessionStorage）
- 捕获控制台输出内容（包括错误、警告、日志）
- 记录页面基本信息（时间戳、用户代理等）

### 2. 数据导出
- 将保存的Bug快照导出为JSON文件
- 支持批量导出多个Bug记录
- 文件命名规则：swiftbug-report-{timestamp}.json

### 3. 数据导入与还原
- 支持导入之前导出的Bug快照文件
- 自动还原页面会话数据
- 重定向到Bug发生的原始页面
- 重新注入存储数据到浏览器

### 4. 用户界面
- 简洁的弹出窗口界面
- 一键保存当前Bug状态
- Bug记录列表管理
- 导入/导出功能按钮

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
  "cookies": "页面Cookies",
  "localStorage": "本地存储数据",
  "sessionStorage": "会话存储数据",
  "consoleLog": "控制台输出记录",
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

## 用户使用流程

### 保存Bug快照
1. 在发生Bug的页面上点击插件图标
2. 在弹出窗口中点击"保存Bug快照"
3. 可选：添加Bug描述信息
4. 系统自动收集页面状态信息并保存

### 导出Bug数据
1. 打开插件弹出窗口
2. 查看已保存的Bug记录列表
3. 选择要导出的记录
4. 点击"导出"按钮下载JSON文件

### 导入并还原Bug现场
1. 点击插件的"导入Bug"功能
2. 选择之前导出的JSON文件
3. 系统自动跳转到Bug页面
4. 还原所有会话数据和存储信息
5. 开发者可以重现Bug场景

## 开发计划

### Phase 1: 基础功能
- [ ] 创建插件基础结构
- [ ] 实现数据收集功能
- [ ] 创建简单的Popup界面
- [ ] 实现本地存储功能

### Phase 2: 导入导出
- [ ] 实现数据导出为JSON文件
- [ ] 实现JSON文件导入功能
- [ ] 实现数据还原到浏览器

### Phase 3: 界面优化
- [ ] 优化用户界面设计
- [ ] 添加Bug记录管理功能
- [ ] 实现批量操作

### Phase 4: 高级功能
- [ ] 添加Bug描述和标签功能
- [ ] 实现数据搜索和过滤
- [ ] 添加设置页面
- [ ] 性能优化和错误处理

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
│   └── content.js
├── background/            # 后台脚本
│   └── background.js
├── options/               # 设置页面
│   ├── options.html
│   ├── options.js
│   └── options.css
├── icons/                 # 插件图标
└── utils/                 # 工具函数
    └── storage.js
```

## 注意事项

1. **隐私保护**: 确保敏感数据（如密码、token）不会被意外保存
2. **数据安全**: 导出的文件可能包含敏感信息，需要提醒用户注意保护
3. **兼容性**: 确保插件在不同版本的Chrome浏览器中正常工作
4. **性能**: 避免过度收集数据影响页面性能
5. **用户体验**: 提供清晰的操作指引和错误提示
