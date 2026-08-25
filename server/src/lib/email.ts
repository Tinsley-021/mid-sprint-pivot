export interface EmailSender {
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  sendEmailVerification(to: string, verifyUrl: string): Promise<void>;
  sendTeamInvite(to: string, name: string, organizationName: string, setPasswordUrl: string): Promise<void>;
}

/**
 * Dev-only sender: logs links instead of emailing them, so registration and
 * password reset are fully testable without SMTP credentials. Swap this for a
 * real provider (Postmark, SendGrid, SES...) behind the same interface before
 * going to production — nothing calling emailSender needs to change to do that.
 */
export class ConsoleEmailSender implements EmailSender {
  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n[dev email] Password reset requested for ${to}`);
    // eslint-disable-next-line no-console
    console.log(`[dev email] Reset link: ${resetUrl}\n`);
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n[dev email] Verification requested for ${to}`);
    // eslint-disable-next-line no-console
    console.log(`[dev email] Verify link: ${verifyUrl}\n`);
  }

  async sendTeamInvite(to: string, name: string, organizationName: string, setPasswordUrl: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n[dev email] ${name} <${to}> was invited to join ${organizationName} on RetailSync`);
    // eslint-disable-next-line no-console
    console.log(`[dev email] Set-password link: ${setPasswordUrl}\n`);
  }
}

export const emailSender: EmailSender = new ConsoleEmailSender();
