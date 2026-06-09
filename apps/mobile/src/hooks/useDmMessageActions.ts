import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { chatApi } from '@api/chat';
import { formatApiError } from '@api/client';
import { moderationApi } from '@api/moderation';
import { useDMConnection } from '@hooks/useDMConnection';
import type { DirectMessage } from '@/types';
import {
  getDmActionAvailability,
  getDmCopyText,
  type DmMessageActionKey,
} from '@/utils/dmMessageActions';

const REPORT_REASONS = ['Spam', 'Harassment', 'Inappropriate content', 'Other'] as const;

type Options = {
  currentUserId?: string;
  threadPartnerId?: string;
  messages: DirectMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DirectMessage[]>>;
};

export function useDmMessageActions({
  currentUserId,
  threadPartnerId,
  messages,
  setMessages,
}: Options) {
  const { dmEvent } = useDMConnection();
  const [selectedMessage, setSelectedMessage] = useState<DirectMessage | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [forwardPickerVisible, setForwardPickerVisible] = useState(false);

  const isMine = selectedMessage?.sender.id === currentUserId;

  const availability = useMemo(() => {
    if (!selectedMessage || !currentUserId) {
      return { copy: false, forward: false, delete: false, report: false };
    }
    return getDmActionAvailability(selectedMessage, selectedMessage.sender.id === currentUserId);
  }, [currentUserId, selectedMessage]);

  const openActions = useCallback((message: DirectMessage) => {
    if (message.isDeleted) return;
    setSelectedMessage(message);
    setActionSheetVisible(true);
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetVisible(false);
  }, []);

  const applyDeleteResult = useCallback(
    (messageId: string, result: { messageId: string; hidden: true } | DirectMessage) => {
      if ('hidden' in result && result.hidden) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ...(result as DirectMessage) } : m)),
      );
    },
    [setMessages],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedMessage) return;

    const runDelete = async (mode: 'for_me' | 'for_everyone') => {
      try {
        const result = await chatApi.deleteDMMessage(selectedMessage.id, mode);
        applyDeleteResult(selectedMessage.id, result);
      } catch (err) {
        Alert.alert('Delete failed', formatApiError(err));
      }
    };

    if (isMine) {
      Alert.alert('Delete message', 'Choose who should no longer see this message.', [
        { text: 'Delete for me', onPress: () => void runDelete('for_me') },
        {
          text: 'Delete for everyone',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete for everyone?',
              'This message will be removed for both participants.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => void runDelete('for_everyone'),
                },
              ],
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Delete message', 'Remove this message from your chat?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => void runDelete('for_me'),
        },
      ]);
    }
  }, [applyDeleteResult, isMine, selectedMessage]);

  const submitReport = useCallback(
    async (reason: string, description = '') => {
      if (!selectedMessage || !threadPartnerId) return;
      try {
        await moderationApi.report(
          'message',
          selectedMessage.id,
          reason,
          description || `dm:${threadPartnerId}`,
        );
        Alert.alert('Report submitted', 'We will review this message shortly.');
      } catch (err) {
        Alert.alert('Report failed', formatApiError(err));
      }
    },
    [selectedMessage, threadPartnerId],
  );

  const handleReport = useCallback(() => {
    Alert.alert('Report message', 'Why are you reporting this message?', [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => {
          if (reason === 'Other') {
            Alert.prompt?.(
              'Additional details',
              'Optional description',
              (text) => void submitReport(reason, text ?? ''),
            );
            if (!Alert.prompt) {
              void submitReport(reason);
            }
          } else {
            void submitReport(reason);
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [submitReport]);

  const handleCopy = useCallback(async () => {
    if (!selectedMessage) return;
    const text = getDmCopyText(selectedMessage);
    if (!text) {
      Alert.alert('Copy unavailable', 'There is no text to copy for this message.');
      return;
    }
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }, [selectedMessage]);

  const handleForwardSelect = useCallback(
    async (recipientId: string) => {
      if (!selectedMessage) return;
      try {
        await chatApi.forwardDMMessage(selectedMessage.id, recipientId);
        Alert.alert('Forwarded', 'Message sent.');
      } catch (err) {
        Alert.alert('Forward failed', formatApiError(err));
      }
    },
    [selectedMessage],
  );

  const onActionSelect = useCallback(
    (action: DmMessageActionKey) => {
      closeActionSheet();
      if (!selectedMessage) return;

      switch (action) {
        case 'copy':
          void handleCopy();
          break;
        case 'forward':
          setForwardPickerVisible(true);
          break;
        case 'delete':
          void handleDelete();
          break;
        case 'report':
          handleReport();
          break;
        default:
          break;
      }
    },
    [closeActionSheet, handleCopy, handleDelete, handleReport, selectedMessage],
  );

  useEffect(() => {
    if (dmEvent?.event !== 'dm:deleted') return;
    const payload = dmEvent.data as { messageId?: string };
    if (!payload.messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === payload.messageId
          ? { ...m, content: '', mediaUrl: null, isDeleted: true }
          : m,
      ),
    );
  }, [dmEvent, setMessages]);

  return {
    actionSheetVisible,
    forwardPickerVisible,
    availability,
    openActions,
    closeActionSheet,
    onActionSelect,
    setForwardPickerVisible,
    handleForwardSelect,
    threadPartnerId,
  };
}
