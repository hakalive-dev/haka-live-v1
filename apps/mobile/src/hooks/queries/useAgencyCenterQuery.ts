import { useQuery } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';

import { agencyApi } from '@api/agency';
import { queryKeys } from '@api/queryKeys';
import { setWalletBalance } from '@store/walletSlice';
import type { AgencyHost, AgencySummary, AgencySummaryV2 } from '@/types';
import type { WalletBalance } from '@/types';

export type AgencyCenterData = {
  summary: AgencySummary;
  summaryV2: AgencySummaryV2;
  hosts: AgencyHost[];
  wallet: WalletBalance;
};

export function useAgencyCenterQuery(options?: { enabled?: boolean }) {
  const dispatch = useDispatch();

  return useQuery({
    queryKey: queryKeys.agency.center(),
    queryFn: async (): Promise<AgencyCenterData> => {
      const data = await agencyApi.getCenterBootstrap();
      dispatch(setWalletBalance(data.wallet));
      return data;
    },
    staleTime: 120_000,
    enabled: options?.enabled ?? true,
  });
}
