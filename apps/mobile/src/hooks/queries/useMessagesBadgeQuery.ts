import { useQuery } from '@tanstack/react-query';

import { chatApi } from '@api/chat';
import { queryKeys } from '@api/queryKeys';

export function useMessagesBadgeQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.chat.messagesBadge(),
    queryFn: () => chatApi.getMessagesBadgeCount(),
    staleTime: 15_000,
    enabled,
  });
}
