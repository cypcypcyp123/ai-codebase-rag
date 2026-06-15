# UI 组件适配说明

当前仓库未包含 ouryun-design 或 sc-ui 参考实现。后续接入前端交互控件时，应优先在本目录建立统一适配层，并按以下顺序选型：

1. ouryun-design 组件
2. 经确认后的 Element Plus 组件
3. 不直接在业务页面使用原生表单控件

涉及组件 API、Props、Events、Slots 或样式能力时，需要先查看 ouryun-design 文档或源码，不按 Element Plus API 进行假设。
