import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/app',
      name: 'app',
      component: () => import('@/views/AppView.vue'),
    },
    {
      path: '/room',
      name: 'room-lobby',
      component: () => import('@/views/RoomView.vue'),
    },
    {
      path: '/room/:code',
      name: 'room',
      component: () => import('@/views/RoomView.vue'),
      props: true,
    },
  ],
})
