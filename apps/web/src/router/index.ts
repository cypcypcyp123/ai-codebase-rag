import { createRouter, createWebHistory } from 'vue-router'
import KnowledgeHome from '@/views/KnowledgeHome.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'knowledge-home',
      component: KnowledgeHome
    }
  ]
})
