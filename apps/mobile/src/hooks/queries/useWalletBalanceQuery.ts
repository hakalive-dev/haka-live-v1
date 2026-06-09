import { useQuery } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';

import { walletApi } from '@api/wallet';
import { queryKeys } from '@api/queryKeys';
import { setWalletBalance } from '@store/walletSlice';
import type { RootState } from '@store/index';
import type { WalletBalance } from '@/types';

/**
 * Wallet balance: Redux is the UI source of truth; React Query syncs from the API.
 */
export function useWalletBalanceQuery(options?: { enabled?: boolean }) {
  const dispatch = useDispatch();
  const wallet = useSelector((s: RootState) => s.wallet);

  const query = useQuery({
    queryKey: queryKeys.wallet.balance(),
    queryFn: async (): Promise<WalletBalance> => {
      const balance = await walletApi.getBalance();
      dispatch(setWalletBalance(balance));
      return balance;
    },
    staleTime: 180_000,
    enabled: options?.enabled ?? true,
  });

  return {
    coinBalance: wallet.coinBalance,
    beanBalance: wallet.beanBalance,
    loaded: wallet.loaded,
    balance: wallet.loaded
      ? { coinBalance: wallet.coinBalance, beanBalance: wallet.beanBalance }
      : query.data ?? null,
    ...query,
  };
}
