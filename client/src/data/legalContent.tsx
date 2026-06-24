import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ marginBottom: '8px' }}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 8px 0', paddingLeft: '20px' }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: '4px' }}>{item}</li>
      ))}
    </ul>
  );
}

export function PrivacyPolicyContent() {
  return (
    <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7 }}>
      <P>Last updated: June 2026</P>
      <P>
        PriceRight is developed by TheRightHub. This policy explains what information we collect and how we use it.
      </P>

      <Section title="Information we collect">
        <P>
          When you activate a trial or purchase a licence we collect your email address. This is used to:
        </P>
        <Ul items={[
          'Send your trial activation confirmation',
          'Deliver your licence key after purchase',
          'Contact you about your account',
        ]} />
      </Section>

      <Section title="Your business data">
        <P>
          All your business data — materials, products, prices, and costs — is stored locally on your computer in a SQLite database file. This data never leaves your computer and is never transmitted to our servers.
        </P>
      </Section>

      <Section title="Licence verification">
        <P>
          When PriceRight launches it contacts our licence server to verify your licence status. This check sends only your machine ID and licence key. No business data is transmitted.
        </P>
      </Section>

      <Section title="Data retention">
        <P>
          Your email address and licence information are stored on our secure servers hosted on Railway. You may request deletion of your account data at any time by emailing hello@therighthub.com.
        </P>
      </Section>

      <Section title="Third party services">
        <P>We use the following services:</P>
        <Ul items={[
          'Railway — licence server hosting',
          'Resend — email delivery',
          'Paystack — payment processing',
        ]} />
        <P>Each service has its own privacy policy.</P>
      </Section>

      <Section title="Contact">
        <P>For privacy questions contact: hello@therighthub.com</P>
      </Section>
    </div>
  );
}

export function TermsOfServiceContent() {
  return (
    <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7 }}>
      <P>Last updated: June 2026</P>
      <P>These terms govern your use of PriceRight software developed by TheRightHub.</P>

      <Section title="Licence">
        <P>
          PriceRight is sold as a single-user licence. One licence permits use on one computer by one person. You may not share, transfer, or resell your licence.
        </P>
      </Section>

      <Section title="Trial period">
        <P>
          A 14-day free trial is provided. No payment is required to start a trial. After 14 days access is locked until a licence is purchased.
        </P>
      </Section>

      <Section title="Payment">
        <P>
          Licences are billed annually. All prices are in the currency configured in your PriceRight settings. The default currency is GHS (Ghana Cedis). Payments are processed securely by Paystack.
        </P>
      </Section>

      <Section title="Refunds">
        <P>
          All sales are final. No refunds are provided after a licence key has been issued. If you experience technical issues contact hello@therighthub.com and we will work to resolve them.
        </P>
      </Section>

      <Section title="Acceptable use">
        <P>
          PriceRight is business software. You may not use it for any illegal purpose or in any way that violates applicable laws in your jurisdiction.
        </P>
      </Section>

      <Section title="Warranty disclaimer">
        <P>
          PriceRight is provided as-is without warranty of any kind. TheRightHub is not liable for any loss of data or business losses arising from use of the software.
        </P>
      </Section>

      <Section title="Data ownership">
        <P>
          All business data you enter into PriceRight belongs to you. You can export and delete your data at any time.
        </P>
      </Section>

      <Section title="Governing law">
        <P>These terms are governed by the laws of Ghana.</P>
      </Section>

      <Section title="Changes to these terms">
        <P>
          We may update these terms from time to time. Continued use of PriceRight after changes constitutes acceptance of the new terms.
        </P>
      </Section>

      <Section title="Contact">
        <P>hello@therighthub.com</P>
      </Section>
    </div>
  );
}
