import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
        { path: 'notifications', name: 'Notifications', component: () => import('@/views/notifications/AdminNotificationsView.vue') },
        { path: 'team-announcements', name: 'TeamAnnouncements', component: () => import('@/views/team-announcements/TeamAnnouncementsView.vue') },
        { path: 'users', name: 'Users', component: () => import('@/views/users/UserListView.vue') },
        { path: 'face-verifications', name: 'FaceVerifications', component: () => import('@/views/users/FaceVerificationsView.vue') },
        { path: 'users/:id', name: 'UserDetail', component: () => import('@/views/users/UserDetailView.vue') },
        { path: 'special-ids', name: 'SpecialIds', component: () => import('@/views/special-ids/SpecialIdListView.vue') },
        { path: 'rooms', name: 'Rooms', component: () => import('@/views/rooms/RoomListView.vue') },
        { path: 'rooms/:id', name: 'RoomDetail', component: () => import('@/views/rooms/RoomDetailView.vue') },
        { path: 'gifts', name: 'Gifts', component: () => import('@/views/gifts/GiftListView.vue') },
        { path: 'gifts/transactions', name: 'GiftTransactions', component: () => import('@/views/gifts/GiftTransactionsView.vue') },
        { path: 'gifts/platform-revenue', name: 'PlatformRevenue', component: () => import('@/views/gifts/PlatformRevenueView.vue') },
        { path: 'gifts/commission-config', name: 'CommissionConfig', component: () => import('@/views/gifts/CommissionConfigView.vue') },
        { path: 'wallets', name: 'Wallets', component: () => import('@/views/payments/WalletListView.vue') },
        { path: 'transactions', name: 'WalletTransactions', component: () => import('@/views/payments/WalletTransactionsView.vue') },
        { path: 'purchases', name: 'CoinPurchases', component: () => import('@/views/payments/CoinPurchaseHistoryView.vue') },
        { path: 'withdrawals', name: 'Withdrawals', component: () => import('@/views/payments/WithdrawalListView.vue') },
        { path: 'payroll-agents', name: 'PayrollAgents', component: () => import('@/views/payments/PayrollAgentsView.vue') },
        { path: 'seller-recharge-settings', name: 'SellerRechargeSettings', component: () => import('@/views/payments/SellerRechargeSettingsView.vue') },
        { path: 'seller-recharges', name: 'SellerRecharges', component: () => import('@/views/payments/SellerRechargeListView.vue') },
        { path: 'seller-exchanges', name: 'SellerExchanges', component: () => import('@/views/payments/SellerExchangeListView.vue') },
        { path: 'currencies', name: 'Currencies', component: () => import('@/views/payments/CurrencyRatesView.vue') },
        { path: 'moderation', name: 'Moderation', component: () => import('@/views/moderation/ModerationView.vue') },
        { path: 'settings', name: 'Settings', component: () => import('@/views/settings/SettingsView.vue') },
        { path: 'audit-log', name: 'AuditLog', component: () => import('@/views/audit/AuditLogView.vue') },
        { path: 'host-applications', name: 'HostApplications', component: () => import('@/views/hosts/HostApplicationsView.vue') },
        { path: 'analytics', name: 'Analytics', component: () => import('@/views/analytics/AnalyticsView.vue') },
        { path: 'staff', name: 'Staff', component: () => import('@/views/staff/StaffView.vue') },
        { path: 'agencies', name: 'Agencies', component: () => import('@/views/agencies/AgencyListView.vue') },
        { path: 'host-change-requests', name: 'HostChangeRequests', component: () => import('@/views/agencies/HostChangeRequestsView.vue') },
        { path: 'agent-applications', name: 'AgentApplications', component: () => import('@/views/agencies/AgentApplicationsView.vue') },
        { path: 'designated-become-agency-admins', name: 'DesignatedBecomeAgencyAdmins', component: () => import('@/views/agencies/DesignatedBecomeAgencyAdminsView.vue') },
        { path: 'agency-invitations', name: 'AgencyInvitations', component: () => import('@/views/agencies/AgencyInvitationsView.vue') },
        { path: 'agency-learn-promotions', name: 'AgencyLearnPromotions', component: () => import('@/views/agencies/AgencyLearnPromotionsView.vue') },
        { path: 'games', name: 'Games', component: () => import('@/views/games/GameListView.vue') },
        { path: 'roles', name: 'CustomRoles', component: () => import('@/views/roles/CustomRolesView.vue') },
        { path: 'events', name: 'Events', component: () => import('@/views/events/EventsView.vue') },
        { path: 'banners', name: 'Banners', component: () => import('@/views/banners/BannersView.vue') },
        { path: 'themes', name: 'Themes', component: () => import('@/views/themes/ThemesView.vue') },
        { path: 'risk-control', name: 'RiskControl', component: () => import('@/views/risk-control/RiskControlView.vue') },
        { path: 'master-wallet', name: 'MasterWallet', component: () => import('@/views/master-wallet/MasterWalletView.vue') },
        { path: 'support-tickets', name: 'SupportTickets', component: () => import('@/views/support/SupportTicketsView.vue') },
        { path: 'store', name: 'StoreManagement', component: () => import('@/views/store/StoreManagementView.vue') },
        { path: 'families', name: 'Families', component: () => import('@/views/families/FamilyListView.vue') },
        { path: 'level-tasks', name: 'LevelTasks', component: () => import('@/views/level-tasks/LevelTasksView.vue') },
        { path: 'seller-coins', name: 'SellerCoins', component: () => import('@/views/payments/SellerCoinsView.vue') },
        { path: 'payroll', name: 'Payroll', component: () => import('@/views/payroll/PayrollView.vue') },
        { path: 'bd', name: 'BdManagement', component: () => import('@/views/bd/BdManagementView.vue') },
        { path: 'bd/:id', name: 'BdDetail', component: () => import('@/views/bd/BdDetailView.vue') },
        { path: 'admin-management', name: 'AdminManagement', component: () => import('@/views/admins/AdminManagementView.vue') },
        {
          path: 'admins',
          redirect: (to) => ({ path: '/admin-management', query: { ...to.query, tab: 'accounts' } }),
        },
        { path: 'cs-management', name: 'CsManagement', component: () => import('@/views/cs/CsManagementView.vue') },
        { path: 'hosts', name: 'Hosts', component: () => import('@/views/hosts/HostListView.vue') },
        { path: 'hosts/abuse', name: 'HostAbuse', component: () => import('@/views/hosts/HostAbuseView.vue') },
        { path: 'regions', name: 'Regions', component: () => import('@/views/settings/RegionsView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'Login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { path: '/dashboard' }
  }

  // Fetch admin profile if authenticated but not loaded
  if (auth.isAuthenticated && !auth.admin) {
    await auth.fetchMe()
    if (!auth.isAuthenticated) return { name: 'Login' }
  }
})

export default router
