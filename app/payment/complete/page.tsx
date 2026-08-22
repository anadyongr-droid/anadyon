import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment status | Anadyon Rentals",
  robots: { index: false, follow: false },
};

const COPY = {
  paid: {
    title: "Payment received",
    body: "Thank you. Your deposit was verified securely and your reservation has been updated.",
    colour: "text-green-700",
  },
  pending: {
    title: "Payment verification pending",
    body: "We are checking the payment with the bank. Please do not pay again. Anadyon will contact you if anything else is needed.",
    colour: "text-amber-700",
  },
  error: {
    title: "Payment was not completed",
    body: "No payment has been recorded. You can close this page and contact Anadyon if you need assistance.",
    colour: "text-red-700",
  },
} as const;

export default async function PaymentCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status;
  const copy = status === "paid" ? COPY.paid : status === "pending" ? COPY.pending : COPY.error;

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center px-5 py-16">
      <section className="w-full max-w-lg rounded-2xl bg-white border border-stone-200 shadow-sm p-8 text-center">
        <p className="text-sm font-semibold tracking-[0.18em] uppercase text-blue-800">Anadyon Rentals</p>
        <h1 className={`mt-4 text-2xl font-bold ${copy.colour}`}>{copy.title}</h1>
        <p className="mt-4 text-stone-600 leading-7">{copy.body}</p>
        <Link
          href="/"
          className="inline-flex mt-7 rounded-lg bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900"
        >
          Return to Anadyon
        </Link>
      </section>
    </main>
  );
}
