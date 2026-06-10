import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/'),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/privacy-policy',
      name: 'PrivacyPolicy',
      component: () => import('@/views/legal/PrivacyPolicyView.vue'),
    },
    {
      path: '/terms',
      name: 'Terms',
      component: () => import('@/views/legal/TermsView.vue'),
    },
    {
      path: '/community-guidelines',
      name: 'CommunityGuidelines',
      component: () => import('@/views/legal/CommunityGuidelinesView.vue'),
    },
    {
      path: '/delete-account',
      name: 'DeleteAccount',
      component: () => import('@/views/DeleteAccountView.vue'),
    },
    {
      path: '/invite',
      name: 'Invite',
      component: () => import('@/views/InviteView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
