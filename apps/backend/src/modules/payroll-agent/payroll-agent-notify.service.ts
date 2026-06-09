import { getHakaTeamUserId } from '../../constants/haka-team';
import { createNotification } from '../notifications/notifications.service';
import { insertServerDirectMessage } from '../chat/chat.service';

const DM_TYPE_PAYROLL = 'payroll_agent';

async function sendHakaTeamDm(recipientId: string, content: string): Promise<void> {
  const hakaTeamId = getHakaTeamUserId();
  await insertServerDirectMessage({
    senderId: hakaTeamId,
    recipientId,
    content,
    messageType: DM_TYPE_PAYROLL,
  });
}

/** User was promoted to country payroll agent (admin created profile). */
export async function notifyUserPromotedToPayrollAgent(
  userId: string,
  countryCode: string,
  payrollId: string,
  keptPrimaryRole = false,
): Promise<void> {
  const title = 'Payroll agent access';
  const body = `You are now the payroll agent for ${countryCode}. Open Profile → Payroll to process withdrawals.`;
  const reLoginHint = keptPrimaryRole
    ? 'Open Profile to see the new Payroll button (your agency role is unchanged).'
    : 'Please sign in again if you do not see the Payroll button.';
  const dm = `You have been assigned as Haka Live payroll agent for ${countryCode} (ID: ${payrollId}). Open your Profile and tap Payroll to view assigned payout requests. ${reLoginHint}`;

  await createNotification(
    userId,
    'payroll_agent_promoted',
    title,
    body,
    { type: 'payroll_agent_promoted', countryCode, payrollId, open: 'payroll' },
    undefined,
    { highPriority: true },
  );
  await sendHakaTeamDm(userId, dm);
}

/** Admin assigned a withdrawal to this agent for payout. */
export async function notifyWithdrawalAssignedToAgent(
  agentUserId: string,
  withdrawalId: string,
  beans: number,
  countryCode: string,
): Promise<void> {
  const title = 'New withdrawal assigned';
  const body = `Process ${beans.toLocaleString()} beans payout (${countryCode})`;
  const dm = `A withdrawal of ${beans.toLocaleString()} beans (${countryCode}) has been assigned to you. Open Payroll to pay the user and upload payment proof. Order: ${withdrawalId}`;

  await createNotification(
    agentUserId,
    'withdrawal_assigned',
    title,
    body,
    { type: 'withdrawal_assigned', withdrawalId, open: 'payroll' },
    undefined,
    { highPriority: true },
  );
  await sendHakaTeamDm(agentUserId, dm);
}
