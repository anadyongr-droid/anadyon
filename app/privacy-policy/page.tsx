export default function PrivacyPolicy() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Privacy Policy &amp; Cookie Notice</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: August 2026</p>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">1. Who We Are</h2>
            <p>
              Anadyon Rentals is a vehicle rental company based at 20 Lomvardou Str. (Seafront Road, Zakynthos Town), 29100 Zakynthos, Greece.
              We are the data controller for the personal information collected through this website.
              You can reach us at{" "}
              <a href="mailto:customerservice@anadyon.gr" className="text-orange-600 hover:underline dark:text-orange-400">customerservice@anadyon.gr</a>{" "}
              or by phone at +30 26950 41878.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">2. What Data We Collect and Why</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Data</th>
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Purpose</th>
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Legal basis (GDPR Art. 6)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Name, email, phone</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Processing your rental quote and communicating about your booking</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Date of birth</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Verifying minimum driver age and applying applicable surcharges</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Address, postal code, city, country</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Issuing rental agreements and invoices</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Contact form message</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Responding to your enquiry</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Art. 6(1)(f) — legitimate interest</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Website usage data (via cookies)</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Analysing site traffic to improve our service (only with your consent)</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Art. 6(1)(a) — consent</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">3. Third-Party Processors</h2>
            <ul className="list-disc ml-6 space-y-2 text-sm">
              <li>
                <strong>Google Analytics</strong> — used to analyse site traffic, only loaded after you give cookie consent.
                Data is processed by Google LLC (US). See{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Google&apos;s Privacy Policy</a>.
              </li>
              <li>
                <strong>Google reCAPTCHA</strong> — used on our booking and contact forms to prevent spam.
                Governed by Google&apos;s{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Privacy Policy</a>{" "}
                and{" "}
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Terms of Service</a>.
              </li>
              <li>
                <strong>Resend</strong> — our transactional email provider, used to send you booking confirmation emails.
                See{" "}
                <a href="https://resend.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Resend&apos;s Privacy Policy</a>.
              </li>
            </ul>
            <p className="mt-3 text-sm">We do not sell your personal data to any third party.</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">4. Data Retention</h2>
            <p className="text-sm">
              Booking-related data is retained for 5 years from the date of your rental in accordance with Greek tax and commercial law.
              Contact enquiries not resulting in a booking are deleted after 12 months.
              You may request earlier deletion — see Section 6.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">5. Cookies</h2>
            <p className="text-sm mb-3">We use the following cookies:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Cookie</th>
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Type</th>
                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-mono text-xs">cookie_consent</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Essential</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Stores your cookie preference (localStorage)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600 font-mono text-xs">_ga, _ga_*</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Analytics</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">Google Analytics — only set with your consent</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3">
              You can change your cookie preference at any time by clearing your browser&apos;s local storage for this site, which will show the consent banner again on your next visit.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">6. Your Rights</h2>
            <p className="text-sm mb-2">Under the GDPR you have the right to:</p>
            <ul className="list-disc ml-6 space-y-1 text-sm">
              <li><strong>Access</strong> — request a copy of the personal data we hold about you (Art. 15)</li>
              <li><strong>Rectification</strong> — ask us to correct inaccurate data (Art. 16)</li>
              <li><strong>Erasure</strong> — ask us to delete your data where there is no overriding legal obligation to retain it (Art. 17)</li>
              <li><strong>Restriction</strong> — ask us to restrict processing in certain circumstances (Art. 18)</li>
              <li><strong>Portability</strong> — receive your data in a machine-readable format (Art. 20)</li>
              <li><strong>Object</strong> — object to processing based on legitimate interest (Art. 21)</li>
              <li><strong>Withdraw consent</strong> — withdraw cookie consent at any time without affecting prior processing</li>
            </ul>
            <p className="text-sm mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:customerservice@anadyon.gr" className="text-orange-600 hover:underline dark:text-orange-400">customerservice@anadyon.gr</a>.
              We will respond within 30 days. If you are not satisfied with our response, you have the right to lodge a complaint with the{" "}
              <a href="https://www.dpa.gr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Hellenic Data Protection Authority (HDPA)</a>.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">7. Changes to This Policy</h2>
            <p className="text-sm">
              We may update this policy from time to time. The &quot;Last updated&quot; date at the top of this page indicates when the most recent changes were made.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
