import { useQuery } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';

import { coinSellerApi } from '@api/coinSeller';
import { queryKeys } from '@api/queryKeys';
import { setWalletBalance } from '@store/walletSlice';
import type { AgencySummaryV2, CoinSellerProfile, WalletBalance } from '@/types';

export type CoinSellerBootstrapData = {
  profile: CoinSellerProfile;
  agencySummary: AgencySummaryV2 | null;
  wallet: WalletBalance;
};

export function useCoinSellerBootstrapQuery(options?: { enabled?: boolean }) {
  const dispatch = useDispatch();

  return useQuery({
    queryKey: queryKeys.coinSeller.bootstrap(),
    queryFn: async (): Promise<CoinSellerBootstrapData> => {
      const data = await coinSellerApi.getBootstrap();
      dispatch(setWalletBalance(data.wallet));
      return data;
    },
    staleTime: 300_000,
    enabled: options?.enabled ?? true,
  });
}
