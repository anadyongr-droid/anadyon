import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; review?: string }>;
}) {
  const { reference, review } = await searchParams;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-20 dark:bg-gray-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm dark:border-green-900 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-green-800 dark:text-green-300">Payment received</h1>
        {review ? (
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            Your payment was received and is being checked by our team. We will contact you shortly.
          </p>
        ) : (
          <p className="mt-4 text-gray-700 dark:text-gray-300">
            We have received your payment and your booking is now confirmed. A confirmation email has been sent to you.
          </p>
        )}
        {reference && <p className="mt-4 font-mono font-semibold text-gray-900 dark:text-white">Reference: {reference}</p>}
        <p className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          Η πληρωμή σας παραλήφθηκε. Θα λάβετε email επιβεβαίωσης της κράτησής σας.
        </p>
      </section>
    </main>
  );
}
