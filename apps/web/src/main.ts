import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import { router } from './router'
import 'element-plus/dist/index.css'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import '@fontsource/ma-shan-zheng'
import './styles/main.css'

createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
